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
    // 목록 조회 시 필요한 필드만 선택 (성능 최적화)
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        description,
        address,
        road_address,
        phone,
        images,
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
    // 상세 조회 시 모든 필드 선택
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        categories (
          id,
          name,
          icon,
          color
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async incrementViewCount(restaurantId) {
    try {
      // 통합된 restaurants 테이블에서 직접 조회수 증가
      const { data: currentData, error: selectError } = await supabase
        .from('restaurants')
        .select('view_count')
        .eq('id', restaurantId)
        .single();

      if (selectError) throw selectError;

      // 조회수 증가
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

  static async findByCategory(categoryId, limit = 50) {
    // 카테고리별 목록 조회 시 필요한 필드만 선택
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        description,
        address,
        road_address,
        phone,
        images,
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

  static async removeFromFavorites(userId, restaurantId) {
    const { error } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId);

    if (error) throw error;
    return true;
  }

  static async getUserFavorites(userId) {
    // 즐겨찾기 목록 조회 시 필요한 필드만 선택
    const { data, error } = await supabase
      .from('user_favorites')
      .select(`
        *,
        restaurants (
          id,
          name,
          description,
          address,
          road_address,
          phone,
          images,
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