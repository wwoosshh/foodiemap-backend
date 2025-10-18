const { v4: uuidv4 } = require('uuid');
const { httpLogger } = require('../config/logger');

/**
 * Railway 스타일의 상세한 HTTP 로깅 미들웨어
 * 각 요청에 대해 구조화된 JSON 로그를 생성합니다
 */
const httpLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  // 요청 ID를 헤더와 로컬 변수에 저장
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // 요청 시작 로그
  const requestLog = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    fullUrl: req.originalUrl,
    host: req.get('host'),
    protocol: req.protocol,
    httpVersion: `HTTP/${req.httpVersion}`,
    srcIp: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown',
    referer: req.get('referer') || req.get('referrer') || 'direct',
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    // 민감한 정보는 제외
    headers: {
      'content-type': req.get('content-type'),
      'accept': req.get('accept'),
      'accept-language': req.get('accept-language'),
      'origin': req.get('origin')
    }
  };

  // 응답 완료 시 상세 로그 기록
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const responseLog = {
      ...requestLog,
      httpStatus: res.statusCode,
      statusMessage: res.statusMessage,
      totalDuration: duration,
      contentLength: res.get('content-length') || 0,
      responseTime: `${duration}ms`,
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    };

    // 로그 레벨에 따라 기록
    if (responseLog.level === 'error') {
      httpLogger.error('HTTP Request', responseLog);
    } else if (responseLog.level === 'warn') {
      httpLogger.warn('HTTP Request', responseLog);
    } else {
      httpLogger.info('HTTP Request', responseLog);
    }
  });

  // 에러 발생 시 로그
  res.on('error', (err) => {
    const duration = Date.now() - startTime;

    httpLogger.error('HTTP Request Error', {
      ...requestLog,
      totalDuration: duration,
      error: {
        message: err.message,
        stack: err.stack,
        code: err.code
      }
    });
  });

  next();
};

module.exports = httpLoggingMiddleware;
