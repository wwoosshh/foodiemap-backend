const supabase = require('../config/supabase');

class Restaurant {
  static async create(restaurantData) {
    const { name, description, address, phone, category_id, latitude, longitude, images } = restaurantData;

    const { data, error } = await supabase
      .from('restaurants')
      .insert([{
        name,
        description,
        address,
        phone,
        category_id,
        location: `POINT(${longitude} ${latitude})`,
        images,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findAll(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon
        )
      `)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

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
        reviews (
          id,
          rating,
          comment,
          created_at,
          users (
            id,
            name
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async findByIdWithDetails(id) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon
        ),
        restaurant_details (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async incrementViewCount(restaurantId) {
    // restaurant_details 테이블에서 조회수 증가
    try {
      // 먼저 현재 조회수 조회 (RLS 우회를 위해 서비스 키 사용)
      const { data: currentData, error: selectError } = await supabase
        .from('restaurant_details')
        .select('total_views')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(); // single() 대신 maybeSingle() 사용

      if (selectError) {
        console.error('조회수 조회 실패:', selectError);
        throw selectError;
      }

      if (!currentData) {
        // restaurant_details 레코드가 없는 경우 생성 (일반 INSERT 사용)
        const { data: insertData, error: insertError } = await supabase
          .from('restaurant_details')
          .insert({
            restaurant_id: restaurantId,
            total_views: 1,
            total_favorites: 0,
            total_comments: 0,
            total_reviews: 0,
            average_rating: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('total_views')
          .single();

        if (insertError) {
          console.error('restaurant_details 생성 실패:', insertError);
          // RLS 정책 오류인 경우 조회수 증가를 무시하고 계속 진행
          if (insertError.code === '42501') {
            console.warn('RLS 정책으로 인해 조회수 증가를 건너뜁니다.');
            return { total_views: 1 };
          }
          throw insertError;
        }
        return insertData;
      }

      // 조회수 증가
      const newViewCount = (currentData.total_views || 0) + 1;
      const { data: updateData, error: updateError } = await supabase
        .from('restaurant_details')
        .update({
          total_views: newViewCount,
          updated_at: new Date().toISOString()
        })
        .eq('restaurant_id', restaurantId)
        .select('total_views')
        .single();

      if (updateError) {
        console.error('조회수 업데이트 실패:', updateError);
        // RLS 정책 오류인 경우 조회수 증가를 무시하고 계속 진행
        if (updateError.code === '42501') {
          console.warn('RLS 정책으로 인해 조회수 증가를 건너뜁니다.');
          return { total_views: newViewCount };
        }
        throw updateError;
      }
      return updateData;
    } catch (error) {
      console.error('조회수 증가 실패:', error);
      // 조회수 증가 실패해도 전체 API가 실패하지 않도록 함
      return { total_views: 0 };
    }
  }

  static async findByCategory(categoryId, limit = 50) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon
        )
      `)
      .eq('category_id', categoryId)
      .limit(limit)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async findNearby(latitude, longitude, radiusKm = 5, limit = 50) {
    // PostGIS를 사용한 지리적 검색
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

  static async update(id, updateData) {
    const { data, error } = await supabase
      .from('restaurants')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(id) {
    const { error } = await supabase
      .from('restaurants')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  static async addToFavorites(userId, restaurantId) {
    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .insert([{
          user_id: userId,
          restaurant_id: restaurantId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('즐겨찾기 추가 오류:', error);
        // RLS 정책 오류인 경우 사용자에게 친화적인 메시지 반환
        if (error.code === '42501') {
          const customError = new Error('즐겨찾기 기능을 사용할 권한이 없습니다. 로그인 상태를 확인해주세요.');
          customError.code = 'PERMISSION_DENIED';
          throw customError;
        }
        // 중복 오류 처리
        if (error.code === '23505') {
          const customError = new Error('이미 즐겨찾기에 추가된 맛집입니다.');
          customError.code = 'ALREADY_EXISTS';
          throw customError;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('즐겨찾기 추가 실패:', error);
      throw error;
    }
  }

  static async removeFromFavorites(userId, restaurantId) {
    try {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('restaurant_id', restaurantId);

      if (error) {
        console.error('즐겨찾기 제거 오류:', error);
        // RLS 정책 오류인 경우 사용자에게 친화적인 메시지 반환
        if (error.code === '42501') {
          const customError = new Error('즐겨찾기 기능을 사용할 권한이 없습니다. 로그인 상태를 확인해주세요.');
          customError.code = 'PERMISSION_DENIED';
          throw customError;
        }
        throw error;
      }
      return true;
    } catch (error) {
      console.error('즐겨찾기 제거 실패:', error);
      throw error;
    }
  }

  static async getUserFavorites(userId) {
    const { data, error } = await supabase
      .from('user_favorites')
      .select(`
        *,
        restaurants (
          *,
          categories (
            id,
            name,
            icon
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

module.exports = Restaurant;