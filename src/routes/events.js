const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { query, validationResult } = require('express-validator');

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

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: 진행 중인 이벤트 목록 조회
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 이벤트 목록
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('페이지는 1 이상이어야 합니다'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit는 1-100 사이여야 합니다')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      // 진행 중인 이벤트 조회 (종료 날짜가 없거나 현재보다 미래인 것)
      const { data: events, error: eventsError, count } = await supabase
        .from('events')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (eventsError) {
        return errorResponse(res, 500, '이벤트 목록 조회에 실패했습니다', eventsError.message);
      }

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / limit);

      return successResponse(res, {
        events: events || [],
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }, '이벤트 목록 조회 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/events/notices:
 *   get:
 *     summary: 공지사항 목록 조회
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 공지사항 목록
 */
router.get('/notices',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('페이지는 1 이상이어야 합니다'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit는 1-100 사이여야 합니다')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      // 공지사항 조회
      const { data: notices, error: noticesError, count } = await supabase
        .from('notices')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('is_important', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (noticesError) {
        return errorResponse(res, 500, '공지사항 목록 조회에 실패했습니다', noticesError.message);
      }

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / limit);

      return successResponse(res, {
        notices: notices || [],
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }, '공지사항 목록 조회 성공');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/events/notices/{id}:
 *   get:
 *     summary: 공지사항 상세 조회
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 공지사항 상세
 *       404:
 *         description: 공지사항을 찾을 수 없음
 */
router.get('/notices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 공지사항 조회
    const { data: notice, error: noticeError } = await supabase
      .from('notices')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (noticeError || !notice) {
      return errorResponse(res, 404, '공지사항을 찾을 수 없습니다');
    }

    // 조회수 증가
    await supabase
      .from('notices')
      .update({ view_count: (notice.view_count || 0) + 1 })
      .eq('id', id);

    return successResponse(res, notice, '공지사항 조회 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: 이벤트 상세 조회
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 이벤트 상세
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 이벤트 조회
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (eventError || !event) {
      return errorResponse(res, 404, '이벤트를 찾을 수 없습니다');
    }

    // 조회수 증가 (view_count 컬럼이 있을 경우에만)
    if (event.view_count !== undefined) {
      await supabase
        .from('events')
        .update({ view_count: (event.view_count || 0) + 1 })
        .eq('id', id);
    }

    return successResponse(res, event, '이벤트 조회 성공');

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

module.exports = router;
