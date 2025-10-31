const supabase = require('../config/supabase');
const crypto = require('crypto');
const { sendVerificationEmail, sendVerificationSuccessEmail } = require('../utils/emailService');

class EmailVerification {
  static async create(userId, email) {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

    const { data, error } = await supabase
      .from('email_verifications')
      .insert([{
        user_id: userId,
        email,
        code,
        expires_at: expiresAt.toISOString(),
        is_verified: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // 사용자 이름 가져오기
    let userName = '사용자';
    if (userId) {
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();
      if (userData) userName = userData.name;
    }

    // 이메일 발송
    try {
      await sendVerificationEmail(email, code, userName);
      console.log(`✅ 인증 메일 발송 완료: ${email}`);
    } catch (emailError) {
      console.error('❌ 이메일 발송 실패:', emailError);
      // 이메일 발송 실패해도 인증 코드는 생성됨 (개발 모드에서 테스트용)
    }

    return { ...data, code }; // 개발 모드에서만 code 반환
  }

  static async verify(email, code) {
    const { data, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('is_verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    // 인증 완료 처리
    const { error: updateError } = await supabase
      .from('email_verifications')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('id', data.id);

    if (updateError) throw updateError;

    // 사용자 이메일 인증 상태 업데이트
    const { data: userData, error: userUpdateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString()
      })
      .eq('id', data.user_id)
      .select('name')
      .single();

    if (userUpdateError) throw userUpdateError;

    // 인증 완료 메일 발송 (선택사항)
    try {
      const userName = userData?.name || '사용자';
      await sendVerificationSuccessEmail(email, userName);
    } catch (emailError) {
      console.error('인증 완료 메일 발송 실패 (무시됨):', emailError);
    }

    return data;
  }

  static async resend(email) {
    // 기존 미인증 코드들을 모두 만료 처리
    await supabase
      .from('email_verifications')
      .update({ is_verified: true }) // 만료된 것으로 처리
      .eq('email', email)
      .eq('is_verified', false);

    // 새 인증 코드 생성
    const user = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!user.data) throw new Error('User not found');

    return this.create(user.data.id, email);
  }

  static generateVerificationCode() {
    // 암호학적으로 안전한 난수 생성 (보안 강화)
    return crypto.randomInt(100000, 1000000).toString(); // 6자리 숫자
  }

  static async isEmailVerified(email) {
    const { data, error } = await supabase
      .from('users')
      .select('email_verified')
      .eq('email', email)
      .single();

    if (error) return false;
    return data?.email_verified || false;
  }
}

module.exports = EmailVerification;