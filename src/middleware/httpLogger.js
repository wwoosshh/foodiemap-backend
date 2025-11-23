const { v4: uuidv4 } = require('uuid');
const { httpLogger } = require('../config/logger');

/**
 * Railway 스타일의 상세한 HTTP 로깅 미들웨어
 * 각 요청에 대해 구조화된 JSON 로그를 생성합니다
 */
const httpLoggingMiddleware = (req, res, next) => {
  // OPTIONS 요청 (CORS preflight)은 로깅하지 않음
  if (req.method === 'OPTIONS') {
    return next();
  }

  const startTime = Date.now();
  const requestId = uuidv4();

  // 요청 ID를 헤더와 로컬 변수에 저장
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // 요청 시작 로그 (간결화)
  const requestLog = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown'
  };

  // 응답 완료 시 간결한 로그 기록
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const responseLog = {
      ...requestLog,
      status: res.statusCode,
      duration: `${duration}ms`
    };

    // 로그 레벨에 따라 기록 (4xx, 5xx만 상세 로깅)
    if (res.statusCode >= 500) {
      httpLogger.error('HTTP Error', responseLog);
    } else if (res.statusCode >= 400) {
      httpLogger.warn('HTTP Client Error', responseLog);
    } else {
      // 2xx, 3xx는 info 레벨로 간단히 기록
      httpLogger.info('HTTP', responseLog);
    }
  });

  // 에러 발생 시 로그
  res.on('error', (err) => {
    const duration = Date.now() - startTime;

    httpLogger.error('HTTP Stream Error', {
      ...requestLog,
      duration: `${duration}ms`,
      error: err.message,
      stack: err.stack
    });
  });

  next();
};

module.exports = httpLoggingMiddleware;
