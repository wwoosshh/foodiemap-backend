const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { body, query, param, validationResult } = require('express-validator');

// 환경 변수 검증
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY environment variable is required');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 에러 응답 헬퍼 함수
const errorResponse = (res, status, message, error = null) => {
  console.error(`Error ${status}: ${message}`, error);
  return res.status(status).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// 성공 응답 헬퍼 함수
const successResponse = (res, data, message = 'Success') => {
  return res.json({
    success: true,
    message,
    data
  });
};

// 사용자 인증 미들웨어 (선택적)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// 사용자 인증 필수 미들웨어
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, '인증 토큰이 필요합니다.');
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return errorResponse(res, 401, '유효하지 않은 토큰입니다.');
    }

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 401, '인증 중 오류가 발생했습니다.', error.message);
  }
};

/**
 * @swagger
 * /api/reviews/{restaurantId}:
 *   get:
 *     summary: 맛집 리뷰 목록 조회
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, rating_desc, rating_asc, helpful]
 *           default: newest
 */
router.get('/:restaurantId',
  [
    param('restaurantId').isUUID().withMessage('유효한 맛집 ID가 아닙니다'),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('sort').optional().isIn(['newest', 'oldest', 'rating_desc', 'rating_asc', 'helpful'])
  ],
  optionalAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { restaurantId } = req.params;
      const limit = req.query.limit || 10;
      const offset = req.query.offset || 0;
      const sort = req.query.sort || 'newest';
      const userId = req.user?.id;

      // 정렬 조건 설정
      let orderBy = { column: 'created_at', ascending: false };
      switch (sort) {
        case 'oldest':
          orderBy = { column: 'created_at', ascending: true };
          break;
        case 'rating_desc':
          orderBy = { column: 'rating', ascending: false };
          break;
        case 'rating_asc':
          orderBy = { column: 'rating', ascending: true };
          break;
        case 'helpful':
          orderBy = { column: 'helpful_count', ascending: false };
          break;
      }

      // 리뷰 목록 조회
      let query = supabaseAdmin
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
          profiles:user_id (
            username,
            avatar_url
          ),
          review_helpful:review_helpful!left (
            id
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order(orderBy.column, { ascending: orderBy.ascending });

      if (userId) {
        query = query.eq('review_helpful.user_id', userId);
      }

      const { data: reviews, error } = await query
        .range(offset, offset + limit - 1);

      if (error) {
        return errorResponse(res, 500, '리뷰 조회 중 오류가 발생했습니다', error.message);
      }

      // 리뷰 데이터 변환
      const processedReviews = reviews.map(review => ({
        id: review.id,
        user_id: review.user_id,
        username: review.profiles?.username || '알 수 없는 사용자',
        avatar_url: review.profiles?.avatar_url,
        rating: review.rating,
        title: review.title,
        content: review.content,
        images: review.review_images || [],
        tags: [],
        created_at: review.created_at,
        updated_at: review.updated_at,
        helpful_count: review.helpful_count,
        is_helpful: review.review_helpful && review.review_helpful.length > 0
      }));

      return successResponse(res, {
        reviews: processedReviews,
        total: processedReviews.length,
        limit,
        offset
      });

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/reviews/{restaurantId}/stats:
 *   get:
 *     summary: 맛집 리뷰 통계 조회
 */
router.get('/:restaurantId/stats',
  [
    param('restaurantId').isUUID().withMessage('유효한 맛집 ID가 아닙니다')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { restaurantId } = req.params;

      // 리뷰 통계 조회
      const { data: stats, error } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('rating')
        .eq('restaurant_id', restaurantId);

      if (error) {
        return errorResponse(res, 500, '리뷰 통계 조회 중 오류가 발생했습니다', error.message);
      }

      if (!stats || stats.length === 0) {
        return successResponse(res, {
          average_rating: 0,
          total_reviews: 0,
          rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        });
      }

      // 평균 평점 계산
      const totalRating = stats.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / stats.length;

      // 별점 분포 계산
      const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      stats.forEach(review => {
        ratingDistribution[review.rating] += 1;
      });

      return successResponse(res, {
        average_rating: Math.round(averageRating * 10) / 10, // 소수점 첫째자리까지
        total_reviews: stats.length,
        rating_distribution: ratingDistribution
      });

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: 리뷰 작성
 *     security:
 *       - bearerAuth: []
 */
router.post('/',
  [
    body('restaurant_id').isUUID().withMessage('유효한 맛집 ID가 아닙니다'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('평점은 1-5 사이의 정수여야 합니다'),
    body('title').trim().isLength({ min: 1, max: 100 }).withMessage('제목은 1-100자여야 합니다'),
    body('content').trim().isLength({ min: 10, max: 2000 }).withMessage('내용은 10-2000자여야 합니다'),
    body('images').optional().isArray().withMessage('이미지는 배열이어야 합니다'),
    body('images.*').optional().isURL().withMessage('이미지 URL 형식이 올바르지 않습니다'),
    body('tags').optional().isArray().withMessage('태그는 배열이어야 합니다'),
    body('tags.*').optional().isString().withMessage('태그는 문자열이어야 합니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { restaurant_id, rating, title, content, images, tags } = req.body;
      const user_id = req.user.id;

      // 중복 리뷰 확인 (같은 사용자가 같은 맛집에 리뷰 작성했는지)
      const { data: existingReview } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('id')
        .eq('restaurant_id', restaurant_id)
        .eq('user_id', user_id)
        .single();

      if (existingReview) {
        return errorResponse(res, 409, '이미 이 맛집에 대한 리뷰를 작성하셨습니다. 수정을 원하시면 기존 리뷰를 수정해주세요.');
      }

      // 리뷰 생성
      const { data: review, error } = await supabaseAdmin
        .from('restaurant_reviews')
        .insert({
          restaurant_id,
          user_id,
          rating,
          title: title.trim(),
          content: content.trim(),
          review_images: images || []
        })
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
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .single();

      if (error) {
        return errorResponse(res, 500, '리뷰 작성 중 오류가 발생했습니다', error.message);
      }

      const responseReview = {
        id: review.id,
        user_id: review.user_id,
        username: review.profiles?.username || '알 수 없는 사용자',
        avatar_url: review.profiles?.avatar_url,
        rating: review.rating,
        title: review.title,
        content: review.content,
        images: review.review_images || [],
        tags: [],
        created_at: review.created_at,
        updated_at: review.updated_at,
        helpful_count: review.helpful_count,
        is_helpful: false
      };

      return successResponse(res, responseReview, '리뷰가 작성되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   put:
 *     summary: 리뷰 수정
 *     security:
 *       - bearerAuth: []
 */
router.put('/:reviewId',
  [
    param('reviewId').isUUID().withMessage('유효한 리뷰 ID가 아닙니다'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('평점은 1-5 사이의 정수여야 합니다'),
    body('title').trim().isLength({ min: 1, max: 100 }).withMessage('제목은 1-100자여야 합니다'),
    body('content').trim().isLength({ min: 10, max: 2000 }).withMessage('내용은 10-2000자여야 합니다'),
    body('images').optional().isArray().withMessage('이미지는 배열이어야 합니다'),
    body('tags').optional().isArray().withMessage('태그는 배열이어야 합니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { reviewId } = req.params;
      const { rating, title, content, images, tags } = req.body;
      const user_id = req.user.id;

      // 리뷰 소유권 확인
      const { data: existingReview, error: reviewError } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('id, user_id')
        .eq('id', reviewId)
        .single();

      if (reviewError || !existingReview) {
        return errorResponse(res, 404, '리뷰를 찾을 수 없습니다');
      }

      if (existingReview.user_id !== user_id) {
        return errorResponse(res, 403, '리뷰를 수정할 권한이 없습니다');
      }

      // 리뷰 수정
      const { data: updatedReview, error: updateError } = await supabaseAdmin
        .from('restaurant_reviews')
        .update({
          rating,
          title: title.trim(),
          content: content.trim(),
          review_images: images || [],
          updated_at: new Date().toISOString()
        })
        .eq('id', reviewId)
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
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .single();

      if (updateError) {
        return errorResponse(res, 500, '리뷰 수정 중 오류가 발생했습니다', updateError.message);
      }

      const responseReview = {
        id: updatedReview.id,
        user_id: updatedReview.user_id,
        username: updatedReview.profiles?.username || '알 수 없는 사용자',
        avatar_url: updatedReview.profiles?.avatar_url,
        rating: updatedReview.rating,
        title: updatedReview.title,
        content: updatedReview.content,
        images: updatedReview.review_images || [],
        tags: [],
        created_at: updatedReview.created_at,
        updated_at: updatedReview.updated_at,
        helpful_count: updatedReview.helpful_count,
        is_helpful: false
      };

      return successResponse(res, responseReview, '리뷰가 수정되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/reviews/{reviewId}/helpful:
 *   post:
 *     summary: 리뷰 도움이 돼요 토글
 *     security:
 *       - bearerAuth: []
 */
router.post('/:reviewId/helpful',
  [
    param('reviewId').isUUID().withMessage('유효한 리뷰 ID가 아닙니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { reviewId } = req.params;
      const user_id = req.user.id;

      // 리뷰 존재 여부 확인
      const { data: review, error: reviewError } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('id, user_id')
        .eq('id', reviewId)
        .single();

      if (reviewError || !review) {
        return errorResponse(res, 404, '리뷰를 찾을 수 없습니다');
      }

      // 자신의 리뷰에는 도움이 돼요를 누를 수 없음
      if (review.user_id === user_id) {
        return errorResponse(res, 400, '자신의 리뷰에는 도움이 돼요를 누를 수 없습니다');
      }

      // 기존 도움이 돼요 여부 확인
      const { data: existingHelpful } = await supabaseAdmin
        .from('review_helpful')
        .select('id')
        .eq('review_id', reviewId)
        .eq('user_id', user_id)
        .single();

      let isHelpful = false;

      if (existingHelpful) {
        // 도움이 돼요 취소
        const { error: deleteError } = await supabaseAdmin
          .from('review_helpful')
          .delete()
          .eq('id', existingHelpful.id);

        if (deleteError) {
          return errorResponse(res, 500, '도움이 돼요 취소 중 오류가 발생했습니다', deleteError.message);
        }
      } else {
        // 도움이 돼요 추가
        const { error: insertError } = await supabaseAdmin
          .from('review_helpful')
          .insert({
            review_id: reviewId,
            user_id
          });

        if (insertError) {
          return errorResponse(res, 500, '도움이 돼요 추가 중 오류가 발생했습니다', insertError.message);
        }

        isHelpful = true;
      }

      // 업데이트된 도움이 돼요 수 조회
      const { data: updatedReview } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('helpful_count')
        .eq('id', reviewId)
        .single();

      return successResponse(res, {
        review_id: reviewId,
        is_helpful: isHelpful,
        helpful_count: updatedReview?.helpful_count || 0
      }, isHelpful ? '도움이 돼요를 눌렀습니다' : '도움이 돼요를 취소했습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: 리뷰 삭제
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:reviewId',
  [
    param('reviewId').isUUID().withMessage('유효한 리뷰 ID가 아닙니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { reviewId } = req.params;
      const user_id = req.user.id;

      // 리뷰 소유권 확인
      const { data: review, error: reviewError } = await supabaseAdmin
        .from('restaurant_reviews')
        .select('id, user_id')
        .eq('id', reviewId)
        .single();

      if (reviewError || !review) {
        return errorResponse(res, 404, '리뷰를 찾을 수 없습니다');
      }

      if (review.user_id !== user_id) {
        return errorResponse(res, 403, '리뷰를 삭제할 권한이 없습니다');
      }

      // 리뷰 삭제 (cascade로 도움이 돼요도 함께 삭제됨)
      const { error: deleteError } = await supabaseAdmin
        .from('restaurant_reviews')
        .delete()
        .eq('id', reviewId);

      if (deleteError) {
        return errorResponse(res, 500, '리뷰 삭제 중 오류가 발생했습니다', deleteError.message);
      }

      return successResponse(res, { review_id: reviewId }, '리뷰가 삭제되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

module.exports = router;