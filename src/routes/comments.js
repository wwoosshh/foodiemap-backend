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
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development-only';

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    // 사용자 정보 조회
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, avatar_url')
      .eq('id', userId)
      .single();

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
 * /api/comments/{restaurantId}:
 *   get:
 *     summary: 맛집 댓글 목록 조회
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
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 */
router.get('/:restaurantId',
  [
    param('restaurantId').isUUID().withMessage('유효한 맛집 ID가 아닙니다'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  optionalAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { restaurantId } = req.params;
      const limit = req.query.limit || 20;
      const offset = req.query.offset || 0;
      const userId = req.user?.id;

      // 댓글과 답글을 함께 조회하는 쿼리
      let query = supabaseAdmin
        .from('restaurant_comments')
        .select(`
          id,
          user_id,
          content,
          created_at,
          updated_at,
          likes_count,
          parent_comment_id,
          users:user_id (
            name,
            avatar_url
          ),
          comment_likes:restaurant_comment_likes!left (
            id
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('comment_likes.user_id', userId);
      }

      const { data: comments, error } = await query
        .range(offset, offset + limit - 1);

      if (error) {
        return errorResponse(res, 500, '댓글 조회 중 오류가 발생했습니다', error.message);
      }

      // 댓글 구조 변환 (부모 댓글과 답글 분리)
      const commentMap = new Map();
      const rootComments = [];

      comments.forEach(comment => {
        const processedComment = {
          id: comment.id,
          user_id: comment.user_id,
          username: comment.users?.name || '알 수 없는 사용자',
          avatar_url: comment.users?.avatar_url,
          content: comment.content,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          likes_count: comment.likes_count,
          is_liked: comment.comment_likes && comment.comment_likes.length > 0,
          replies: []
        };

        commentMap.set(comment.id, processedComment);

        if (!comment.parent_comment_id) {
          rootComments.push(processedComment);
        }
      });

      // 답글을 부모 댓글에 연결
      comments.forEach(comment => {
        if (comment.parent_comment_id && commentMap.has(comment.parent_comment_id)) {
          const parentComment = commentMap.get(comment.parent_comment_id);
          const replyComment = commentMap.get(comment.id);
          parentComment.replies.push(replyComment);
        }
      });

      // 사장님 여부 확인
      if (rootComments.length > 0) {
        const { data: ownerInfo } = await supabaseAdmin
          .from('restaurant_owner_info')
          .select('user_id')
          .eq('restaurant_id', restaurantId);

        const ownerUserIds = ownerInfo?.map(owner => owner.user_id) || [];

        const markOwnerComments = (comments) => {
          comments.forEach(comment => {
            comment.is_owner = ownerUserIds.includes(comment.user_id);
            if (comment.replies) {
              markOwnerComments(comment.replies);
            }
          });
        };

        markOwnerComments(rootComments);
      }

      return successResponse(res, {
        comments: rootComments,
        total: rootComments.length,
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
 * /api/comments:
 *   post:
 *     summary: 댓글 작성
 *     security:
 *       - bearerAuth: []
 */
router.post('/',
  [
    body('restaurant_id').isUUID().withMessage('유효한 맛집 ID가 아닙니다'),
    body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('댓글 내용은 1-1000자여야 합니다'),
    body('parent_id').optional().isUUID().withMessage('유효한 부모 댓글 ID가 아닙니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { restaurant_id, content, parent_id } = req.body;
      const user_id = req.user.id;

      // 부모 댓글이 있는 경우 존재 여부 확인
      if (parent_id) {
        const { data: parentComment, error: parentError } = await supabaseAdmin
          .from('restaurant_comments')
          .select('id, restaurant_id')
          .eq('id', parent_id)
          .single();

        if (parentError || !parentComment) {
          return errorResponse(res, 404, '부모 댓글을 찾을 수 없습니다');
        }

        if (parentComment.restaurant_id !== restaurant_id) {
          return errorResponse(res, 400, '댓글과 맛집이 일치하지 않습니다');
        }
      }

      // 댓글 생성
      const { data: comment, error } = await supabaseAdmin
        .from('restaurant_comments')
        .insert({
          restaurant_id,
          user_id,
          content: content.trim(),
          parent_comment_id: parent_id
        })
        .select(`
          id,
          user_id,
          content,
          created_at,
          updated_at,
          likes_count,
          parent_comment_id,
          users:user_id (
            name,
            avatar_url
          )
        `)
        .single();

      if (error) {
        return errorResponse(res, 500, '댓글 작성 중 오류가 발생했습니다', error.message);
      }

      // 사장님 여부 확인
      const { data: ownerInfo } = await supabaseAdmin
        .from('restaurant_owner_info')
        .select('user_id')
        .eq('restaurant_id', restaurant_id)
        .eq('user_id', user_id);

      const responseComment = {
        id: comment.id,
        user_id: comment.user_id,
        username: comment.users?.name || '알 수 없는 사용자',
        avatar_url: comment.users?.avatar_url,
        content: comment.content,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        likes_count: comment.likes_count,
        is_liked: false,
        is_owner: ownerInfo && ownerInfo.length > 0,
        replies: []
      };

      return successResponse(res, responseComment, '댓글이 작성되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/comments/{commentId}/like:
 *   post:
 *     summary: 댓글 좋아요 토글
 *     security:
 *       - bearerAuth: []
 */
router.post('/:commentId/like',
  [
    param('commentId').isUUID().withMessage('유효한 댓글 ID가 아닙니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { commentId } = req.params;
      const user_id = req.user.id;

      // 댓글 존재 여부 확인
      const { data: comment, error: commentError } = await supabaseAdmin
        .from('restaurant_comments')
        .select('id')
        .eq('id', commentId)
        .single();

      if (commentError || !comment) {
        return errorResponse(res, 404, '댓글을 찾을 수 없습니다');
      }

      // 기존 좋아요 여부 확인
      const { data: existingLike } = await supabaseAdmin
        .from('restaurant_comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', user_id)
        .single();

      let isLiked = false;

      if (existingLike) {
        // 좋아요 취소
        const { error: deleteError } = await supabaseAdmin
          .from('restaurant_comment_likes')
          .delete()
          .eq('id', existingLike.id);

        if (deleteError) {
          return errorResponse(res, 500, '좋아요 취소 중 오류가 발생했습니다', deleteError.message);
        }
      } else {
        // 좋아요 추가
        const { error: insertError } = await supabaseAdmin
          .from('restaurant_comment_likes')
          .insert({
            comment_id: commentId,
            user_id
          });

        if (insertError) {
          return errorResponse(res, 500, '좋아요 추가 중 오류가 발생했습니다', insertError.message);
        }

        isLiked = true;
      }

      // 업데이트된 좋아요 수 조회
      const { data: updatedComment } = await supabaseAdmin
        .from('restaurant_comments')
        .select('likes_count')
        .eq('id', commentId)
        .single();

      return successResponse(res, {
        comment_id: commentId,
        is_liked: isLiked,
        likes_count: updatedComment?.likes_count || 0
      }, isLiked ? '좋아요를 눌렀습니다' : '좋아요를 취소했습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/comments/{commentId}:
 *   delete:
 *     summary: 댓글 삭제
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:commentId',
  [
    param('commentId').isUUID().withMessage('유효한 댓글 ID가 아닙니다')
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { commentId } = req.params;
      const user_id = req.user.id;

      // 댓글 소유권 확인
      const { data: comment, error: commentError } = await supabaseAdmin
        .from('restaurant_comments')
        .select('id, user_id')
        .eq('id', commentId)
        .single();

      if (commentError || !comment) {
        return errorResponse(res, 404, '댓글을 찾을 수 없습니다');
      }

      if (comment.user_id !== user_id) {
        return errorResponse(res, 403, '댓글을 삭제할 권한이 없습니다');
      }

      // 댓글 삭제 (cascade로 답글과 좋아요도 함께 삭제됨)
      const { error: deleteError } = await supabaseAdmin
        .from('restaurant_comments')
        .delete()
        .eq('id', commentId);

      if (deleteError) {
        return errorResponse(res, 500, '댓글 삭제 중 오류가 발생했습니다', deleteError.message);
      }

      return successResponse(res, { comment_id: commentId }, '댓글이 삭제되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/comments/{commentId}/report:
 *   post:
 *     summary: 댓글 신고
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: 신고 사유
 *               details:
 *                 type: string
 *                 description: 상세 설명
 *     responses:
 *       200:
 *         description: 신고 완료
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 댓글을 찾을 수 없음
 *       409:
 *         description: 이미 신고한 댓글
 *     security:
 *       - bearerAuth: []
 */
router.post('/:commentId/report',
  [
    param('commentId').isUUID().withMessage('유효한 댓글 ID가 아닙니다'),
    body('reason').notEmpty().trim().withMessage('신고 사유를 입력해주세요'),
    body('details').optional().trim()
  ],
  requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { commentId } = req.params;
      const { reason, details } = req.body;
      const user_id = req.user.id;

      // 댓글 존재 확인
      const { data: comment, error: commentError } = await supabaseAdmin
        .from('restaurant_comments')
        .select('id, user_id')
        .eq('id', commentId)
        .single();

      if (commentError || !comment) {
        return errorResponse(res, 404, '댓글을 찾을 수 없습니다');
      }

      // 자신의 댓글은 신고할 수 없음
      if (comment.user_id === user_id) {
        return errorResponse(res, 400, '본인의 댓글은 신고할 수 없습니다');
      }

      // 중복 신고 확인
      const { data: existingReport } = await supabaseAdmin
        .from('comment_reports')
        .select('id')
        .eq('comment_id', commentId)
        .eq('reporter_id', user_id)
        .single();

      if (existingReport) {
        return errorResponse(res, 409, '이미 신고한 댓글입니다');
      }

      // 신고 추가
      const { data: report, error: reportError } = await supabaseAdmin
        .from('comment_reports')
        .insert({
          comment_id: commentId,
          reporter_id: user_id,
          reason: reason.trim(),
          details: details?.trim() || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (reportError) {
        return errorResponse(res, 500, '신고 처리 중 오류가 발생했습니다', reportError.message);
      }

      // 댓글의 신고 수 증가 (현재 count 조회 후 +1)
      const { data: currentComment, error: selectError } = await supabaseAdmin
        .from('restaurant_comments')
        .select('report_count')
        .eq('id', commentId)
        .single();

      if (!selectError && currentComment) {
        const { error: updateError } = await supabaseAdmin
          .from('restaurant_comments')
          .update({
            report_count: (currentComment.report_count || 0) + 1
          })
          .eq('id', commentId);

        if (updateError) {
          console.warn('신고 수 업데이트 실패:', updateError.message);
        }
      } else {
        console.warn('댓글 신고 수 조회 실패:', selectError?.message);
      }

      return successResponse(res, { report_id: report.id }, '댓글이 신고되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

module.exports = router;