const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { email, password, name, phone, avatar_url } = userData;

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
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
    const { email, name, phone, avatar_url, auth_provider, social_id, social_data } = userData;

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        name,
        phone: phone || null,
        avatar_url: avatar_url || null,
        auth_provider,
        social_id,
        social_data: social_data || null,
        password: null, // 소셜 로그인은 비밀번호 불필요
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

  // 회원 탈퇴 요청
  static async requestDeletion(userId, reason = null) {
    const { data, error } = await supabase
      .rpc('request_account_deletion', {
        user_id: userId,
        reason: reason
      });

    if (error) throw error;
    return data;
  }

  // 계정 복구
  static async recoverAccount(userId) {
    const { data, error } = await supabase
      .rpc('recover_account', {
        user_id: userId
      });

    if (error) throw error;
    return data;
  }

  // 탈퇴 상태 조회
  static async getDeletionStatus(userId) {
    const { data, error } = await supabase
      .rpc('get_deletion_status', {
        user_id: userId
      });

    if (error) throw error;
    return data;
  }

  // 만료된 계정 삭제 (관리자용 또는 크론잡용)
  static async deleteExpiredAccounts() {
    const { data, error } = await supabase
      .rpc('delete_expired_accounts');

    if (error) throw error;
    return data;
  }
}

module.exports = User;