# 🚀 백엔드 배포 가이드

## 📋 배포 전 체크리스트

- [x] 새 DB 프로젝트 생성 완료 (dyggpvkksiazbiuikvwm)
- [x] 초기 데이터 SQL 생성 완료
- [x] .env 파일이 .gitignore에 포함됨 확인
- [ ] 클라우드 서버 환경 변수 설정
- [ ] 초기 데이터 SQL 실행

---

## 🎯 지원 배포 플랫폼

### 1. Render.com (권장)
- Node.js 자동 감지
- 무료 플랜 제공
- 자동 HTTPS
- GitHub 연동 자동 배포

### 2. Railway.app
- 간편한 설정
- GitHub 연동
- 무료 크레딧 제공

### 3. Vercel
- Node.js 서버리스 함수 지원
- GitHub 연동

---

## 🔧 Render.com 배포 (권장)

### Step 1: Render 계정 생성 및 연결

1. https://render.com 접속
2. GitHub 계정으로 로그인
3. Dashboard → New → Web Service
4. GitHub 저장소 연결

### Step 2: 배포 설정

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
npm start
```

**Environment Variables 설정:**
```bash
NODE_ENV=production
PORT=10000

# Supabase 설정 (새 DB)
SUPABASE_URL=https://dyggpvkksiazbiuikvwm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z2dwdmtrc2lhemJpdWlrdndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDIxMjAsImV4cCI6MjA3ODUxODEyMH0.gRbeXsuL0NZjGfNiyMHet_MXxktjGnRhtjqDMc9IY0w
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z2dwdmtrc2lhemJpdWlrdndtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk0MjEyMCwiZXhwIjoyMDc4NTE4MTIwfQ.mSkOGQaC2uYBpQSntrH0OrwLFwCoPUWTaKhnAVrrSZI

# Cloudinary
CLOUDINARY_CLOUD_NAME=dnmwvwnrv
CLOUDINARY_API_KEY=129887792713127
CLOUDINARY_API_SECRET=uCJJi9VRPat_Gb3WXK-HMA-ErmI

# JWT
JWT_SECRET=your-super-secure-jwt-secret-key-here-minimum-32-characters
JWT_EXPIRES_IN=7d

# 소셜 로그인
KAKAO_CLIENT_ID=361fbd23bff0c10f74b2df82729b0756

# Cleanup API
CLEANUP_API_KEY=888d92d4ef9cedb7911606e360d1fb059eb206b19590033b6435048a3857a2e7

# 이메일
EMAIL_USER=nunconnect1@gmail.com
EMAIL_PASSWORD=rjob hclp igrq ictf
```

### Step 3: 배포 시작

1. "Create Web Service" 클릭
2. 자동 빌드 및 배포 시작
3. 배포 완료 후 URL 확인 (예: `https://your-app.onrender.com`)

---

## 📊 배포 후 작업

### 1. Supabase 초기 데이터 입력

**Supabase SQL Editor에서 실행:**

`D:\Cube\docs\database\initial_data.sql` 파일 내용 복사 → SQL Editor에 붙여넣기 → Run

이 SQL은 다음을 생성합니다:
- ✅ 15개 카테고리
- ✅ 20개 기본 태그
- ✅ 2개 샘플 배너
- ✅ 1개 공지사항
- ✅ 3개 샘플 레스토랑 (테스트용)

### 2. API 테스트

배포된 서버 URL로 테스트:

```http
# 카테고리 조회
GET https://your-app.onrender.com/api/categories

# 회원가입
POST https://your-app.onrender.com/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "test1234",
  "name": "테스트 유저"
}
```

### 3. CORS 설정 확인

프론트엔드 도메인이 `server.js`의 CORS 화이트리스트에 포함되어 있는지 확인:

**D:\Cube\backend\src\server.js 확인:**
```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://your-frontend-domain.vercel.app' // ← 프론트엔드 URL 추가
];
```

---

## 🔄 자동 배포 (CI/CD)

GitHub에 푸시하면 Render가 자동으로:
1. 변경사항 감지
2. npm install 실행
3. npm start로 서버 재시작

**배포 트리거:**
```bash
git add .
git commit -m "Update backend"
git push origin main
```

→ Render가 자동으로 새 버전 배포

---

## 📝 환경 변수 관리

### 로컬 개발 (.env)
```bash
NODE_ENV=development
SUPABASE_URL=https://dyggpvkksiazbiuikvwm.supabase.co
```

### 프로덕션 (Render Dashboard)
```bash
NODE_ENV=production
SUPABASE_URL=https://dyggpvkksiazbiuikvwm.supabase.co
```

**중요:** `.env` 파일은 절대 GitHub에 푸시하지 마세요!

---

## 🐛 배포 문제 해결

### 1. 빌드 실패
- Render 대시보드 → Logs 확인
- `npm install` 에러 → package.json 확인

### 2. 서버 시작 실패
- 환경 변수 누락 확인
- Logs에서 에러 메시지 확인

### 3. DB 연결 실패
- SUPABASE_URL, SUPABASE_SERVICE_KEY 확인
- Supabase 프로젝트 활성화 상태 확인

### 4. CORS 에러
- server.js의 allowedOrigins에 프론트엔드 URL 추가
- 재배포 필요

---

## 📞 배포 완료 체크리스트

- [ ] Render에 배포 완료
- [ ] 배포 URL 확인
- [ ] Supabase 초기 데이터 입력
- [ ] 카테고리 조회 API 테스트 성공
- [ ] 회원가입 API 테스트 성공
- [ ] 소셜 로그인 테스트 성공
- [ ] CORS 설정 확인
- [ ] 프론트엔드에 API URL 설정

---

## 🎯 다음 단계

1. **프론트엔드 배포**
   - Vercel 또는 Netlify에 배포
   - API URL 환경 변수 설정

2. **Restaurant 모델 마이그레이션**
   - 새 스키마에 맞게 모델 수정
   - 라우트 업데이트

3. **테스트 및 모니터링**
   - 전체 기능 테스트
   - 로그 모니터링

배포 완료 후 URL을 알려주세요!
