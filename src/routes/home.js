const express = require('express');
const { validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const supabase = require('../config/supabase');

const router = express.Router();

// 홈페이지용 통합 데이터 조회
router.get('/data', async (req, res) => {
  try {
    // 기본 쿼리 설정 (multi-sort용)
    const baseSelect = `
      id,
      name,
      description,
      address,
      rating,
      review_count,
      view_count,
      favorite_count,
      latitude,
      longitude,
      created_at,
      categories (
        id,
        name,
        icon,
        color
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
    `;

    // 병렬로 모든 데이터 가져오기
    const [bannersResult, categoriesResult, featuredRestaurantsResult, restaurantsResult, pushedRestaurantsResult, multiSortResult, statsResult] = await Promise.all([
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

      // 추천 맛집 (평점 높은 순 3개) - 이미지 포함
      supabase
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
          categories (
            id,
            name,
            icon,
            color
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
        `)
        .order('rating', { ascending: false })
        .limit(3),

      // 일반 맛집 목록 (12개) - 이미지 포함
      supabase
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
          categories (
            id,
            name,
            icon,
            color
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
        `)
        .order('created_at', { ascending: false })
        .limit(12),

      // 푸시 맛집 조회 (활성화된 것만, 최대 3개) - 이미지 포함
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
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(3),

      // Multi-sort 맛집 데이터 (평점순, 리뷰순, 조회순, 좋아요순, 최신순)
      (async () => {
        const limit = 10;
        const [byRating, byReviewCount, byViewCount, byFavoriteCount, byLatest] = await Promise.all([
          supabase.from('restaurants').select(baseSelect).order('rating', { ascending: false }).limit(limit),
          supabase.from('restaurants').select(baseSelect).order('review_count', { ascending: false }).limit(limit),
          supabase.from('restaurants').select(baseSelect).order('view_count', { ascending: false }).limit(limit),
          supabase.from('restaurants').select(baseSelect).order('favorite_count', { ascending: false }).limit(limit),
          supabase.from('restaurants').select(baseSelect).order('created_at', { ascending: false }).limit(limit)
        ]);

        return {
          data: {
            byRating: byRating.data,
            byReviewCount: byReviewCount.data,
            byViewCount: byViewCount.data,
            byFavoriteCount: byFavoriteCount.data,
            byLatest: byLatest.data
          },
          error: byRating.error || byReviewCount.error || byViewCount.error || byFavoriteCount.error || byLatest.error
        };
      })(),

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
    if (multiSortResult.error) {
      console.error('Multi-sort 맛집 조회 실패:', multiSortResult.error);
    }
    if (statsResult.error) {
      console.error('통계 조회 실패:', statsResult.error);
    }

    // 레스토랑 데이터 변환 함수 (이미지 추출)
    const transformRestaurants = (restaurants) => {
      return (restaurants || []).map(restaurant => {
        // 대표 이미지 추출
        const representativeMedia = restaurant.restaurant_media?.find(m => m.is_representative);
        const images = representativeMedia?.media_files?.file_url
          ? [representativeMedia.media_files.file_url]
          : [];

        return {
          ...restaurant,
          images
        };
      });
    };

    // 푸시 맛집 데이터 변환 함수
    const transformPushedRestaurants = (pushedRestaurants) => {
      return (pushedRestaurants || []).map(pushed => {
        // restaurant 객체에 이미지 추가
        if (pushed.restaurant) {
          const representativeMedia = pushed.restaurant.restaurant_media?.find(m => m.is_representative);
          const images = representativeMedia?.media_files?.file_url
            ? [representativeMedia.media_files.file_url]
            : [];

          return {
            ...pushed,
            restaurant: {
              ...pushed.restaurant,
              images
            }
          };
        }
        return pushed;
      });
    };

    // Multi-sort 데이터 변환
    const multiSortData = multiSortResult.data ? {
      byRating: transformRestaurants(multiSortResult.data.byRating),
      byReviewCount: transformRestaurants(multiSortResult.data.byReviewCount),
      byViewCount: transformRestaurants(multiSortResult.data.byViewCount),
      byFavoriteCount: transformRestaurants(multiSortResult.data.byFavoriteCount),
      byLatest: transformRestaurants(multiSortResult.data.byLatest)
    } : {
      byRating: [],
      byReviewCount: [],
      byViewCount: [],
      byFavoriteCount: [],
      byLatest: []
    };

    // 응답 데이터 구성
    const responseData = {
      banners: bannersResult.data || [],
      categories: categoriesResult.data || [],
      featuredRestaurants: transformRestaurants(featuredRestaurantsResult.data),
      restaurants: transformRestaurants(restaurantsResult.data),
      pushedRestaurants: transformPushedRestaurants(pushedRestaurantsResult.data),
      multiSort: multiSortData,
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