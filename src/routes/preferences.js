const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// 에러 응답 헬퍼
const errorResponse = (res, status, message, error = null) => {
  console.error(`Error ${status}: ${message}`, error);
  return res.status(status).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// 성공 응답 헬퍼
const successResponse = (res, data, message = 'Success') => {
  return res.json({
    success: true,
    message,
    data
  });
};

/**
 * @swagger
 * /api/preferences:
 *   get:
 *     summary: 사용자 설정 조회
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware.requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 사용자 설정 조회
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return errorResponse(res, 500, '사용자 설정 조회 중 오류가 발생했습니다', error.message);
    }

    // 설정이 없으면 기본값 생성
    if (!data) {
      const { data: newPrefs, error: createError } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          preferred_language: 'ko',
          notification_enabled: true,
          email_notification: true,
          theme: 'light',
          preferences: {}
        })
        .select()
        .single();

      if (createError) {
        return errorResponse(res, 500, '기본 설정 생성 중 오류가 발생했습니다', createError.message);
      }

      return successResponse(res, newPrefs, '기본 설정이 생성되었습니다');
    }

    return successResponse(res, data);

  } catch (error) {
    return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
  }
});

/**
 * @swagger
 * /api/preferences:
 *   put:
 *     summary: 사용자 설정 업데이트
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 */
router.put('/',
  [
    body('preferred_language').optional().isIn(['ko', 'en', 'ja', 'zh']).withMessage('지원하지 않는 언어입니다'),
    body('notification_enabled').optional().isBoolean().withMessage('boolean 값이어야 합니다'),
    body('email_notification').optional().isBoolean().withMessage('boolean 값이어야 합니다'),
    body('theme').optional().isIn(['light', 'dark', 'auto']).withMessage('지원하지 않는 테마입니다'),
    body('preferences').optional().isObject().withMessage('객체 형식이어야 합니다')
  ],
  authMiddleware.requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const userId = req.user.id;
      const updateData = {
        updated_at: new Date().toISOString()
      };

      // 제공된 필드만 업데이트
      if (req.body.preferred_language !== undefined) {
        updateData.preferred_language = req.body.preferred_language;
      }
      if (req.body.notification_enabled !== undefined) {
        updateData.notification_enabled = req.body.notification_enabled;
      }
      if (req.body.email_notification !== undefined) {
        updateData.email_notification = req.body.email_notification;
      }
      if (req.body.theme !== undefined) {
        updateData.theme = req.body.theme;
      }
      if (req.body.preferences !== undefined) {
        updateData.preferences = req.body.preferences;
      }

      // UPSERT (있으면 업데이트, 없으면 생성)
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          ...updateData
        })
        .select()
        .single();

      if (error) {
        return errorResponse(res, 500, '사용자 설정 업데이트 중 오류가 발생했습니다', error.message);
      }

      return successResponse(res, data, '설정이 업데이트되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/preferences/language:
 *   put:
 *     summary: 언어 설정 변경
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 */
router.put('/language',
  [
    body('language').isIn(['ko', 'en', 'ja', 'zh']).withMessage('지원하지 않는 언어입니다')
  ],
  authMiddleware.requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const userId = req.user.id;
      const { language } = req.body;

      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          preferred_language: language,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return errorResponse(res, 500, '언어 설정 변경 중 오류가 발생했습니다', error.message);
      }

      return successResponse(res, data, '언어가 변경되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/preferences/theme:
 *   put:
 *     summary: 테마 설정 변경
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 */
router.put('/theme',
  [
    body('theme').isIn(['light', 'dark', 'auto']).withMessage('지원하지 않는 테마입니다')
  ],
  authMiddleware.requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const userId = req.user.id;
      const { theme } = req.body;

      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          theme,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return errorResponse(res, 500, '테마 설정 변경 중 오류가 발생했습니다', error.message);
      }

      return successResponse(res, data, '테마가 변경되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

/**
 * @swagger
 * /api/preferences/notifications:
 *   put:
 *     summary: 알림 설정 변경
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 */
router.put('/notifications',
  [
    body('notification_enabled').isBoolean().withMessage('boolean 값이어야 합니다'),
    body('email_notification').optional().isBoolean().withMessage('boolean 값이어야 합니다')
  ],
  authMiddleware.requireAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(res, 400, '입력값이 올바르지 않습니다', errors.array());
      }

      const userId = req.user.id;
      const updateData = {
        notification_enabled: req.body.notification_enabled,
        updated_at: new Date().toISOString()
      };

      if (req.body.email_notification !== undefined) {
        updateData.email_notification = req.body.email_notification;
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          ...updateData
        })
        .select()
        .single();

      if (error) {
        return errorResponse(res, 500, '알림 설정 변경 중 오류가 발생했습니다', error.message);
      }

      return successResponse(res, data, '알림 설정이 변경되었습니다');

    } catch (error) {
      return errorResponse(res, 500, '서버 오류가 발생했습니다', error.message);
    }
  }
);

module.exports = router;
