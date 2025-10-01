const express = require('express');
const { body, validationResult } = require('express-validator');
const EmailVerification = require('../models/EmailVerification');
const auth = require('../middleware/auth');

const router = express.Router();

// 이메일 인증 코드 전송
router.post('/send-email-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '올바른 이메일을 입력해주세요.',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // 이미 인증된 이메일인지 확인
    const isVerified = await EmailVerification.isEmailVerified(email);
    if (isVerified) {
      return res.status(400).json({
        success: false,
        message: '이미 인증된 이메일입니다.'
      });
    }

    // 인증 코드 생성 및 전송 (실제로는 이메일 서비스 연동 필요)
    const verification = await EmailVerification.create(null, email);

    // 개발 모드에서만 코드 반환 (실제 운영에서는 이메일로만 전송)
    const responseData = process.env.NODE_ENV === 'development'
      ? { verification_code: verification.code }
      : {};

    res.json({
      success: true,
      message: '인증 코드가 이메일로 전송되었습니다.',
      data: responseData
    });

  } catch (error) {
    console.error('이메일 인증 코드 전송 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 이메일 인증 코드 확인
router.post('/verify-email', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { email, code } = req.body;

    const verification = await EmailVerification.verify(email, code);
    if (!verification) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않거나 만료된 인증 코드입니다.'
      });
    }

    res.json({
      success: true,
      message: '이메일 인증이 완료되었습니다.',
      data: {
        email_verified: true,
        verified_at: verification.verified_at
      }
    });

  } catch (error) {
    console.error('이메일 인증 확인 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 인증 코드 재전송
router.post('/resend-email-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '올바른 이메일을 입력해주세요.',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const verification = await EmailVerification.resend(email);

    // 개발 모드에서만 코드 반환
    const responseData = process.env.NODE_ENV === 'development'
      ? { verification_code: verification.code }
      : {};

    res.json({
      success: true,
      message: '새로운 인증 코드가 전송되었습니다.',
      data: responseData
    });

  } catch (error) {
    console.error('인증 코드 재전송 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;