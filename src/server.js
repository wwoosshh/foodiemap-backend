const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const testSupabaseConnection = require('./utils/testConnection');
const testCloudinaryConnection = require('./utils/testCloudinary');
const { logger, deployLogger } = require('./config/logger');
const httpLoggingMiddleware = require('./middleware/httpLogger');
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
// 로깅 미들웨어 - 환경에 따라 선택
if (process.env.ENABLE_DETAILED_LOGGING === 'true') {
  // 상세한 JSON 로깅 (Railway 스타일)
  logger.info('🔍 Detailed HTTP logging enabled (Railway style)');
  app.use(httpLoggingMiddleware);
} else {
  // 기본 Morgan 로깅
  app.use(morgan('combined'));
}
app.use(cors({
  origin: [
    'https://www.mzcube.com',
    'https://mzcube.com',
    'https://foodiemap-website.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3004',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3005',
    'http://localhost:3009',
    process.env.CORS_ORIGIN
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 루트 경로 - Render 헬스체크 대응
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'FoodieMap API Server',
    version: '1.0',
    documentation: '/api'
  });
});

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

// API 라우트
const authRoutes = require('./routes/auth');
const restaurantRoutes = require('./routes/restaurants');
const categoryRoutes = require('./routes/categories');
const verificationRoutes = require('./routes/verification');
const adminRoutes = require('./routes/admin');
const bannerRoutes = require('./routes/banners');
const reviewRoutes = require('./routes/reviews');
const homeRoutes = require('./routes/home');
const restaurantDetailRoutes = require('./routes/restaurantDetails');
const eventRoutes = require('./routes/events');

// 크론잡 시작 (만료된 계정 자동 삭제)
require('./jobs/cleanup');

app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/restaurant-details', restaurantDetailRoutes);
app.use('/api/events', eventRoutes);

// API 정보
app.get('/api', (req, res) => {
  res.json({
    message: 'FoodieMap API v1.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      restaurants: '/api/restaurants',
      categories: '/api/categories',
      verification: '/api/verification',
      admin: '/api/admin',
      banners: '/api/banners',
      reviews: '/api/reviews',
      home: '/api/home',
      restaurantDetails: '/api/restaurant-details',
      events: '/api/events'
    }
  });
});

// 404 핸들러
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  logger.error('Server Error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong!'
      : err.message,
    requestId: req.requestId
  });
});

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
  deployLogger.info('Server Starting', {
    port: PORT,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    detailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true'
  });

  console.log(`🚀 FoodieMap API Server running on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Detailed Logging: ${process.env.ENABLE_DETAILED_LOGGING === 'true' ? 'Enabled' : 'Disabled'}`);

  // 서비스 연결 테스트
  await testSupabaseConnection();
  await testCloudinaryConnection();
});

module.exports = app;