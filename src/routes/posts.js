const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { body, validationResult } = require('express-validator');

// 환경 변수 검증
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY environment variable is required');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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

// ==================== 이벤트 포스트 ====================

/**
 * @swagger
 * /api/posts/events/{eventId}:
 *   get:
 *     summary: 이벤트 포스트 조회 (본문 포함)
 *     tags: [Posts]
 */
router.get('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // 이벤트 포스트 조회
    const { data: post, error: postError } = await supabase
      .from('event_posts')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'published')
      .single();

    if (postError || !post) {
      return errorResponse(res, 404, '이벤트 포스트를 찾을 수 없습니다');
    }

    // 조회수 증가
    await supabase
      .from('event_posts')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', post.id);

    return successResponse(res, post, '이벤트 포스트 조회 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

/**
 * @swagger
 * /api/posts/events:
 *   post:
 *     summary: 이벤트 포스트 생성 (관리자)
 *     tags: [Posts]
 */
router.post('/events',
  [
    body('event_id').isUUID().withMessage('유효한 이벤트 ID를 입력해주세요'),
    body('title').notEmpty().withMessage('제목을 입력해주세요'),
    body('content').notEmpty().withMessage('본문을 입력해주세요'),
    body('content_type').optional().isIn(['html', 'markdown']).withMessage('content_type은 html 또는 markdown이어야 합니다'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const {
        event_id,
        title,
        content,
        content_type = 'html',
        excerpt,
        thumbnail_url,
        author_id,
        status = 'published',
        slug,
        seo_title,
        seo_description,
        seo_keywords,
        tags
      } = req.body;

      const { data: post, error: postError } = await supabase
        .from('event_posts')
        .insert({
          event_id,
          title,
          content,
          content_type,
          excerpt,
          thumbnail_url,
          author_id,
          status,
          slug,
          seo_title,
          seo_description,
          seo_keywords,
          tags,
          published_at: status === 'published' ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (postError) {
        return errorResponse(res, 500, '이벤트 포스트 생성에 실패했습니다', postError.message);
      }

      return successResponse(res, post, '이벤트 포스트 생성 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/posts/events/{id}:
 *   put:
 *     summary: 이벤트 포스트 수정 (관리자)
 *     tags: [Posts]
 */
router.put('/events/:id',
  [
    body('title').optional().notEmpty().withMessage('제목을 입력해주세요'),
    body('content').optional().notEmpty().withMessage('본문을 입력해주세요'),
    body('content_type').optional().isIn(['html', 'markdown']).withMessage('content_type은 html 또는 markdown이어야 합니다'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { id } = req.params;
      const updateData = { ...req.body };

      // published 상태로 변경 시 published_at 설정
      if (updateData.status === 'published') {
        const { data: existingPost } = await supabase
          .from('event_posts')
          .select('published_at')
          .eq('id', id)
          .single();

        if (existingPost && !existingPost.published_at) {
          updateData.published_at = new Date().toISOString();
        }
      }

      const { data: post, error: postError } = await supabase
        .from('event_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (postError || !post) {
        return errorResponse(res, 404, '이벤트 포스트를 찾을 수 없습니다', postError?.message);
      }

      return successResponse(res, post, '이벤트 포스트 수정 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/posts/events/{id}:
 *   delete:
 *     summary: 이벤트 포스트 삭제 (관리자)
 *     tags: [Posts]
 */
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error: deleteError } = await supabase
      .from('event_posts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return errorResponse(res, 500, '이벤트 포스트 삭제에 실패했습니다', deleteError.message);
    }

    return successResponse(res, { id }, '이벤트 포스트 삭제 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

// ==================== 공지사항 포스트 ====================

/**
 * @swagger
 * /api/posts/notices/{noticeId}:
 *   get:
 *     summary: 공지사항 포스트 조회 (본문 포함)
 *     tags: [Posts]
 */
router.get('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;

    // 공지사항 포스트 조회
    const { data: post, error: postError } = await supabase
      .from('notice_posts')
      .select('*')
      .eq('notice_id', noticeId)
      .eq('status', 'published')
      .single();

    if (postError || !post) {
      return errorResponse(res, 404, '공지사항 포스트를 찾을 수 없습니다');
    }

    // 조회수 증가
    await supabase
      .from('notice_posts')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', post.id);

    return successResponse(res, post, '공지사항 포스트 조회 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

/**
 * @swagger
 * /api/posts/notices:
 *   post:
 *     summary: 공지사항 포스트 생성 (관리자)
 *     tags: [Posts]
 */
router.post('/notices',
  [
    body('notice_id').isUUID().withMessage('유효한 공지사항 ID를 입력해주세요'),
    body('title').notEmpty().withMessage('제목을 입력해주세요'),
    body('content').notEmpty().withMessage('본문을 입력해주세요'),
    body('content_type').optional().isIn(['html', 'markdown']).withMessage('content_type은 html 또는 markdown이어야 합니다'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const {
        notice_id,
        title,
        content,
        content_type = 'html',
        excerpt,
        thumbnail_url,
        author_id,
        status = 'published',
        slug,
        seo_title,
        seo_description,
        seo_keywords,
        tags
      } = req.body;

      const { data: post, error: postError } = await supabase
        .from('notice_posts')
        .insert({
          notice_id,
          title,
          content,
          content_type,
          excerpt,
          thumbnail_url,
          author_id,
          status,
          slug,
          seo_title,
          seo_description,
          seo_keywords,
          tags,
          published_at: status === 'published' ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (postError) {
        return errorResponse(res, 500, '공지사항 포스트 생성에 실패했습니다', postError.message);
      }

      return successResponse(res, post, '공지사항 포스트 생성 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/posts/notices/{id}:
 *   put:
 *     summary: 공지사항 포스트 수정 (관리자)
 *     tags: [Posts]
 */
router.put('/notices/:id',
  [
    body('title').optional().notEmpty().withMessage('제목을 입력해주세요'),
    body('content').optional().notEmpty().withMessage('본문을 입력해주세요'),
    body('content_type').optional().isIn(['html', 'markdown']).withMessage('content_type은 html 또는 markdown이어야 합니다'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const { id } = req.params;
      const updateData = { ...req.body };

      // published 상태로 변경 시 published_at 설정
      if (updateData.status === 'published') {
        const { data: existingPost } = await supabase
          .from('notice_posts')
          .select('published_at')
          .eq('id', id)
          .single();

        if (existingPost && !existingPost.published_at) {
          updateData.published_at = new Date().toISOString();
        }
      }

      const { data: post, error: postError } = await supabase
        .from('notice_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (postError || !post) {
        return errorResponse(res, 404, '공지사항 포스트를 찾을 수 없습니다', postError?.message);
      }

      return successResponse(res, post, '공지사항 포스트 수정 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/posts/notices/{id}:
 *   delete:
 *     summary: 공지사항 포스트 삭제 (관리자)
 *     tags: [Posts]
 */
router.delete('/notices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error: deleteError } = await supabase
      .from('notice_posts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return errorResponse(res, 500, '공지사항 포스트 삭제에 실패했습니다', deleteError.message);
    }

    return successResponse(res, { id }, '공지사항 포스트 삭제 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

module.exports = router;
