const supabase = require('../config/supabase');

class Restaurant {
  /**
   * 레스토랑 생성 (다중 테이블 삽입)
   */
  static async create(restaurantData) {
    const {
      name, description, address, category_id, latitude, longitude,
      phone, email, website_url,
      images = [],
      tags = [],
      business_hours,
      parking_available,
      wifi_available,
      delivery_available,
      card_payment,
      ...otherData
    } = restaurantData;

    try {
      // 1. 레스토랑 기본 정보 생성
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .insert([{
          name,
          description,
          address,
          category_id,
          latitude,
          longitude,
          ...otherData
        }])
        .select()
        .single();

      if (restaurantError) throw restaurantError;

      // 2. 연락처 정보 추가
      if (phone || email || website_url) {
        await supabase
          .from('restaurant_contacts')
          .insert([{
            restaurant_id: restaurant.id,
            phone,
            email,
            website_url
          }]);
      }

      // 3. 운영 정보 추가
      if (business_hours) {
        await supabase
          .from('restaurant_operations')
          .insert([{
            restaurant_id: restaurant.id,
            business_hours
          }]);
      }

      // 4. 시설 정보 추가
      await supabase
        .from('restaurant_facilities')
        .insert([{
          restaurant_id: restaurant.id,
          parking_available: parking_available || false,
          wifi_available: wifi_available || false
        }]);

      // 5. 서비스 정보 추가
      await supabase
        .from('restaurant_services')
        .insert([{
          restaurant_id: restaurant.id,
          delivery_available: delivery_available || false,
          card_payment: card_payment !== undefined ? card_payment : true
        }]);

      // 6. 이미지 추가
      if (images && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const imageUrl = images[i];

          // media_files 테이블에 먼저 추가
          const { data: mediaFile, error: mediaError } = await supabase
            .from('media_files')
            .insert([{
              file_url: imageUrl,
              media_type: 'image'
            }])
            .select()
            .single();

          if (!mediaError && mediaFile) {
            // restaurant_media 테이블에 연결
            await supabase
              .from('restaurant_media')
              .insert([{
                restaurant_id: restaurant.id,
                media_id: mediaFile.id,
                category: 'food',
                is_representative: i === 0, // 첫 번째 이미지를 대표 이미지로
                display_order: i
              }]);
          }
        }
      }

      // 7. 태그 추가
      if (tags && tags.length > 0) {
        const tagInserts = tags.map(tagId => ({
          restaurant_id: restaurant.id,
          tag_id: tagId
        }));

        await supabase
          .from('restaurant_tags')
          .insert(tagInserts);
      }

      return restaurant;
    } catch (error) {
      console.error('레스토랑 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 레스토랑 목록 조회 (이미지 포함)
   */
  static async findAll(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        description,
        address,
        road_address,
        rating,
        review_count,
        price_range,
        category_id,
        view_count,
        favorite_count,
        latitude,
        longitude,
        categories (
          id,
          name,
          icon,
          color
        ),
        restaurant_contacts (
          phone,
          email,
          website_url
        ),
        restaurant_media (
          id,
          category,
          is_representative,
          display_order,
          media_files (
            id,
            file_url,
            thumbnail_url,
            medium_url
          )
        )
      `)
      .eq('status', 'active')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 이미지 배열로 변환 (하위 호환성)
    return data.map(restaurant => ({
      ...restaurant,
      phone: restaurant.restaurant_contacts?.phone,
      email: restaurant.restaurant_contacts?.email,
      images: restaurant.restaurant_media
        ?.sort((a, b) => a.display_order - b.display_order)
        .map(m => m.media_files?.file_url || m.media_files?.medium_url)
        .filter(Boolean) || []
    }));
  }

  /**
   * ID로 레스토랑 조회 (간단한 버전)
   */
  static async findById(id) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon
        ),
        restaurant_contacts (
          phone,
          email,
          website_url,
          instagram_url,
          naver_place_url
        ),
        restaurant_media (
          id,
          category,
          is_representative,
          display_order,
          media_files (
            id,
            file_url,
            thumbnail_url,
            medium_url,
            large_url
          )
        ),
        restaurant_reviews (
          id,
          rating,
          title,
          content,
          created_at,
          users (
            id,
            name,
            nickname,
            avatar_url
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // 이미지 배열로 변환
    if (data) {
      data.images = data.restaurant_media
        ?.sort((a, b) => a.display_order - b.display_order)
        .map(m => m.media_files?.file_url || m.media_files?.large_url)
        .filter(Boolean) || [];

      data.phone = data.restaurant_contacts?.phone;
      data.email = data.restaurant_contacts?.email;

      // 불필요한 가격 정보 제거
      delete data.avg_price_per_person;
      delete data.price_range;
    }

    return data;
  }

  /**
   * ID로 레스토랑 상세 조회 (모든 관련 데이터 포함)
   */
  static async findByIdWithDetails(id) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon,
          color
        ),
        restaurant_contacts (
          phone,
          secondary_phone,
          email,
          website_url,
          instagram_url,
          facebook_url,
          naver_place_url,
          kakao_channel_url
        ),
        restaurant_operations (
          business_hours,
          break_time,
          last_order,
          regular_holidays,
          holiday_notice
        ),
        restaurant_facilities (
          parking_available,
          parking_spaces,
          parking_info,
          wifi_available,
          wheelchair_accessible,
          private_room,
          outdoor_seating,
          total_seats,
          pet_friendly,
          kids_menu
        ),
        restaurant_services (
          reservation_available,
          reservation_url,
          delivery_available,
          delivery_fee,
          takeout_available,
          card_payment,
          cash_payment,
          mobile_payment
        ),
        restaurant_media (
          id,
          category,
          caption,
          is_representative,
          is_featured,
          display_order,
          media_files (
            id,
            file_url,
            thumbnail_url,
            medium_url,
            large_url,
            width,
            height
          )
        ),
        restaurant_tags (
          tags (
            id,
            name,
            slug,
            icon,
            color
          )
        ),
        restaurant_delivery_apps (
          id,
          app_name,
          app_url,
          is_active
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // 데이터 정리
    if (data) {
      // 이미지를 카테고리별로 분류
      const mediaByCategory = {};
      data.restaurant_media?.forEach(m => {
        const category = m.category || 'other';
        if (!mediaByCategory[category]) {
          mediaByCategory[category] = [];
        }
        mediaByCategory[category].push({
          id: m.id,
          url: m.media_files?.large_url || m.media_files?.file_url,
          thumbnail: m.media_files?.thumbnail_url,
          medium: m.media_files?.medium_url,
          caption: m.caption,
          is_featured: m.is_featured,
          display_order: m.display_order
        });
      });

      // 각 카테고리별 이미지 정렬
      Object.keys(mediaByCategory).forEach(category => {
        mediaByCategory[category].sort((a, b) => a.display_order - b.display_order);
      });

      data.media = mediaByCategory;

      // 하위 호환성을 위한 images 배열
      data.images = data.restaurant_media
        ?.sort((a, b) => a.display_order - b.display_order)
        .map(m => m.media_files?.file_url || m.media_files?.large_url)
        .filter(Boolean) || [];

      // 연락처 정보 병합
      data.phone = data.restaurant_contacts?.phone;
      data.email = data.restaurant_contacts?.email;

      // 태그 배열로 변환
      data.tags = data.restaurant_tags?.map(rt => rt.tags).filter(Boolean) || [];

      // 불필요한 가격 정보 제거
      delete data.avg_price_per_person;
      delete data.price_range;
    }

    return data;
  }

  /**
   * 조회수 증가
   */
  static async incrementViewCount(restaurantId) {
    try {
      const { data: currentData, error: selectError } = await supabase
        .from('restaurants')
        .select('view_count')
        .eq('id', restaurantId)
        .single();

      if (selectError) throw selectError;

      const newViewCount = (currentData.view_count || 0) + 1;
      const { data: updateData, error: updateError } = await supabase
        .from('restaurants')
        .update({
          view_count: newViewCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', restaurantId)
        .select('view_count')
        .single();

      if (updateError) throw updateError;
      return updateData;
    } catch (error) {
      console.error('조회수 증가 실패:', error);
      throw error;
    }
  }

  /**
   * 카테고리별 레스토랑 조회
   */
  static async findByCategory(categoryId, limit = 50) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        description,
        address,
        road_address,
        rating,
        review_count,
        price_range,
        category_id,
        view_count,
        favorite_count,
        latitude,
        longitude,
        categories (
          id,
          name,
          icon,
          color
        ),
        restaurant_contacts (
          phone
        ),
        restaurant_media (
          id,
          is_representative,
          display_order,
          media_files (
            file_url,
            thumbnail_url,
            medium_url
          )
        )
      `)
      .eq('category_id', categoryId)
      .eq('status', 'active')
      .limit(limit)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 이미지 배열로 변환
    return data.map(restaurant => ({
      ...restaurant,
      phone: restaurant.restaurant_contacts?.phone,
      images: restaurant.restaurant_media
        ?.sort((a, b) => a.display_order - b.display_order)
        .map(m => m.media_files?.file_url || m.media_files?.medium_url)
        .filter(Boolean) || []
    }));
  }

  /**
   * 주변 레스토랑 검색 (PostGIS 사용)
   */
  static async findNearby(latitude, longitude, radiusKm = 5, limit = 50) {
    const { data, error } = await supabase
      .rpc('nearby_restaurants', {
        lat: latitude,
        lng: longitude,
        radius_km: radiusKm,
        limit_count: limit
      });

    if (error) throw error;
    return data;
  }

  /**
   * 레스토랑 업데이트
   */
  static async update(id, updateData) {
    const {
      phone, email, website_url,
      business_hours,
      parking_available, wifi_available,
      delivery_available, card_payment,
      ...restaurantData
    } = updateData;

    try {
      // 1. 레스토랑 기본 정보 업데이트
      const { data, error } = await supabase
        .from('restaurants')
        .update({
          ...restaurantData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 2. 연락처 정보 업데이트
      if (phone !== undefined || email !== undefined || website_url !== undefined) {
        await supabase
          .from('restaurant_contacts')
          .upsert({
            restaurant_id: id,
            phone,
            email,
            website_url
          });
      }

      // 3. 운영 정보 업데이트
      if (business_hours !== undefined) {
        await supabase
          .from('restaurant_operations')
          .upsert({
            restaurant_id: id,
            business_hours
          });
      }

      // 4. 시설 정보 업데이트
      if (parking_available !== undefined || wifi_available !== undefined) {
        await supabase
          .from('restaurant_facilities')
          .upsert({
            restaurant_id: id,
            parking_available,
            wifi_available
          });
      }

      // 5. 서비스 정보 업데이트
      if (delivery_available !== undefined || card_payment !== undefined) {
        await supabase
          .from('restaurant_services')
          .upsert({
            restaurant_id: id,
            delivery_available,
            card_payment
          });
      }

      return data;
    } catch (error) {
      console.error('레스토랑 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 레스토랑 삭제
   */
  static async delete(id) {
    const { error } = await supabase
      .from('restaurants')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  /**
   * 즐겨찾기 추가
   */
  static async addToFavorites(userId, restaurantId) {
    const { data, error } = await supabase
      .from('user_favorites')
      .insert([{
        user_id: userId,
        restaurant_id: restaurantId,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 즐겨찾기 제거
   */
  static async removeFromFavorites(userId, restaurantId) {
    const { error } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId);

    if (error) throw error;
    return true;
  }

  /**
   * 사용자 즐겨찾기 목록 조회
   */
  static async getUserFavorites(userId) {
    const { data, error } = await supabase
      .from('user_favorites')
      .select(`
        *,
        restaurant:restaurants (
          id,
          name,
          description,
          address,
          road_address,
          rating,
          review_count,
          price_range,
          category_id,
          view_count,
          favorite_count,
          latitude,
          longitude,
          categories (
            id,
            name,
            icon,
            color
          ),
          restaurant_contacts (
            phone
          ),
          restaurant_media (
            id,
            display_order,
            is_representative,
            media_files (
              file_url,
              thumbnail_url
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 이미지 배열로 변환 (대표 이미지만 추출)
    return data.map(fav => ({
      ...fav,
      restaurant: {
        ...fav.restaurant,
        phone: fav.restaurant.restaurant_contacts?.phone,
        images: (() => {
          const representativeMedia = fav.restaurant.restaurant_media?.find(m => m.is_representative);
          return representativeMedia?.media_files?.file_url
            ? [representativeMedia.media_files.file_url]
            : [];
        })()
      }
    }));
  }
}

module.exports = Restaurant;
