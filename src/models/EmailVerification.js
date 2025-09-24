const supabase = require('../config/supabase');
const crypto = require('crypto');

class EmailVerification {
  static async create(userId, email) {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후 만료

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
    return { ...data, code }; // 실제 운영에서는 code를 반환하지 않음
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
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString()
      })
      .eq('id', data.user_id);

    if (userUpdateError) throw userUpdateError;

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
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 숫자
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