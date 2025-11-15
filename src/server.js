const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

// 필수 환경 변수 검증
const requiredEnvVars = [
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'KAKAO_CLIENT_ID',
  'CLEANUP_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Please check your .env file and ensure all required variables are set.');
  console.error('   Refer to .env.example for the required format.\n');
  process.exit(1);
}

console.log('✅ All required environment variables are set');

const testSupabaseConnection = require('./utils/testConnection');
const testCloudinaryConnection = require('./utils/testCloudinary');
const { logger, deployLogger } = require('./config/logger');
const httpLoggingMiddleware = require('./middleware/httpLogger');
const app = express();

// Render에서 자동으로 할당하는 포트 사용
const PORT = process.env.PORT || 10000;

// Rate limiting - 전역 설정 (일반 API)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100개 요청
  message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - 인증 엔드포인트 (엄격)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회 시도
  message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - 회원가입 엔드포인트
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 3, // 최대 3회 가입 시도
  message: '가입 시도 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - 이메일 인증 엔드포인트
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회
  message: '인증 요청 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// HTTPS 강제 리디렉션 (프로덕션 환경)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Render/Heroku 등의 프록시 환경에서는 x-forwarded-proto 헤더 확인
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });

  // HSTS (HTTP Strict Transport Security) 헤더 추가
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

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
// CORS 설정 - 화이트리스트 기반
const allowedOrigins = [
  'https://www.mzcube.com',
  'https://mzcube.com',
  'https://foodiemap-website.vercel.app'
];

// 개발 환경에서만 localhost 허용
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push(
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3004',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3005',
    'http://localhost:3009'
  );
}

app.use(cors({
  origin: (origin, callback) => {
    // origin이 없는 경우 허용 (같은 origin 요청, Postman 등)
    if (!origin) {
      return callback(null, true);
    }

    // 화이트리스트에 있는 경우 허용
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // 프로덕션에서는 거부, 개발 환경에서는 경고 후 허용
      if (process.env.NODE_ENV === 'production') {
        logger.warn('CORS blocked request from unauthorized origin', { origin });
        callback(new Error('Not allowed by CORS'));
      } else {
        logger.warn('CORS: Allowing unauthorized origin in development', { origin });
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// 기본 요청 크기 제한 (보안 강화)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 이미지 업로드 경로만 높은 제한 적용
app.use('/api/auth/upload-profile-image', express.json({ limit: '10mb' }));

// 루트 경로 - Render 헬스체크 대응
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'FoodieMap API Server',
    version: '1.0',
    documentation: '/api'
  });
});

// Health check 엔드포인트 (Render 필수) - 간단한 버전
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// 상세 헬스 체크 (내부 모니터링용) - API 키 인증 필요
app.get('/health/detailed', async (req, res) => {
  // API 키 인증
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== process.env.CLEANUP_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

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
const bannerRoutes = require('./routes/banners');
const reviewRoutes = require('./routes/reviews');
const homeRoutes = require('./routes/home');
const restaurantDetailRoutes = require('./routes/restaurantDetails');
const eventRoutes = require('./routes/events');
const preferencesRoutes = require('./routes/preferences');

// 크론잡 시작 (만료된 계정 자동 삭제)
require('./jobs/cleanup');

// 라우트 설정 with Rate Limiting
// 인증 관련 라우트는 엄격한 Rate Limiting 적용
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/social', authLimiter); // 소셜 로그인도 제한
app.use('/api/auth', authRoutes);

app.use('/api/categories', categoryRoutes);

// 이메일 인증 엔드포인트
app.use('/api/verification', verificationLimiter, verificationRoutes);

app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/restaurants', restaurantDetailRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/preferences', preferencesRoutes);

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
      banners: '/api/banners',
      reviews: '/api/reviews',
      home: '/api/home',
      restaurantDetails: '/api/restaurant-details',
      events: '/api/events',
      preferences: '/api/preferences'
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