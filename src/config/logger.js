const winston = require('winston');

// Pretty JSON 포맷: 들여쓰기가 있는 읽기 쉬운 JSON
const prettyJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    // timestamp와 level을 제외한 나머지를 JSON으로 출력
    const { timestamp, level, message, ...rest } = info;

    // 전체 로그 객체를 보기 좋게 포맷
    const logObject = {
      timestamp,
      level,
      message,
      ...rest
    };

    return JSON.stringify(logObject, null, 2); // 들여쓰기 2칸
  })
);

// Compact JSON 포맷: 한 줄로 압축 (필요시)
const compactJsonFormat = winston.format.combine(
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
  format: process.env.NODE_ENV === 'production' ? prettyJsonFormat : consoleFormat,
  defaultMeta: {
    service: 'foodiemap-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? prettyJsonFormat : consoleFormat
    })
  ]
});

// HTTP 로그 전용 로거
const httpLogger = winston.createLogger({
  level: 'info',
  format: prettyJsonFormat,
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
  format: prettyJsonFormat,
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
