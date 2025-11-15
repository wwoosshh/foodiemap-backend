const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { email, password, name, phone, avatar_url } = userData;

    // 비밀번호 해시화 (12 라운드 - 보안 강화)
    console.log('🔐 회원가입 비밀번호 해싱');
    console.log('  원본 비밀번호:', password);
    console.log('  원본 비밀번호 길이:', password.length);
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log('  생성된 해시 전체:', hashedPassword);
    console.log('  생성된 해시 길이:', hashedPassword.length);

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash: hashedPassword,
        auth_provider: 'email',
        name,
        phone: phone || null,
        avatar_url: avatar_url || null,
        email_verified: false,
        email_verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async update(id, updateData) {
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(id) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  // 소셜 로그인 사용자 찾기
  static async findBySocialId(authProvider, socialId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_provider', authProvider)
      .eq('social_id', socialId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // 소셜 로그인 사용자 생성
  static async createSocialUser(userData) {
    const { email, name, phone, avatar_url, auth_provider, social_id } = userData;

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        name,
        phone: phone || null,
        avatar_url: avatar_url || null,
        auth_provider,
        social_id,
        password_hash: null, // 소셜 로그인은 비밀번호 불필요
        email_verified: true, // 소셜 계정은 이미 인증됨
        email_verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // 회원 탈퇴 요청 (간소화 버전 - 새 DB 스키마에 맞춤)
  static async requestDeletion(userId, reason = null) {
    // deleted_at을 현재 시각으로 설정
    const { data, error } = await supabase
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return {
      message: '회원 탈퇴가 완료되었습니다.',
      deletion_scheduled_at: data.deleted_at,
      deletion_deadline: data.deleted_at
    };
  }

  // 계정 복구
  static async recoverAccount(userId) {
    const { data, error } = await supabase
      .from('users')
      .update({
        deleted_at: null,
        is_active: true
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { message: '계정이 복구되었습니다.' };
  }

  // 탈퇴 상태 조회
  static async getDeletionStatus(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('deleted_at, is_active')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const isDeletionScheduled = !!data.deleted_at;

    return {
      is_deletion_scheduled: isDeletionScheduled,
      is_active: data.is_active,
      deletion_scheduled_at: data.deleted_at,
      deletion_deadline: data.deleted_at,
      days_remaining: 0,
      can_recover: isDeletionScheduled,
      message: isDeletionScheduled ? '탈퇴 요청된 계정입니다.' : '정상 계정입니다.'
    };
  }

  // 만료된 계정 삭제 (비활성화)
  static async deleteExpiredAccounts() {
    // 새 DB에서는 soft delete만 지원
    return 0;
  }
}

module.exports = User;