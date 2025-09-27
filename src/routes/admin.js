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
    const { page = 1, limit = 20, search = '', email_verified = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('id, email, name, phone, email_verified, avatar_url, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (email_verified !== '') {
      query = query.eq('email_verified', email_verified === 'true');
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // 모든 사용자는 동일한 권한을 가진 일반 사용자
    const normalizedUsers = data.map(user => ({
      ...user,
      role: 'user', // 모든 users 테이블의 사용자는 일반 사용자
      permissions: [] // 일반 사용자는 특별한 권한 없음
    }));

    res.json({
      success: true,
      data: {
        users: normalizedUsers,
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

// 사용자 상세 조회
router.get('/users/:id', adminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, phone, avatar_url, email_verified, email_verified_at, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 모든 사용자는 일반 사용자
    const normalizedUser = {
      ...data,
      role: 'user',
      permissions: []
    };

    res.json({
      success: true,
      data: normalizedUser
    });

  } catch (error) {
    console.error('사용자 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 생성
router.post('/users', adminAuth, requirePermission('manage_users'), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim()
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

    const { email, password, name, phone } = req.body;

    // 이메일 중복 체크
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: '이미 등록된 이메일입니다.'
      });
    }

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 12);

    // 사용자 생성 (일반 사용자만 생성 가능)
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        name,
        phone,
        email_verified: false
      })
      .select('id, email, name, phone, email_verified, avatar_url, created_at')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: '사용자가 성공적으로 생성되었습니다.',
      data: {
        ...newUser,
        role: 'user',
        permissions: []
      }
    });

  } catch (error) {
    console.error('사용자 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 수정
router.put('/users/:id', adminAuth, requirePermission('manage_users'), [
  body('email').optional().isEmail().normalizeEmail(),
  body('name').optional().notEmpty().trim()
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

    const { id } = req.params;
    const { email, name, phone } = req.body;

    // 사용자 존재 확인
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', id)
      .single();

    if (findError || !existingUser) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 이메일 변경 시 중복 체크
    if (email && email !== existingUser.email) {
      const { data: emailExists } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: '이미 사용 중인 이메일입니다.'
        });
      }
    }

    // 업데이트할 데이터 준비 (role과 permissions 제외)
    const updateData = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    // 사용자 정보 업데이트
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, phone, avatar_url, email_verified, created_at, updated_at')
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: '사용자 정보가 성공적으로 수정되었습니다.',
      data: {
        ...updatedUser,
        role: 'user',
        permissions: []
      }
    });

  } catch (error) {
    console.error('사용자 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 삭제
router.delete('/users/:id', adminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;

    // 사용자 존재 확인
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', id)
      .single();

    if (findError || !existingUser) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 사용자 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: '사용자가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('사용자 삭제 오류:', error);
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
    console.log('📊 시스템 통계 조회 시작');

    // 기본 통계 쿼리들
    const [
      usersResult,
      restaurantsResult,
      reviewsResult,
      categoriesResult
    ] = await Promise.all([
      // 전체 사용자 + 최근 7일 가입자
      supabase
        .from('users')
        .select('id, created_at, email_verified', { count: 'exact' }),

      // 전체 맛집 + 카테고리별 분포
      supabase
        .from('restaurants')
        .select(`
          id,
          created_at,
          categories:category_id(name)
        `, { count: 'exact' }),

      // 전체 리뷰 + 평균 평점
      supabase
        .from('restaurant_reviews')
        .select('id, rating, created_at', { count: 'exact' }),

      // 카테고리 목록
      supabase
        .from('categories')
        .select('id, name')
    ]);

    if (usersResult.error) throw usersResult.error;
    if (restaurantsResult.error) throw restaurantsResult.error;
    if (reviewsResult.error) throw reviewsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;

    // 사용자 통계 계산
    const users = usersResult.data || [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const userStats = {
      total: usersResult.count || 0,
      verified: users.filter(u => u.email_verified).length,
      recent: users.filter(u => new Date(u.created_at) > sevenDaysAgo).length
    };

    // 맛집 통계 계산
    const restaurants = restaurantsResult.data || [];
    const restaurantStats = {
      total: restaurantsResult.count || 0,
      recent: restaurants.filter(r => new Date(r.created_at) > sevenDaysAgo).length,
      by_category: {}
    };

    // 카테고리별 맛집 분포 계산
    const categories = categoriesResult.data || [];
    categories.forEach(category => {
      restaurantStats.by_category[category.name] = restaurants.filter(
        r => r.categories?.name === category.name
      ).length;
    });

    // 리뷰 통계 계산
    const reviews = reviewsResult.data || [];
    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const reviewStats = {
      total: reviewsResult.count || 0,
      average_rating: reviews.length > 0 ? totalRating / reviews.length : 0,
      recent: reviews.filter(r => new Date(r.created_at) > sevenDaysAgo).length
    };

    const statsData = {
      users: userStats,
      restaurants: restaurantStats,
      reviews: reviewStats,
      timestamp: now.toISOString()
    };

    console.log('✅ 시스템 통계 조회 완료:', {
      users: userStats.total,
      restaurants: restaurantStats.total,
      reviews: reviewStats.total
    });

    res.json({
      success: true,
      data: statsData
    });

  } catch (error) {
    console.error('❌ 시스템 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '시스템 통계를 불러오는 중 오류가 발생했습니다.',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
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

// 리뷰 목록 조회 (관리자용)
router.get('/reviews', adminAuth, requirePermission('manage_reviews'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', rating = '', restaurant_id = '', user_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('restaurant_reviews')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email,
          avatar_url
        ),
        restaurants:restaurant_id (
          id,
          name,
          address,
          categories:category_id (
            id,
            name
          )
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`comment.ilike.%${search}%,users.name.ilike.%${search}%,restaurants.name.ilike.%${search}%`);
    }

    if (rating) {
      query = query.eq('rating', rating);
    }

    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }

    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        reviews: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('관리자 리뷰 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 리뷰 상세 조회 (관리자용)
router.get('/reviews/:id', adminAuth, requirePermission('manage_reviews'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('restaurant_reviews')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email,
          avatar_url
        ),
        restaurants:restaurant_id (
          id,
          name,
          address,
          categories:category_id (
            id,
            name
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '리뷰를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('관리자 리뷰 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 리뷰 삭제 (관리자용)
router.delete('/reviews/:id', adminAuth, requirePermission('manage_reviews'), async (req, res) => {
  try {
    const { id } = req.params;

    // 리뷰 존재 확인
    const { data: existingReview, error: findError } = await supabase
      .from('restaurant_reviews')
      .select('id, user_id, restaurant_id')
      .eq('id', id)
      .single();

    if (findError || !existingReview) {
      return res.status(404).json({
        success: false,
        message: '리뷰를 찾을 수 없습니다.'
      });
    }

    // 리뷰 삭제
    const { error: deleteError } = await supabase
      .from('restaurant_reviews')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: '리뷰가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('관리자 리뷰 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// === 신고 관리 API ===

// 리뷰 신고 목록 조회
router.get('/reports/reviews', adminAuth, requirePermission('manage_reports'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('review_reports')
      .select(`
        *,
        review:review_id (
          id,
          comment,
          rating,
          user:user_id (
            id,
            name,
            email
          ),
          restaurant:restaurant_id (
            id,
            name
          )
        ),
        reporter:reporter_id (
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        reports: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('리뷰 신고 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 댓글 신고 목록 조회
router.get('/reports/comments', adminAuth, requirePermission('manage_reports'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('comment_reports')
      .select(`
        *,
        comment:comment_id (
          id,
          content,
          user:user_id (
            id,
            name,
            email
          ),
          restaurant:restaurant_id (
            id,
            name
          )
        ),
        reporter:reporter_id (
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        reports: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('댓글 신고 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 리뷰 신고 처리
router.patch('/reports/reviews/:id', adminAuth, requirePermission('manage_reports'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, delete_content } = req.body;

    // 신고 상태 업데이트
    const { error: updateError } = await supabase
      .from('review_reports')
      .update({
        status,
        admin_notes,
        admin_id: req.admin.id,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // 콘텐츠 삭제 요청 시
    if (delete_content) {
      const { data: report } = await supabase
        .from('review_reports')
        .select('review_id')
        .eq('id', id)
        .single();

      if (report?.review_id) {
        const { error: deleteError } = await supabase
          .from('restaurant_reviews')
          .delete()
          .eq('id', report.review_id);

        if (deleteError) {
          console.error('리뷰 삭제 실패:', deleteError);
        }
      }
    }

    res.json({
      success: true,
      message: '신고가 처리되었습니다.'
    });

  } catch (error) {
    console.error('리뷰 신고 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 댓글 신고 처리
router.patch('/reports/comments/:id', adminAuth, requirePermission('manage_reports'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, delete_content } = req.body;

    // 신고 상태 업데이트
    const { error: updateError } = await supabase
      .from('comment_reports')
      .update({
        status,
        admin_notes,
        admin_id: req.admin.id,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // 콘텐츠 삭제 요청 시
    if (delete_content) {
      const { data: report } = await supabase
        .from('comment_reports')
        .select('comment_id')
        .eq('id', id)
        .single();

      if (report?.comment_id) {
        const { error: deleteError } = await supabase
          .from('restaurant_comments')
          .delete()
          .eq('id', report.comment_id);

        if (deleteError) {
          console.error('댓글 삭제 실패:', deleteError);
        }
      }
    }

    res.json({
      success: true,
      message: '신고가 처리되었습니다.'
    });

  } catch (error) {
    console.error('댓글 신고 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;