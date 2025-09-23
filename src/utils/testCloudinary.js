const cloudinary = require('../config/cloudinary');

async function testCloudinaryConnection() {
  try {
    console.log('🔍 Cloudinary 연결 테스트 시작...');

    // 환경 변수 확인
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      console.log('❌ Cloudinary 환경 변수가 설정되지 않음');
      return false;
    }

    // Cloudinary API 테스트 (ping)
    const result = await cloudinary.api.ping();

    if (result.status === 'ok') {
      console.log('✅ Cloudinary 연결 성공!');
      console.log('☁️ Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
      console.log('🔑 API Key:', process.env.CLOUDINARY_API_KEY ? '설정됨' : '설정되지 않음');
      return true;
    } else {
      console.log('❌ Cloudinary 연결 실패');
      return false;
    }
  } catch (err) {
    console.log('❌ Cloudinary 연결 중 예외 발생:', err.message);
    return false;
  }
}

module.exports = testCloudinaryConnection;