const winston = require('winston');

// 커스텀 포맷: JSON 형식으로 구조화된 로그
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
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
  format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat,
  defaultMeta: {
    service: 'foodiemap-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat
    })
  ]
});

// HTTP 로그 전용 로거
const httpLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
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
  format: jsonFormat,
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
