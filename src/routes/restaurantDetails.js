const express = require('express');
const { param, validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// 맛집 상세정보 통합 조회 (정보, 메뉴, 리뷰, 댓글, 지도 정보 등 모든 데이터)
router.get('/:id/complete', [
  authMiddleware.optionalAuth,  // 선택적 인증 추가
  param('id').isUUID().withMessage('올바른 맛집 ID를 입력해주세요.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '잘못된 요청입니다.',
        errors: errors.array()
      });
    }

    const restaurantId = req.params.id;
    const userId = req.user?.id; // 인증된 사용자가 있는 경우

    console.log(`🔐 사용자 인증 상태: userId=${userId}, user=${!!req.user}`);

    // 조회수 간단하게 1 증가
    (async () => {
      try {
        // 현재 조회수 가져오기
        const { data: currentData } = await supabase
          .from('restaurants')
          .select('view_count')
          .eq('id', restaurantId)
          .single();

        if (currentData) {
          // 조회수 +1 업데이트
          await supabase
            .from('restaurants')
            .update({ view_count: (currentData.view_count || 0) + 1 })
            .eq('id', restaurantId);

          console.log(`✅ 조회수 증가: ${restaurantId} (${currentData.view_count} -> ${(currentData.view_count || 0) + 1})`);
        }
      } catch (err) {
        console.error('❌ 조회수 증가 실패:', err);
      }
    })();

    // 병렬로 모든 관련 데이터 가져오기
    const [
      restaurantResult,
      reviewsResult,
      commentsResult,
      menuResult,
      favoriteStatusResult
    ] = await Promise.all([
      // 1. 맛집 기본 정보
      supabase
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
        .eq('id', restaurantId)
        .single(),

      // 2. 리뷰 목록 (최신순, 페이지네이션 고려해서 처음 10개)
      supabase
        .from('restaurant_reviews')
        .select(`
          id,
          user_id,
          rating,
          title,
          content,
          review_images,
          created_at,
          updated_at,
          helpful_count,
          users:user_id (
            id,
            name,
            avatar_url
          )
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10),

      // 3. 댓글 목록 (최신순, 처음 20개)
      supabase
        .from('restaurant_comments')
        .select(`
          id,
          user_id,
          content,
          parent_comment_id,
          likes_count,
          created_at,
          updated_at,
          users:user_id (
            id,
            name,
            avatar_url
          )
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_deleted', false)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: false })
        .limit(20),

      // 4. 메뉴 정보 (있는 경우)
      supabase
        .from('menus')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true }),

      // 5. 즐겨찾기 상태 (로그인된 사용자가 있는 경우)
      userId ? supabase
        .from('user_favorites')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId)
        .maybeSingle() : Promise.resolve({ data: null })
    ]);

    // 맛집이 존재하지 않는 경우
    if (restaurantResult.error || !restaurantResult.data) {
      return res.status(404).json({
        success: false,
        message: '맛집을 찾을 수 없습니다.'
      });
    }

    // 리뷰 통계 계산
    const reviewStats = await calculateReviewStats(restaurantId);

    // 리뷰 데이터 변환 (프론트엔드 형식에 맞게)
    const transformedReviews = (reviewsResult.data || []).map(review => ({
      id: review.id,
      user_id: review.user_id,
      username: review.users?.name || '알 수 없음',
      rating: review.rating,
      title: review.title,
      content: review.content,
      images: review.review_images || [],
      created_at: review.created_at,
      updated_at: review.updated_at,
      helpful_count: review.helpful_count || 0,
      is_helpful: false,
      tags: []
    }));

    // 댓글 데이터 변환 (프론트엔드 형식에 맞게)
    const transformedComments = (commentsResult.data || []).map(comment => ({
      id: comment.id,
      user_id: comment.user_id,
      username: comment.users?.name || '알 수 없음',
      content: comment.content,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      likes_count: comment.likes_count || 0,
      is_liked: false,
      is_owner: false,
      replies: []
    }));

    // 응답 데이터 구성
    const responseData = {
      // 맛집 기본 정보
      restaurant: restaurantResult.data,

      // 리뷰 관련
      reviews: {
        items: transformedReviews,
        stats: reviewStats,
        total: reviewStats.total_reviews,
        hasMore: transformedReviews.length >= 10
      },

      // 댓글 관련
      comments: {
        items: transformedComments,
        total: transformedComments.length,
        hasMore: transformedComments.length >= 20
      },

      // 메뉴 정보
      menus: menuResult.data || [],

      // 사용자 관련 정보
      userInfo: userId ? {
        isFavorited: !!favoriteStatusResult.data,
        canReview: true, // 추후 리뷰 작성 가능 여부 로직 추가
        canComment: true
      } : null,

      // 지도 정보 (좌표가 있는 경우)
      mapInfo: restaurantResult.data.latitude && restaurantResult.data.longitude ? {
        latitude: restaurantResult.data.latitude,
        longitude: restaurantResult.data.longitude,
        address: restaurantResult.data.address
      } : null
    };

    // 디버깅: 즐겨찾기 상태 로그
    console.log(`❤️ 즐겨찾기 상태 전송: userId=${userId}, isFavorited=${!!favoriteStatusResult.data}`);

    res.json({
      success: true,
      message: '맛집 상세정보 조회 성공',
      data: responseData
    });

  } catch (error) {
    console.error('맛집 상세정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '맛집 상세정보를 불러오는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 리뷰 통계 계산 함수
async function calculateReviewStats(restaurantId) {
  try {
    const { data, error } = await supabase
      .from('restaurant_reviews')
      .select('rating')
      .eq('restaurant_id', restaurantId)
      .eq('is_deleted', false);

    if (error) {
      console.error('리뷰 통계 계산 오류:', error);
      return {
        average_rating: 0,
        total_reviews: 0,
        rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }

    const reviews = data || [];
    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      return {
        average_rating: 0,
        total_reviews: 0,
        rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }

    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const averageRating = sum / totalReviews;

    const distribution = reviews.reduce((acc, review) => {
      acc[review.rating] = (acc[review.rating] || 0) + 1;
      return acc;
    }, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

    return {
      average_rating: parseFloat(averageRating.toFixed(1)),
      total_reviews: totalReviews,
      rating_distribution: distribution
    };
  } catch (error) {
    console.error('리뷰 통계 계산 오류:', error);
    return {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };
  }
}

// 추가 리뷰 로드 (페이지네이션)
router.get('/:id/reviews/more', [
  param('id').isUUID().withMessage('올바른 맛집 ID를 입력해주세요.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '잘못된 요청입니다.',
        errors: errors.array()
      });
    }

    const restaurantId = req.params.id;
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 10;

    const { data, error } = await supabase
      .from('restaurant_reviews')
      .select(`
        id,
        user_id,
        rating,
        title,
        content,
        review_images,
        created_at,
        updated_at,
        helpful_count,
        users:user_id (
          id,
          name,
          avatar_url
        )
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        reviews: data || [],
        hasMore: (data || []).length >= limit
      }
    });

  } catch (error) {
    console.error('추가 리뷰 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '리뷰를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 추가 댓글 로드 (페이지네이션)
router.get('/:id/comments/more', [
  param('id').isUUID().withMessage('올바른 맛집 ID를 입력해주세요.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '잘못된 요청입니다.',
        errors: errors.array()
      });
    }

    const restaurantId = req.params.id;
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 20;

    const { data, error } = await supabase
      .from('restaurant_comments')
      .select(`
        id,
        user_id,
        content,
        parent_comment_id,
        likes_count,
        created_at,
        updated_at,
        users:user_id (
          id,
          name,
          avatar_url
        )
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_deleted', false)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        comments: data || [],
        hasMore: (data || []).length >= limit
      }
    });

  } catch (error) {
    console.error('추가 댓글 로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '댓글을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;