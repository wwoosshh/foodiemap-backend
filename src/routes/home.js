const express = require('express');
const { validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const supabase = require('../config/supabase');

const router = express.Router();

// 홈페이지용 통합 데이터 조회
router.get('/data', async (req, res) => {
  try {
    // 병렬로 모든 데이터 가져오기
    const [bannersResult, categoriesResult, featuredRestaurantsResult, restaurantsResult, pushedRestaurantsResult, eventsResult, statsResult] = await Promise.all([
      // 활성화된 배너 조회
      supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      // 카테고리 조회
      supabase
        .from('categories')
        .select('*')
        .order('id', { ascending: true }),

      // 추천 맛집 (평점 높은 순 3개) - 필요한 필드만 선택
      supabase
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
          categories (
            id,
            name,
            icon,
            color
          )
        `)
        .order('rating', { ascending: false })
        .limit(3),

      // 일반 맛집 목록 (12개) - 필요한 필드만 선택
      supabase
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
          categories (
            id,
            name,
            icon,
            color
          )
        `)
        .order('created_at', { ascending: false })
        .limit(12),

      // 푸시 맛집 조회 (활성화된 것만, 최대 3개)
      supabase
        .from('featured_restaurants')
        .select(`
          id,
          title,
          subtitle,
          description,
          display_order,
          badge_text,
          badge_color,
          restaurant:restaurant_id (
            id,
            name,
            description,
            address,
            road_address,
            phone,
            images,
            rating,
            review_count,
            view_count,
            favorite_count,
            price_range,
            category_id,
            categories (
              id,
              name,
              icon,
              color
            )
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(3),

      // 활성화된 이벤트 조회 (종료되지 않은 것만, 최대 10개)
      supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10),

      // 통계 데이터 조회
      (async () => {
        const [restaurantCount, reviewCount, userCount] = await Promise.all([
          supabase.from('restaurants').select('id', { count: 'exact', head: true }),
          supabase.from('restaurant_reviews').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true })
        ]);
        return {
          data: {
            totalRestaurants: restaurantCount.count || 0,
            totalReviews: reviewCount.count || 0,
            totalUsers: userCount.count || 0
          },
          error: restaurantCount.error || reviewCount.error || userCount.error
        };
      })()
    ]);

    // 에러 체크
    if (bannersResult.error) {
      console.error('배너 조회 실패:', bannersResult.error);
    }
    if (categoriesResult.error) {
      console.error('카테고리 조회 실패:', categoriesResult.error);
    }
    if (featuredRestaurantsResult.error) {
      console.error('추천 맛집 조회 실패:', featuredRestaurantsResult.error);
    }
    if (restaurantsResult.error) {
      console.error('맛집 목록 조회 실패:', restaurantsResult.error);
    }
    if (pushedRestaurantsResult.error) {
      console.error('푸시 맛집 조회 실패:', pushedRestaurantsResult.error);
    }
    if (eventsResult.error) {
      console.error('이벤트 조회 실패:', eventsResult.error);
    }
    if (statsResult.error) {
      console.error('통계 조회 실패:', statsResult.error);
    }

    // 응답 데이터 구성
    const responseData = {
      banners: bannersResult.data || [],
      categories: categoriesResult.data || [],
      featuredRestaurants: featuredRestaurantsResult.data || [],
      restaurants: restaurantsResult.data || [],
      pushedRestaurants: pushedRestaurantsResult.data || [],
      events: eventsResult.data || [],
      stats: statsResult.data || {
        totalRestaurants: 0,
        totalReviews: 0,
        totalUsers: 0
      }
    };

    res.json({
      success: true,
      message: '홈페이지 데이터 조회 성공',
      data: responseData
    });

  } catch (error) {
    console.error('홈페이지 데이터 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '홈페이지 데이터를 불러오는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;