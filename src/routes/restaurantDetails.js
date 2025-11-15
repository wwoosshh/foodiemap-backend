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
        }
      } catch (err) {
        // 조회수 증가 실패는 무시
      }
    })();

    // 병렬로 모든 관련 데이터 가져오기
    const [
      restaurantResult,
      contactsResult,
      facilitiesResult,
      operationsResult,
      servicesResult,
      reviewsResult,
      commentsResult,
      menuResult,
      favoriteStatusResult,
      restaurantPhotosResult,
      restaurantTagsResult,
      userHelpfulReviewsResult
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

      // 2. 연락처 정보
      supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),

      // 3. 시설 정보
      supabase
        .from('restaurant_facilities')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),

      // 4. 운영 정보
      supabase
        .from('restaurant_operations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),

      // 5. 서비스 정보
      supabase
        .from('restaurant_services')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),

      // 6. 리뷰 목록 (최신순, 페이지네이션 고려해서 처음 10개)
      supabase
        .from('restaurant_reviews')
        .select(`
          *,
          users!user_id(id, name, avatar_url),
          review_media(
            media_id,
            display_order,
            media_files(id, file_url, thumbnail_url, medium_url)
          )
        `)
        .eq('restaurant_id', restaurantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),

      // 3. 댓글 목록 (최신순, 처음 20개)
      supabase
        .from('review_comments')
        .select(`
          id,
          user_id,
          content,
          parent_comment_id,
          created_at,
          updated_at,
          users:user_id (
            id,
            name,
            avatar_url
          )
        `)
        .eq('review_id', restaurantId)
        .eq('status', 'published')
        .is('parent_comment_id', null)
        .order('created_at', { ascending: false })
        .limit(20),

      // 4. 메뉴 정보 (있는 경우)
      supabase
        .from('menus')
        .select(`
          id,
          restaurant_id,
          name,
          name_en,
          description,
          price,
          original_price,
          category,
          is_signature,
          is_popular,
          is_seasonal,
          is_new,
          spicy_level,
          portion_size,
          calories,
          is_available,
          view_count,
          display_order,
          created_at,
          updated_at,
          menu_media (
            media_id,
            display_order,
            media_files (
              id,
              file_url,
              thumbnail_url,
              medium_url,
              large_url
            )
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('display_order', { ascending: true }),

      // 5. 즐겨찾기 상태 (로그인된 사용자가 있는 경우)
      userId ? supabase
        .from('user_favorites')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId)
        .maybeSingle() : Promise.resolve({ data: null }),

      // 6. 맛집 사진 갤러리
      supabase
        .from('restaurant_media')
        .select(`
          id,
          category,
          caption,
          is_representative,
          is_featured,
          display_order,
          media_files (
            file_url,
            thumbnail_url,
            medium_url,
            large_url
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('display_order', { ascending: true }),

      // 7. 맛집 태그
      supabase
        .from('restaurant_tags')
        .select(`
          score,
          tags (
            id,
            name,
            category,
            icon,
            color
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('score', { ascending: false }),

      // 8. 사용자가 도움돼요를 누른 리뷰 (로그인된 사용자가 있는 경우)
      userId ? supabase
        .from('review_helpful')
        .select('review_id')
        .eq('user_id', userId)
        : Promise.resolve({ data: [] })
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

    // 도움돼요를 누른 리뷰 ID 세트
    const helpfulReviewIds = new Set(
      (userHelpfulReviewsResult.data || []).map(h => h.review_id)
    );

    // 리뷰 데이터 변환 (프론트엔드 형식에 맞게)
    const transformedReviews = (reviewsResult.data || []).map(review => ({
      id: review.id,
      user_id: review.user_id,
      username: review.is_anonymous ? '익명' : (review.users?.name || '알 수 없음'),
      avatar_url: review.is_anonymous ? null : review.users?.avatar_url,
      rating: review.rating,
      title: review.title,
      content: review.content,
      images: (review.review_media || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(rm => rm.media_files?.file_url || rm.media_files?.medium_url || ''),
      is_anonymous: review.is_anonymous,
      created_at: review.created_at,
      updated_at: review.updated_at,
      helpful_count: review.helpful_count || 0,
      user_helpful: helpfulReviewIds.has(review.id),
      tags: []
    }));

    // 댓글 데이터 변환 (프론트엔드 형식에 맞게)
    const transformedComments = (commentsResult.data || []).map(comment => ({
      id: comment.id,
      user_id: comment.user_id,
      review_id: comment.review_id,
      username: comment.users?.name || '알 수 없음',
      content: comment.content,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      is_owner: false,
      replies: []
    }));

    // 맛집 사진 카테고리별 분류
    const allPhotos = (restaurantPhotosResult.data || []).map(m => ({
      id: m.id,
      category: m.category,
      caption: m.caption,
      is_representative: m.is_representative,
      is_featured: m.is_featured,
      display_order: m.display_order,
      url: m.media_files?.large_url || m.media_files?.file_url,
      thumbnail: m.media_files?.thumbnail_url,
      medium: m.media_files?.medium_url
    }));
    const categorizedPhotos = {
      all: allPhotos,
      representative: allPhotos.filter(p => p.is_representative),
      food: allPhotos.filter(p => p.category === 'food'),
      interior: allPhotos.filter(p => p.category === 'interior'),
      exterior: allPhotos.filter(p => p.category === 'exterior'),
      menu: allPhotos.filter(p => p.category === 'menu')
    };

    // 태그 데이터 변환
    const transformedTags = (restaurantTagsResult.data || []).map(rt => ({
      id: rt.tags.id,
      name: rt.tags.name,
      category: rt.tags.category,
      icon: rt.tags.icon,
      color: rt.tags.color,
      score: rt.score
    }));

    // 메뉴 데이터 변환 및 분류
    const transformedMenus = (menuResult.data || []).map(menu => ({
      ...menu,
      image_url: menu.menu_media?.[0]?.media_files?.file_url || null,
      images: (menu.menu_media || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(mm => ({
          id: mm.media_files?.id,
          url: mm.media_files?.file_url,
          thumbnail: mm.media_files?.thumbnail_url,
          medium: mm.media_files?.medium_url,
          large: mm.media_files?.large_url
        }))
    }));

    const categorizedMenus = {
      all: transformedMenus,
      signature: transformedMenus.filter(m => m.is_signature),
      popular: transformedMenus.filter(m => m.is_popular)
    };

    // 응답 데이터 구성
    const responseData = {
      // 맛집 기본 정보
      restaurant: restaurantResult.data,

      // 연락처 정보
      contacts: contactsResult.data || {},

      // 시설 정보
      facilities: facilitiesResult.data || {},

      // 운영 정보
      operations: operationsResult.data || {},

      // 서비스 정보
      services: servicesResult.data || {},

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

      // 메뉴 정보 (분류됨)
      menus: categorizedMenus,

      // 맛집 사진 갤러리 (카테고리별)
      photos: categorizedPhotos,

      // 맛집 태그
      tags: transformedTags,

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
      .is('deleted_at', null);

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
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 10;

    // 병렬로 리뷰와 도움돼요 상태 가져오기
    const [reviewsResult, userHelpfulReviewsResult] = await Promise.all([
      supabase
        .from('restaurant_reviews')
        .select(`
          *,
          users!user_id(id, name, avatar_url),
          review_media(
            media_id,
            display_order,
            media_files(id, file_url, thumbnail_url, medium_url)
          )
        `)
        .eq('restaurant_id', restaurantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),

      // 사용자가 도움돼요를 누른 리뷰 (로그인된 사용자가 있는 경우)
      userId ? supabase
        .from('review_helpful')
        .select('review_id')
        .eq('user_id', userId)
        : Promise.resolve({ data: [] })
    ]);

    if (reviewsResult.error) {
      throw reviewsResult.error;
    }

    // 도움돼요를 누른 리뷰 ID 세트
    const helpfulReviewIds = new Set(
      (userHelpfulReviewsResult.data || []).map(h => h.review_id)
    );

    // 리뷰 데이터 변환 (익명 처리)
    const transformedReviews = (reviewsResult.data || []).map(review => ({
      id: review.id,
      user_id: review.user_id,
      username: review.is_anonymous ? '익명' : (review.users?.name || '알 수 없음'),
      avatar_url: review.is_anonymous ? null : review.users?.avatar_url,
      rating: review.rating,
      title: review.title,
      content: review.content,
      images: (review.review_media || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(rm => rm.media_files?.file_url || rm.media_files?.medium_url || ''),
      is_anonymous: review.is_anonymous,
      created_at: review.created_at,
      updated_at: review.updated_at,
      helpful_count: review.helpful_count || 0,
      user_helpful: helpfulReviewIds.has(review.id),
      tags: []
    }));

    res.json({
      success: true,
      data: {
        reviews: transformedReviews,
        hasMore: transformedReviews.length >= limit
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

    // 주의: 새 스키마에서는 review_comments만 존재합니다.
    // 레스토랑에 직접 댓글을 다는 기능은 제거되었고, 리뷰에만 댓글을 달 수 있습니다.
    // 이 API는 레스토랑의 모든 리뷰의 댓글을 가져오도록 수정되었습니다.

    // 먼저 해당 레스토랑의 모든 리뷰 ID를 가져옵니다
    const { data: reviews, error: reviewError } = await supabase
      .from('restaurant_reviews')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null);

    if (reviewError || !reviews || reviews.length === 0) {
      return res.json({
        success: true,
        data: {
          comments: [],
          hasMore: false
        }
      });
    }

    const reviewIds = reviews.map(r => r.id);

    // 모든 리뷰의 댓글을 가져옵니다
    const { data, error } = await supabase
      .from('review_comments')
      .select(`
        id,
        user_id,
        review_id,
        content,
        parent_comment_id,
        created_at,
        updated_at,
        users:user_id (
          id,
          name,
          avatar_url
        )
      `)
      .in('review_id', reviewIds)
      .eq('status', 'published')
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