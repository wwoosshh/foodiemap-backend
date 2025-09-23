# 🚀 FoodieMap Backend API

**Render 클라우드에 배포되는 맛집 앱 백엔드 서버**

## 📋 개요

FoodieMap 앱의 백엔드 API 서버입니다. Node.js와 Express.js 기반으로 구축되었으며, Render 클라우드 플랫폼에 배포하도록 최적화되었습니다.

## 🛠️ 기술 스택

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB Atlas
- **Cloud Platform**: Render
- **Authentication**: JWT
- **Security**: Helmet, CORS, Rate Limiting

## 📁 프로젝트 구조

```
backend/
├── src/
│   ├── controllers/     # API 컨트롤러
│   ├── models/         # MongoDB 데이터 모델
│   ├── routes/         # API 라우트
│   ├── middleware/     # 미들웨어 (인증, 검증 등)
│   ├── services/       # 비즈니스 로직
│   └── utils/          # 유틸리티 함수
├── config/            # 설정 파일
├── tests/            # 테스트 파일
├── docker/           # Docker 설정
├── package.json      # 프로젝트 의존성
└── server.js         # 서버 진입점
```

## 🚀 시작하기

### 필수 요구사항

- Node.js 18.0 이상
- npm 9.0 이상
- MongoDB Atlas 계정

### 로컬 개발 설정

```bash
npm install
```

### 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
NODE_ENV=development
PORT=10000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/foodiemap
JWT_SECRET=your-super-secure-jwt-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

### 개발 서버 실행

```bash
npm run dev
```

### Render 배포 서버 실행

```bash
npm start
```

## 📊 API 엔드포인트

### 인증 (Authentication)
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 사용자 정보 조회

### 맛집 (Restaurants)
- `GET /api/restaurants` - 맛집 목록 조회
- `POST /api/restaurants` - 맛집 등록
- `GET /api/restaurants/:id` - 맛집 상세 조회
- `PUT /api/restaurants/:id` - 맛집 정보 수정
- `DELETE /api/restaurants/:id` - 맛집 삭제

### 카테고리 (Categories)
- `GET /api/categories` - 카테고리 목록 조회
- `POST /api/categories` - 카테고리 추가

### 사용자 (Users)
- `GET /api/users/favorites` - 즐겨찾기 목록
- `POST /api/users/favorites/:restaurantId` - 즐겨찾기 추가
- `DELETE /api/users/favorites/:restaurantId` - 즐겨찾기 제거

## 🔒 보안

- **JWT 토큰**: 사용자 인증
- **CORS**: Cross-Origin 요청 제한
- **Rate Limiting**: API 요청 제한
- **Helmet**: 보안 헤더 설정
- **입력 검증**: Express Validator 사용

## 🧪 테스트

```bash
# 전체 테스트 실행
npm test

# 특정 테스트 파일 실행
npm test -- --testNamePattern="Auth"

# 테스트 커버리지
npm run test:coverage
```

## 📦 Render 배포

### 1. GitHub 저장소 연결

1. 백엔드 코드를 GitHub 저장소에 푸시
2. Render 대시보드에서 "New Web Service" 선택
3. GitHub 저장소 연결
4. 루트 디렉토리를 백엔드 폴더로 설정

### 2. Render 배포 설정

**Build Command**: `npm install`
**Start Command**: `npm start`
**Port**: `10000` (자동 할당)

### 3. 환경 변수 설정 (Render 대시보드)

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/foodiemap
JWT_SECRET=your-super-secure-production-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

### 4. MongoDB Atlas 설정

1. MongoDB Atlas에서 새 클러스터 생성
2. 데이터베이스 사용자 추가
3. Render IP 주소를 화이트리스트에 추가 (0.0.0.0/0)
4. 연결 문자열을 환경 변수에 추가

### 5. 자동 배포

- GitHub main 브랜치에 push하면 자동 배포
- Render에서 빌드 로그 확인 가능
- Health check: `https://your-app.onrender.com/health`

## 📈 모니터링

- **Health Check**: `GET /health`
- **API 응답 시간**: Morgan 로거 사용
- **에러 추적**: 콘솔 로그 및 클라우드 로그

## 🤝 개발 가이드라인

### 코드 스타일
- ESLint 설정 준수
- Prettier 포맷터 사용

### 커밋 메시지
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가
```

## 📝 API 문서

Postman Collection 또는 Swagger 문서를 통해 API 상세 문서를 확인할 수 있습니다.

## 🐛 문제 해결

### 자주 발생하는 문제

1. **MongoDB 연결 오류**
   - MONGODB_URI 환경 변수 확인
   - MongoDB Atlas IP 화이트리스트 확인

2. **JWT 토큰 오류**
   - JWT_SECRET 환경 변수 확인
   - 토큰 만료 시간 확인

3. **CORS 오류**
   - CORS 설정에서 허용된 도메인 확인