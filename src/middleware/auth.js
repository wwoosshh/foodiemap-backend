const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    // 사용자 존재 확인
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      });
    }

    // 계정 활성 상태 확인 (보안 강화)
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: '비활성화된 계정입니다.'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('인증 오류:', error);
    res.status(401).json({
      success: false,
      message: '유효하지 않은 토큰입니다.'
    });
  }
};

// 선택적 인증 미들웨어 (로그인하지 않아도 통과, 로그인 시 user 정보 추가)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      // 토큰이 없어도 통과 (req.user는 undefined)
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (user) {
      req.user = user;
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // 토큰이 유효하지 않아도 통과 (req.user는 null)
    console.warn('선택적 인증 - 토큰 검증 실패:', error.message);
    req.user = null;
    next();
  }
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuthMiddleware;