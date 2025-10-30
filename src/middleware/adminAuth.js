const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// 관리자 인증 미들웨어
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not configured');
      return res.status(500).json({
        success: false,
        message: '서버 설정 오류가 발생했습니다.'
      });
    }

    const decoded = jwt.verify(token, jwtSecret);

    // 관리자인지 확인
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 관리자 토큰입니다.'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('관리자 인증 오류:', error);
    res.status(401).json({
      success: false,
      message: '관리자 인증에 실패했습니다.'
    });
  }
};

// 특정 권한 확인 미들웨어
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!Admin.hasPermission(req.admin, permission)) {
      return res.status(403).json({
        success: false,
        message: `${permission} 권한이 필요합니다.`
      });
    }
    next();
  };
};

// Super Admin 권한 확인
const requireSuperAdmin = (req, res, next) => {
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: '최고 관리자 권한이 필요합니다.'
    });
  }
  next();
};

module.exports = {
  adminAuth,
  requirePermission,
  requireSuperAdmin
};