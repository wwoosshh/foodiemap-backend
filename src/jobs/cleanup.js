const cron = require('node-cron');
const User = require('../models/User');

/**
 * 만료된 계정 삭제 크론잡
 *
 * 스케줄: 매일 새벽 3시 (한국 시간)
 *
 * 크론 표현식: '0 3 * * *'
 * - 분: 0
 * - 시: 3
 * - 일: 매일
 * - 월: 매월
 * - 요일: 매주
 */

// 매일 새벽 3시에 실행 (서버의 시간대 기준)
cron.schedule('0 3 * * *', async () => {
  try {
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧹 [크론잡] 만료된 계정 삭제 작업 시작`);
    console.log(`   시각: ${now}`);
    console.log(`${'='.repeat(60)}\n`);

    // 삭제 작업 실행
    const deletedCount = await User.deleteExpiredAccounts();

    if (deletedCount > 0) {
      console.log(`✅ [크론잡] ${deletedCount}개의 만료된 계정 삭제 완료`);
      console.log(`   - 탈퇴 요청일로부터 30일이 경과한 계정`);
      console.log(`   - 관련 데이터 (리뷰, 즐겨찾기 등) 모두 삭제됨`);
    } else {
      console.log(`ℹ️  [크론잡] 삭제할 만료된 계정이 없습니다`);
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [크론잡] 만료된 계정 삭제 작업 실패`);
    console.error(`   에러: ${error.message}`);
    console.error(`${'='.repeat(60)}\n`);
    console.error('전체 에러 스택:', error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Seoul" // 한국 시간대 설정
});

console.log('⏰ 계정 삭제 크론잡 등록 완료');
console.log('   - 실행 주기: 매일 새벽 3시 (한국 시간)');
console.log('   - 작업 내용: 탈퇴 요청 후 30일 경과 계정 자동 삭제\n');

module.exports = { /* 크론잡은 자동 실행됨 */ };
