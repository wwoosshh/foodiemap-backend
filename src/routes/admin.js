const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const User = require('../models/User');
const supabase = require('../config/supabase');
const { adminAuth, requirePermission, requireSuperAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// 메모리 기반 2차 인증 저장소
const authCodes = new Map(); // { email: { code, expiresAt, adminData } }

// JWT 토큰 생성 (관리자용)
const generateAdminToken = (adminId) => {
  const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development-only';
  return jwt.sign({ adminId }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h' // 관리자는 24시간
  });
};

// 6자리 보안 인증코드 생성 (나노초 기반)
const generateAuthCode = () => {
  // 현재 시간의 나노초를 솔트로 사용
  const now = process.hrtime.bigint(); // 나노초 정밀도
  const salt = now.toString();

  // 솔트와 랜덤 값을 결합하여 해시 생성
  const crypto = require('crypto');
  const combined = salt + Math.random().toString() + Date.now().toString();
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  // 해시에서 6자리 숫자 추출
  const code = parseInt(hash.substring(0, 8), 16) % 900000 + 100000;

  return code.toString();
};

// 관리자 로그인
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    console.log('🔐 관리자 로그인 시도:', req.body.email);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ 입력 검증 실패:', errors.array());
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log('✅ 입력 검증 통과, 이메일:', email);

    // 관리자 찾기
    console.log('👤 관리자 계정 검색 중...');
    console.log('Admin 모델 확인:', typeof Admin);
    console.log('Admin.findByEmail 함수:', typeof Admin.findByEmail);

    let admin;
    try {
      admin = await Admin.findByEmail(email);
      console.log('DB 검색 결과:', admin ? 'found' : 'not found');
      if (admin) {
        console.log('찾은 관리자 정보:', {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          is_active: admin.is_active,
          permissions_raw: admin.permissions
        });
      }
    } catch (error) {
      console.error('❌ Admin.findByEmail 오류:', error);
      throw new Error(`Admin.findByEmail failed: ${error.message}`);
    }

    if (!admin) {
      console.log('❌ 관리자 계정을 찾을 수 없음:', email);
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 비밀번호 확인
    console.log('🔑 비밀번호 검증 중...');
    let isPasswordValid;
    try {
      isPasswordValid = await Admin.verifyPassword(password, admin.password);
      console.log('비밀번호 검증 결과:', isPasswordValid);
    } catch (error) {
      console.error('❌ Admin.verifyPassword 오류:', error);
      throw new Error(`Password verification failed: ${error.message}`);
    }

    if (!isPasswordValid) {
      console.log('❌ 비밀번호 불일치');
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    console.log('✅ 비밀번호 검증 성공');

    // 2차 인증 코드 생성
    const authCode = generateAuthCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

    // permissions 파싱
    let permissions;
    try {
      permissions = JSON.parse(admin.permissions || '[]');
    } catch (error) {
      console.error('❌ permissions JSON 파싱 오류:', error);
      permissions = [];
    }

    // 메모리에 인증 코드 저장
    authCodes.set(email, {
      code: authCode,
      expiresAt,
      adminData: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions
      }
    });

    // 🔐 서버 로그에 인증 코드 출력 (Render 로그창에서 확인 가능)
    console.log('');
    console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.log('🔐 ADMIN 2차 인증 코드가 생성되었습니다 🔐');
    console.log('👤 관리자:', admin.name, `(${admin.email})`);
    console.log('🔢 인증 코드:', authCode);
    console.log('⏰ 만료 시간:', expiresAt.toISOString());
    console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.log('');

    res.json({
      success: true,
      message: '2차 인증 코드가 서버 로그에 출력되었습니다. Render 로그창을 확인하세요.',
      requiresVerification: true,
      data: {
        email: admin.email,
        name: admin.name
      }
    });

  } catch (error) {
    console.error('❌ 관리자 로그인 오류 발생:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', error);

    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      ...(process.env.NODE_ENV !== 'production' && {
        error: error.message,
        stack: error.stack
      })
    });
  }
});

// 2차 인증 코드 검증
router.post('/verify-auth', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
    console.log('🔐 관리자 2차 인증 검증 시도:', req.body.email);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { email, code } = req.body;

    // 저장된 인증 코드 확인
    const authData = authCodes.get(email);
    if (!authData) {
      console.log('❌ 인증 코드를 찾을 수 없음:', email);
      return res.status(401).json({
        success: false,
        message: '인증 코드가 존재하지 않습니다. 다시 로그인해 주세요.'
      });
    }

    // 만료 시간 확인
    if (new Date() > authData.expiresAt) {
      authCodes.delete(email);
      console.log('❌ 인증 코드가 만료됨:', email);
      return res.status(401).json({
        success: false,
        message: '인증 코드가 만료되었습니다. 다시 로그인해 주세요.'
      });
    }

    // 코드 검증
    if (authData.code !== code) {
      console.log('❌ 잘못된 인증 코드:', { expected: authData.code, received: code });
      return res.status(401).json({
        success: false,
        message: '잘못된 인증 코드입니다.'
      });
    }

    // 인증 성공 - 토큰 생성
    const token = generateAdminToken(authData.adminData.id);

    // 마지막 로그인 시간 업데이트
    try {
      await Admin.updateLastLogin(authData.adminData.id);
      console.log('✅ 마지막 로그인 시간 업데이트 완료');
    } catch (error) {
      console.error('⚠️ 마지막 로그인 시간 업데이트 실패:', error);
    }

    // 사용된 코드 삭제
    authCodes.delete(email);

    console.log('✅ 관리자 2차 인증 성공:', authData.adminData.email);

    res.json({
      success: true,
      message: '관리자 로그인이 완료되었습니다.',
      data: {
        admin: authData.adminData,
        token
      }
    });

  } catch (error) {
    console.error('❌ 2차 인증 검증 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 목록 조회
router.get('/users', adminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('id, email, name, phone, email_verified, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        users: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('사용자 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 맛집 목록 조회 (관리자용)
router.get('/restaurants', adminAuth, requirePermission('manage_restaurants'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('restaurants')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          icon
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq('category_id', category);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        restaurants: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('맛집 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 시스템 통계
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [usersResult, restaurantsResult, reviewsResult] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('restaurants').select('*', { count: 'exact', head: true }),
      supabase.from('reviews').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      success: true,
      data: {
        users: usersResult.count || 0,
        restaurants: restaurantsResult.count || 0,
        reviews: reviewsResult.count || 0,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('시스템 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// Super Admin 전용 - 관리자 생성
router.post('/create-admin', adminAuth, requireSuperAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').notEmpty().trim(),
  body('permissions').isArray()
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

    const { email, password, name, permissions, role = 'admin' } = req.body;

    // 이메일 중복 체크
    const existingAdmin = await Admin.findByEmail(email);
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: '이미 등록된 관리자 이메일입니다.'
      });
    }

    const admin = await Admin.create({
      email,
      password,
      name,
      role,
      permissions
    });

    res.status(201).json({
      success: true,
      message: '관리자가 성공적으로 생성되었습니다.',
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      }
    });

  } catch (error) {
    console.error('관리자 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;