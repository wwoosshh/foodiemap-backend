const supabase = require('../config/supabase');

async function testSupabaseConnection() {
  try {
    console.log('🔍 Supabase 연결 테스트 시작...');

    // 환경 변수 확인
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log('❌ Supabase 환경 변수가 설정되지 않음');
      return false;
    }

    // 간단한 연결 테스트 (RPC 호출)
    const { data, error } = await supabase.rpc('ping');

    // ping 함수가 없어도 연결은 성공한 것으로 간주
    if (error && error.code === 'PGRST202') {
      console.log('✅ Supabase 연결 성공! (ping 함수 없음)');
      return true;
    }

    if (error) {
      console.log('❌ Supabase 연결 실패:', error.message);
      return false;
    }

    console.log('✅ Supabase 연결 성공!');
    console.log('📍 URL:', process.env.SUPABASE_URL);
    console.log('🔑 ANON Key:', process.env.SUPABASE_ANON_KEY ? '설정됨' : '설정되지 않음');
    console.log('🔐 Service Key:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '설정되지 않음');

    return true;
  } catch (err) {
    console.log('❌ Supabase 연결 중 예외 발생:', err.message);
    return false;
  }
}

module.exports = testSupabaseConnection;