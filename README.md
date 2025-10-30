# FoodieMap Backend API

맛집 발견 및 리뷰 플랫폼의 백엔드 API 서버

## 📋 프로젝트 개요

FoodieMap은 사용자들이 맛집을 검색하고, 리뷰를 작성하며, 즐겨찾기를 관리할 수 있는 맛집 플랫폼입니다. 이 저장소는 RESTful API를 제공하는 백엔드 서버입니다.

## 🛠️ 기술 스택

### 핵심 기술
- **Runtime**: Node.js (v18.0 이상)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL with PostGIS)
- **Authentication**: JWT (JSON Web Tokens)
- **Image Storage**: Cloudinary

### 보안
- Helmet - 보안 헤더 설정
- CORS - Cross-Origin Resource Sharing
- express-rate-limit - API 요청 제한
- bcryptjs - 비밀번호 암호화
- express-validator - 입력 검증

### 주요 라이브러리
- Multer - 파일 업로드 처리
- Nodemailer - 이메일 발송
- node-cron - 스케줄 작업
- Winston - 로깅
- Morgan - HTTP 요청 로깅
- Compression - 응답 압축

### 개발 도구
- Vitest - 단위 테스트
- Supertest - API 테스트
- ESLint - 코드 린팅
- Nodemon - 개발 서버 자동 재시작

## 📁 프로젝트 구조

```
backend/
├── src/
│   ├── config/              # 설정 파일
│   │   ├── cloudinary.js   # Cloudinary 설정
│   │   ├── supabase.js     # Supabase 클라이언트
│   │   └── logger.js       # Winston 로거 설정
│   ├── models/             # 데이터 모델
│   │   ├── Restaurant.js   # 맛집 모델
│   │   ├── User.js         # 사용자 모델
│   │   ├── Admin.js        # 관리자 모델
│   │   └── EmailVerification.js
│   ├── routes/             # API 라우트
│   │   ├── auth.js         # 인증 API
│   │   ├── restaurants.js  # 맛집 API
│   │   ├── reviews.js      # 리뷰 API
│   │   ├── categories.js   # 카테고리 API
│   │   ├── admin.js        # 관리자 API
│   │   ├── banners.js      # 배너 API
│   │   ├── events.js       # 이벤트 API
│   │   ├── posts.js        # 게시글 API
│   │   └── home.js         # 홈 API
│   ├── middleware/         # 미들웨어
│   │   ├── auth.js         # JWT 인증
│   │   ├── adminAuth.js    # 관리자 권한 확인
│   │   └── httpLogger.js   # HTTP 로깅
│   ├── services/           # 비즈니스 로직
│   │   └── emailService.js # 이메일 서비스
│   ├── jobs/               # 스케줄 작업
│   │   └── cleanup.js      # 만료 계정 정리
│   └── server.js           # 서버 진입점
├── tests/                  # 테스트 파일
├── package.json
├── render.yaml            # Render 배포 설정
├── vitest.config.js       # 테스트 설정
└── .eslintrc.js          # ESLint 설정
```

## 🚀 시작하기

### 필수 요구사항

- Node.js 18.0 이상
- npm 또는 yarn
- Supabase 계정
- Cloudinary 계정 (이미지 업로드용)

### 설치

```bash
# 의존성 설치
npm install
```

### 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# 서버 설정
NODE_ENV=development
PORT=5000

# Supabase 설정
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# JWT 설정
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Cloudinary 설정
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS 설정
CORS_ORIGIN=http://localhost:3000

# 이메일 설정 (선택사항)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_email_password
```

### 개발 서버 실행

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

서버는 기본적으로 `http://localhost:5000`에서 실행됩니다.

### 테스트

```bash
# 모든 테스트 실행
npm test

# 테스트 커버리지
npm run test:coverage
```

## 📊 API 엔드포인트

### 인증 (Authentication)
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 현재 사용자 정보
- `POST /api/auth/social` - 소셜 로그인 (Kakao, Naver)
- `DELETE /api/auth/account` - 계정 삭제

### 맛집 (Restaurants)
- `GET /api/restaurants` - 맛집 목록 조회
- `GET /api/restaurants/:id` - 맛집 상세 정보
- `POST /api/restaurants` - 맛집 등록 (관리자)
- `PUT /api/restaurants/:id` - 맛집 정보 수정 (관리자)
- `DELETE /api/restaurants/:id` - 맛집 삭제 (관리자)
- `GET /api/restaurants/nearby` - 주변 맛집 검색 (위치 기반)
- `POST /api/restaurants/:id/favorite` - 즐겨찾기 추가/제거
- `POST /api/restaurants/:id/view` - 조회수 증가

