const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const testSupabaseConnection = require('./utils/testConnection');
const testCloudinaryConnection = require('./utils/testCloudinary');
const app = express();

// Render에서 자동으로 할당하는 포트 사용
const PORT = process.env.PORT || 10000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100 // 최대 100개 요청
});

// 미들웨어 설정
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check 엔드포인트 (Render 필수)
app.get('/health', async (req, res) => {
  const supabaseConnected = await testSupabaseConnection();
  const cloudinaryConnected = await testCloudinaryConnection();

  res.status(200).json({
    status: 'OK',
    message: 'FoodieMap API Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      supabase: supabaseConnected ? 'Connected' : 'Disconnected',
      cloudinary: cloudinaryConnected ? 'Connected' : 'Disconnected'
    }
  });
});

// API 라우트 (나중에 추가)
app.get('/api', (req, res) => {
  res.json({
    message: 'FoodieMap API v1.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      restaurants: '/api/restaurants',
      users: '/api/users'
    }
  });
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong!'
      : err.message
  });
});

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 FoodieMap API Server running on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

  // 서비스 연결 테스트
  await testSupabaseConnection();
  await testCloudinaryConnection();
});

module.exports = app;