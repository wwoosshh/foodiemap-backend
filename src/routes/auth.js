const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const EmailVerification = require('../models/EmailVerification');

const router = express.Router();

// JWT 토큰 생성
const generateToken = (userId) => {
  const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development-only';
  return jwt.sign({ userId }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// 회원가입
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim()
], async (req, res) => {
  try {
    console.log('📝 회원가입 요청 시작:', req.body);

    // 환경 변수 확인
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.error('❌ Supabase 환경 변수 누락');
      return res.status(500).json({
        success: false,
        message: 'Supabase 환경 변수가 설정되지 않았습니다.'
      });
    }

    if (!process.env.JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET 환경 변수 누락 - 기본값 사용');
    }

    // 입력 검증
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ 입력 검증 실패:', errors.array());
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { email, password, name, phone, avatar_url } = req.body;
    console.log('✅ 입력 검증 통과');

    // 이메일 중복 체크
    console.log('🔍 이메일 중복 체크 시작:', email);
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      console.log('❌ 이메일 중복:', email);

      // 소셜 로그인 계정인지 확인
      const providerNames = {
        'email': '이메일',
        'google': 'Google',
        'kakao': 'Kakao',
        'naver': 'Naver'
      };

      const provider = providerNames[existingUser.auth_provider] || existingUser.auth_provider;

      if (existingUser.auth_provider !== 'email') {
        // 소셜 로그인으로 가입된 계정
        return res.status(409).json({
          success: false,
          message: `이미 ${provider}로 가입된 계정입니다. ${provider} 로그인을 이용해주세요.`,
          error_code: 'EMAIL_ALREADY_EXISTS_WITH_SOCIAL',
          existing_provider: existingUser.auth_provider
        });
      } else {
        // 일반 이메일로 가입된 계정
        return res.status(409).json({
          success: false,
          message: '이미 등록된 이메일입니다.',
          error_code: 'EMAIL_ALREADY_EXISTS'
        });
      }
    }
    console.log('✅ 이메일 중복 체크 통과');

    // 사용자 생성
    console.log('👤 사용자 생성 시작');
    const user = await User.create({
      email,
      password,
      name,
      phone,
      avatar_url
    });
    console.log('✅ 사용자 생성 완료:', user.id);

    // JWT 토큰 생성
    console.log('🔐 JWT 토큰 생성 시작');
    const token = generateToken(user.id);
    console.log('✅ JWT 토큰 생성 완료');

    // 이메일 인증 코드 생성 (개발 모드에서만 반환)
    let verificationData = null;
    try {
      console.log('📧 이메일 인증 코드 생성 시작');
      const verification = await EmailVerification.create(user.id, user.email);
      verificationData = process.env.NODE_ENV === 'development'
        ? { verification_code: verification.code }
        : { email_verification_required: true };
      console.log('✅ 이메일 인증 코드 생성 완료');
    } catch (verificationError) {
      console.warn('⚠️ 이메일 인증 코드 생성 실패:', verificationError.message);
    }

    console.log('🎉 회원가입 성공');
    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified || false
        },
        token,
        ...verificationData
      }
    });

  } catch (error) {
    console.error('❌ 회원가입 오류:', error);
    console.error('❌ 스택 트레이스:', error.stack);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 로그인
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    // 입력 검증
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // 사용자 찾기
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 소셜 로그인 계정 확인
    if (user.auth_provider !== 'email' || !user.password) {
      const providerNames = {
        'email': '이메일',
        'google': 'Google',
        'kakao': 'Kakao',
        'naver': 'Naver'
      };

      const provider = providerNames[user.auth_provider] || user.auth_provider;

      return res.status(400).json({
        success: false,
        message: `이 계정은 ${provider} 로그인으로 가입되었습니다. ${provider} 로그인을 이용해주세요.`,
        error_code: 'SOCIAL_LOGIN_REQUIRED',
        auth_provider: user.auth_provider
      });
    }

    // 비밀번호 확인
    const isPasswordValid = await User.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // JWT 토큰 생성
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: '로그인이 완료되었습니다.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified || false
        },
        token
      }
    });

  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 소셜 로그인 (Google, Kakao, Naver)
router.post('/social-login', [
  body('social_id').notEmpty(),
  body('auth_provider').isIn(['google', 'kakao', 'naver']),
  body('email').isEmail().normalizeEmail(),
  body('name').notEmpty().trim()
], async (req, res) => {
  try {
    console.log('🔐 소셜 로그인 요청 시작:', req.body);

    // 입력 검증
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ 입력 검증 실패:', errors.array());
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { social_id, auth_provider, email, name, phone, avatar_url, social_data } = req.body;
    console.log('✅ 입력 검증 통과');

    // 1단계: 기존 소셜 로그인 사용자 찾기 (social_id로 조회)
    console.log('🔍 소셜 계정 조회 시작:', auth_provider, social_id);
    let user = await User.findBySocialId(auth_provider, social_id);

    if (user) {
      console.log('✅ 기존 소셜 사용자 발견:', user.id);
    } else {
      // 2단계: 같은 이메일로 가입된 계정이 있는지 확인
      console.log('🔍 이메일 중복 체크:', email);
      const existingUser = await User.findByEmail(email);

      if (existingUser) {
        // 같은 이메일이 이미 존재하는 경우
        const providerNames = {
          'email': '이메일',
          'google': 'Google',
          'kakao': 'Kakao',
          'naver': 'Naver'
        };

        const existingProvider = providerNames[existingUser.auth_provider] || existingUser.auth_provider;
        const currentProvider = providerNames[auth_provider] || auth_provider;

        console.log('❌ 이메일 충돌:', email, '기존:', existingUser.auth_provider, '시도:', auth_provider);

        return res.status(409).json({
          success: false,
          message: `이미 ${existingProvider}로 가입된 계정입니다. ${existingProvider} 로그인을 이용해주세요.`,
          error_code: 'EMAIL_ALREADY_EXISTS',
          existing_provider: existingUser.auth_provider
        });
      }

      // 3단계: 새 소셜 로그인 사용자 생성
      console.log('👤 새 소셜 사용자 생성 시작');
      user = await User.createSocialUser({
        email,
        name,
        phone,
        avatar_url,
        auth_provider,
        social_id,
        social_data
      });
      console.log('✅ 새 소셜 사용자 생성 완료:', user.id);
    }

    // JWT 토큰 생성
    console.log('🔐 JWT 토큰 생성 시작');
    const token = generateToken(user.id);
    console.log('✅ JWT 토큰 생성 완료');

    console.log('🎉 소셜 로그인 성공');
    res.json({
      success: true,
      message: '로그인이 완료되었습니다.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified || true,
          created_at: user.created_at
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ 소셜 로그인 오류:', error);
    console.error('❌ 스택 트레이스:', error.stack);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;