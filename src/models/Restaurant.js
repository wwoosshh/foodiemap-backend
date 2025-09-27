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
    try {
      // 현재 조회수 조회
      const { data: currentData, error: selectError } = await supabase
        .from('restaurant_details')
        .select('total_views')
        .eq('restaurant_id', restaurantId)
        .single();

      if (selectError) {
        // restaurant_details 레코드가 없는 경우 생성
        if (selectError.code === 'PGRST116') {
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

          if (insertError) throw insertError;
          return insertData;
        }
        throw selectError;
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

      if (updateError) throw updateError;
      return updateData;
    } catch (error) {
      console.error('조회수 증가 실패:', error);
      throw error;
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