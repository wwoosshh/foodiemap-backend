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
    const { data, error } = await supabase
      .rpc('increment_restaurant_views', {
        restaurant_id: restaurantId
      });

    if (error) {
      // RPC 함수가 없는 경우 직접 UPDATE
      const { data: updateData, error: updateError } = await supabase
        .from('restaurant_details')
        .update({
          total_views: supabase.raw('total_views + 1')
        })
        .eq('restaurant_id', restaurantId)
        .select('total_views')
        .single();

      if (updateError) throw updateError;
      return updateData;
    }

    return data;
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