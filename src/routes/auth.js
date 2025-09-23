const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const router = express.Router();

// JWT 토큰 생성
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
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
    // 입력 검증
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
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: '이미 등록된 이메일입니다.'
      });
    }

    // 사용자 생성
    const user = await User.create({
      email,
      password,
      name,
      phone
    });

    // JWT 토큰 생성
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone
        },
        token
      }
    });

  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
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
          phone: user.phone
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

module.exports = router;