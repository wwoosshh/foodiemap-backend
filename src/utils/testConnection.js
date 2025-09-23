const supabase = require('../config/supabase');

async function testSupabaseConnection() {
  try {
    console.log('🔍 Supabase 연결 테스트 시작...');

    // 기본 연결 테스트
    const { data, error } = await supabase
      .from('_supabase')
      .select('*')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
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