### 리뷰 (Reviews)
- `GET /api/reviews` - 리뷰 목록
- `POST /api/reviews` - 리뷰 작성
- `PUT /api/reviews/:id` - 리뷰 수정
- `DELETE /api/reviews/:id` - 리뷰 삭제

### 카테고리 (Categories)
- `GET /api/categories` - 카테고리 목록
- `POST /api/categories` - 카테고리 추가 (관리자)

### 이벤트 (Events)
- `GET /api/events` - 이벤트 목록
- `GET /api/events/:id` - 이벤트 상세
- `POST /api/events` - 이벤트 생성 (관리자)

### 배너 (Banners)
- `GET /api/banners` - 배너 목록
- `POST /api/banners` - 배너 추가 (관리자)

### 관리자 (Admin)
- `GET /api/admin/stats` - 통계 정보
- `GET /api/admin/users` - 사용자 관리
- `POST /api/admin/restaurants` - 맛집 승인/거부

### 기타
- `GET /health` - 서버 상태 확인
- `POST /api/verification/send` - 이메일 인증 발송
- `POST /api/verification/verify` - 이메일 인증 확인

## 🔒 보안 기능

- **JWT 기반 인증**: 안전한 토큰 기반 사용자 인증
- **비밀번호 암호화**: bcrypt를 사용한 비밀번호 해싱
- **Rate Limiting**: API 요청 속도 제한으로 DDoS 방지
- **CORS 설정**: 허용된 도메인만 API 접근 가능
- **입력 검증**: express-validator로 입력 데이터 검증
- **보안 헤더**: Helmet을 통한 보안 헤더 설정

## 🌍 데이터베이스 스키마

### Users 테이블
- id, email, password, name, profile_image
- social_provider, social_id
- created_at, updated_at

### Restaurants 테이블
- id, name, description, address
- latitude, longitude (PostGIS 지원)
- category_id, rating, images
- created_at, updated_at

### Reviews 테이블
- id, user_id, restaurant_id
- rating, comment, images
- created_at, updated_at

### Categories 테이블
- id, name, description

## 📦 배포

### Render 배포

1. GitHub에 코드 푸시
2. Render 대시보드에서 "New Web Service" 선택
3. 저장소 연결
4. 환경 변수 설정
5. 자동 배포 시작

**Build Command**: `npm install`
**Start Command**: `npm start`

### 환경 변수 (프로덕션)

Render 대시보드에서 다음 환경 변수를 설정하세요:
- `NODE_ENV=production`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `CORS_ORIGIN` (프론트엔드 도메인)

## 🧪 테스트 가이드

```bash
# 모든 테스트 실행
npm test

# Watch 모드
npm run test:watch

# 특정 파일 테스트
npm test -- auth.test.js
```

## 📈 로깅 및 모니터링

- **Winston**: 구조화된 로깅
- **Morgan**: HTTP 요청 로깅
- **Health Check**: `/health` 엔드포인트로 서버 상태 확인

## 🔧 스케줄 작업

- **계정 정리**: 매일 자정 삭제 표시된 계정 자동 삭제 (cleanup.js)

## 🤝 기여 가이드

### 코드 스타일

- ESLint 규칙 준수
- 의미있는 변수명 사용
- 주석으로 복잡한 로직 설명

### 커밋 메시지

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가
chore: 빌드 설정 변경
```

## 🐛 문제 해결

### 일반적인 문제

**1. Supabase 연결 오류**
- 환경 변수 `SUPABASE_URL`과 키 확인
- Supabase 프로젝트가 활성 상태인지 확인

**2. JWT 토큰 오류**
- `JWT_SECRET` 환경 변수 확인
- 토큰 만료 시간 확인

**3. Cloudinary 업로드 실패**
- API 키 및 시크릿 확인
- 파일 크기 제한 확인 (기본 10MB)

**4. CORS 오류**
- `CORS_ORIGIN` 환경 변수에 프론트엔드 URL 추가
- 개발 환경에서는 `*` 사용 가능

## 📄 라이선스

이 프로젝트는 개인 프로젝트입니다.

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 생성해 주세요.

---

**Version**: 1.4.6
**Last Updated**: 2025