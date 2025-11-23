const winston = require('winston');

// Compact JSON 포맷: 한 줄로 압축 (프로덕션용)
const compactJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Simple JSON 포맷: 구조화되지만 간결한 한 줄 포맷
const simpleJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, ...meta } = info;

    // 기본 로그 문자열
    let log = JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      service,
      message,
      ...(Object.keys(meta).length > 0 ? { meta } : {})
    });

    return log;
  })
);

// 개발 환경용 포맷: 사람이 읽기 쉬운 형식
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // 메타데이터가 있으면 추가
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return msg;
  })
);

// Logger 생성
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? compactJsonFormat : consoleFormat,
  defaultMeta: {
    service: 'foodiemap-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? compactJsonFormat : consoleFormat
    })
  ]
});

// HTTP 로그 전용 로거
const httpLogger = winston.createLogger({
  level: 'info',
  format: process.env.NODE_ENV === 'production' ? compactJsonFormat : simpleJsonFormat,
  defaultMeta: {
    service: 'foodiemap-backend',
    environment: process.env.NODE_ENV || 'development',
    logType: 'HTTP'
  },
  transports: [
    new winston.transports.Console()
  ]
});

// Deploy 로그 전용 로거
const deployLogger = winston.createLogger({
  level: 'info',
  format: process.env.NODE_ENV === 'production' ? compactJsonFormat : simpleJsonFormat,
  defaultMeta: {
    service: 'foodiemap-backend',
    environment: process.env.NODE_ENV || 'development',
    logType: 'DEPLOY'
  },
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = {
  logger,
  httpLogger,
  deployLogger
};
