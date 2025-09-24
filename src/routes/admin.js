const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const User = require('../models/User');
const { adminAuth, requirePermission, requireSuperAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// JWT 토큰 생성 (관리자용)
const generateAdminToken = (adminId) => {
  const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development-only';
  return jwt.sign({ adminId }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h' // 관리자는 24시간
  });
};

// 관리자 로그인
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
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

    const { email, password } = req.body;

    // 관리자 찾기
    const admin = await Admin.findByEmail(email);
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 비밀번호 확인
    const isPasswordValid = await Admin.verifyPassword(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }

    // 마지막 로그인 시간 업데이트
    await Admin.updateLastLogin(admin.id);

    // JWT 토큰 생성
    const token = generateAdminToken(admin.id);

    res.json({
      success: true,
      message: '관리자 로그인이 완료되었습니다.',
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: JSON.parse(admin.permissions || '[]')
        },
        token
      }
    });

  } catch (error) {
    console.error('관리자 로그인 오류:', error);
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