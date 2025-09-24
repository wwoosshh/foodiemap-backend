const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

class Admin {
  static async create(adminData) {
    const { email, password, name, role = 'admin', permissions = [] } = adminData;

    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(password, 12); // 관리자는 더 강한 해시

    const { data, error } = await supabase
      .from('admins')
      .insert([{
        email,
        password: hashedPassword,
        name,
        role,
        permissions: JSON.stringify(permissions),
        is_active: true,
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
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    return data;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateLastLogin(id) {
    const { error } = await supabase
      .from('admins')
      .update({
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  // 관리자 권한 확인
  static hasPermission(admin, permission) {
    if (admin.role === 'super_admin') return true;

    try {
      const permissions = JSON.parse(admin.permissions || '[]');
      return permissions.includes(permission);
    } catch {
      return false;
    }
  }

  // 사용자 관리 권한
  static canManageUsers(admin) {
    return this.hasPermission(admin, 'manage_users');
  }

  // 맛집 관리 권한
  static canManageRestaurants(admin) {
    return this.hasPermission(admin, 'manage_restaurants');
  }

  // 시스템 관리 권한
  static canManageSystem(admin) {
    return this.hasPermission(admin, 'manage_system');
  }
}

module.exports = Admin;