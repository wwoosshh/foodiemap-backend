const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const EmailVerification = require('../models/EmailVerification');
const authMiddleware = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

// HTTP URL을 HTTPS로 변환하는 유틸리티 함수
const ensureHttps = (url) => {
  if (!url) return url;
  if (typeof url === 'string' && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

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

    // avatar_url을 HTTPS로 변환
    const secureAvatarUrl = ensureHttps(avatar_url);

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
        avatar_url: secureAvatarUrl,
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

// 카카오 사용자 정보 가져오기 (CORS 우회용)
router.post('/kakao/user-info', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: '인증 코드가 필요합니다.'
      });
    }

    const clientId = '361fbd23bff0c10f74b2df82729b0756';

    // 1. 카카오 토큰 가져오기
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirect_uri,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: '카카오 토큰을 가져올 수 없습니다.',
        error: tokenData
      });
    }

    // 2. 카카오 사용자 정보 가져오기
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const userData = await userResponse.json();
    console.log('✅ Kakao user info:', userData);

    if (userData.id) {
      const avatarUrl = userData.properties?.profile_image || userData.kakao_account?.profile?.profile_image_url || undefined;

      res.json({
        success: true,
        data: {
          social_id: userData.id.toString(),
          email: userData.kakao_account?.email || '',
          name: userData.properties?.nickname || userData.kakao_account?.profile?.nickname || '사용자',
          avatar_url: ensureHttps(avatarUrl),
          auth_provider: 'kakao',
          social_data: userData
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: '카카오 사용자 정보를 가져올 수 없습니다.'
      });
    }
  } catch (error) {
    console.error('카카오 사용자 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 네이버 사용자 정보 가져오기 (CORS 우회용)
router.post('/naver/user-info', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        message: '액세스 토큰이 필요합니다.'
      });
    }

    // 네이버 API 호출 (Node.js 내장 fetch 사용)
    const response = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const data = await response.json();

    if (data.resultcode === '00' && data.response) {
      const user = data.response;
      res.json({
        success: true,
        data: {
          social_id: user.id,
          email: user.email || '',
          name: user.name || user.nickname || '사용자',
          phone: user.mobile || user.mobile_e164 || undefined,
          avatar_url: ensureHttps(user.profile_image),
          auth_provider: 'naver',
          social_data: user
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: '네이버 사용자 정보를 가져올 수 없습니다.'
      });
    }
  } catch (error) {
    console.error('네이버 사용자 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 프로필 이미지 업로드
router.post('/upload-profile-image', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: '이미지 데이터가 필요합니다.'
      });
    }

    // Cloudinary에 업로드
    const result = await cloudinary.uploader.upload(image, {
      folder: 'foodiemap/profiles',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' }
      ]
    });

    res.json({
      success: true,
      message: '이미지 업로드 완료',
      data: {
        url: result.secure_url,
        public_id: result.public_id
      }
    });

  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '이미지 업로드 중 오류가 발생했습니다.'
    });
  }
});

// 프로필 정보 수정
router.put('/profile',
  authMiddleware,
  [
    body('name').optional().notEmpty().trim().withMessage('이름을 입력해주세요'),
    body('phone').optional().trim(),
    body('avatar_url').optional().isURL().withMessage('올바른 URL 형식이 아닙니다'),
    body('current_password').optional(),
    body('new_password').optional().isLength({ min: 6 }).withMessage('비밀번호는 최소 6자 이상이어야 합니다')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '입력값이 올바르지 않습니다',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { name, phone, avatar_url, current_password, new_password } = req.body;

      // 비밀번호 변경 요청 시
      if (new_password) {
        // 소셜 로그인 계정은 비밀번호 변경 불가
        if (req.user.auth_provider !== 'email') {
          return res.status(400).json({
            success: false,
            message: '소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.'
          });
        }

        // 현재 비밀번호 확인 필수
        if (!current_password) {
          return res.status(400).json({
            success: false,
            message: '현재 비밀번호를 입력해주세요.'
          });
        }

        // 현재 비밀번호 검증
        const isPasswordValid = await User.verifyPassword(current_password, req.user.password);
        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            message: '현재 비밀번호가 일치하지 않습니다.'
          });
        }

        // 새 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await User.update(userId, { password: hashedPassword });
      }

      // 프로필 정보 업데이트
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

      if (Object.keys(updateData).length > 0) {
        await User.update(userId, updateData);
      }

      // 업데이트된 사용자 정보 조회
      const updatedUser = await User.findById(userId);

      res.json({
        success: true,
        message: '프로필이 수정되었습니다.',
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            phone: updatedUser.phone,
            avatar_url: updatedUser.avatar_url,
            email_verified: updatedUser.email_verified || false,
            auth_provider: updatedUser.auth_provider
          }
        }
      });

    } catch (error) {
      console.error('프로필 수정 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }
  }
);

// 현재 사용자 정보 조회
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified || false,
          auth_provider: user.auth_provider,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;