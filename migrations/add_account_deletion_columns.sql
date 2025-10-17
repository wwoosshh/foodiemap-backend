-- ================================================
-- 회원 탈퇴 기능을 위한 데이터베이스 스키마 수정
-- ================================================
-- 작성일: 2025-01-01
-- 설명: users 테이블에 회원 탈퇴 관련 컬럼 추가
--       30일 유예기간 후 자동 삭제 처리

-- 1. users 테이블에 탈퇴 관련 컬럼 추가
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 컬럼 설명:
-- - deletion_scheduled_at: 탈퇴 요청 시각 (NULL이면 정상 상태, 값이 있으면 탈퇴 대기 상태)
-- - deletion_reason: 탈퇴 사유 (선택사항)
-- - is_active: 계정 활성화 상태 (FALSE면 로그인 불가)

-- 2. 기존 users에 is_active 기본값 설정
UPDATE users
SET is_active = TRUE
WHERE is_active IS NULL;

-- 3. 탈퇴 예정 사용자 조회를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
ON users(deletion_scheduled_at)
WHERE deletion_scheduled_at IS NOT NULL;

-- 4. 활성 사용자 조회를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_is_active
ON users(is_active);

-- ================================================
-- 자동 삭제 처리를 위한 PostgreSQL 함수
-- ================================================

-- 5. 30일이 지난 탈퇴 대기 계정을 완전히 삭제하는 함수
CREATE OR REPLACE FUNCTION delete_expired_accounts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 30일이 지난 탈퇴 대기 계정 찾기 및 삭제
  WITH deleted_users AS (
    DELETE FROM users
    WHERE deletion_scheduled_at IS NOT NULL
      AND deletion_scheduled_at <= NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted_users;

  -- 삭제된 계정 수 반환
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 함수 설명:
-- - 30일(720시간)이 지난 탈퇴 대기 계정을 영구 삭제
-- - CASCADE로 연관된 데이터도 함께 삭제 (외래키 설정에 따라)
-- - 삭제된 계정 수를 반환

-- ================================================
-- Supabase Edge Function을 위한 RPC 함수
-- ================================================

-- 6. 탈퇴 요청 처리 함수
CREATE OR REPLACE FUNCTION request_account_deletion(
  user_id UUID,
  reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- 이미 탈퇴 요청된 계정인지 확인
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id
      AND deletion_scheduled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '이미 탈퇴 요청된 계정입니다.';
  END IF;

  -- 탈퇴 요청 처리
  UPDATE users
  SET
    deletion_scheduled_at = NOW(),
    deletion_reason = reason,
    is_active = FALSE
  WHERE id = user_id;

  -- 결과 반환
  SELECT json_build_object(
    'success', TRUE,
    'message', '탈퇴 요청이 완료되었습니다. 30일 이내에 복구하실 수 있습니다.',
    'deletion_scheduled_at', NOW(),
    'deletion_deadline', NOW() + INTERVAL '30 days'
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 계정 복구 함수
CREATE OR REPLACE FUNCTION recover_account(
  user_id UUID
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  scheduled_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- 탈퇴 예정 계정 확인
  SELECT deletion_scheduled_at INTO scheduled_at
  FROM users
  WHERE id = user_id;

  IF scheduled_at IS NULL THEN
    RAISE EXCEPTION '탈퇴 요청되지 않은 계정입니다.';
  END IF;

  -- 30일이 지났는지 확인
  IF scheduled_at <= NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION '복구 가능 기간이 지났습니다.';
  END IF;

  -- 계정 복구
  UPDATE users
  SET
    deletion_scheduled_at = NULL,
    deletion_reason = NULL,
    is_active = TRUE
  WHERE id = user_id;

  -- 결과 반환
  SELECT json_build_object(
    'success', TRUE,
    'message', '계정이 성공적으로 복구되었습니다.'
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 사용자의 탈퇴 상태 확인 함수
CREATE OR REPLACE FUNCTION get_deletion_status(
  user_id UUID
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  scheduled_at TIMESTAMP WITH TIME ZONE;
  active BOOLEAN;
BEGIN
  -- 사용자 상태 조회
  SELECT deletion_scheduled_at, is_active
  INTO scheduled_at, active
  FROM users
  WHERE id = user_id;

  IF scheduled_at IS NULL THEN
    -- 정상 상태
    SELECT json_build_object(
      'is_deletion_scheduled', FALSE,
      'is_active', active,
      'message', '정상 활성화된 계정입니다.'
    ) INTO result;
  ELSE
    -- 탈퇴 대기 상태
    SELECT json_build_object(
      'is_deletion_scheduled', TRUE,
      'is_active', active,
      'deletion_scheduled_at', scheduled_at,
      'deletion_deadline', scheduled_at + INTERVAL '30 days',
      'days_remaining', EXTRACT(DAY FROM (scheduled_at + INTERVAL '30 days' - NOW())),
      'can_recover', scheduled_at + INTERVAL '30 days' > NOW(),
      'message', '탈퇴 대기 중인 계정입니다.'
    ) INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 정리 및 권한 설정
-- ================================================

-- 9. RPC 함수 실행 권한 부여 (authenticated 사용자)
GRANT EXECUTE ON FUNCTION delete_expired_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION request_account_deletion(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION recover_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_deletion_status(UUID) TO authenticated;

-- 10. 서비스 역할에도 실행 권한 부여 (백엔드 서버용)
GRANT EXECUTE ON FUNCTION delete_expired_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION request_account_deletion(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION recover_account(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_deletion_status(UUID) TO service_role;

-- ================================================
-- 주석 추가
-- ================================================

COMMENT ON COLUMN users.deletion_scheduled_at IS '탈퇴 요청 시각 (NULL = 정상, 값 = 탈퇴 대기)';
COMMENT ON COLUMN users.deletion_reason IS '탈퇴 사유 (선택사항)';
COMMENT ON COLUMN users.is_active IS '계정 활성화 상태 (FALSE = 로그인 불가)';

COMMENT ON FUNCTION delete_expired_accounts() IS '30일이 지난 탈퇴 대기 계정을 완전 삭제';
COMMENT ON FUNCTION request_account_deletion(UUID, TEXT) IS '회원 탈퇴 요청 처리 (30일 유예기간 시작)';
COMMENT ON FUNCTION recover_account(UUID) IS '탈퇴 대기 계정 복구 (30일 이내)';
COMMENT ON FUNCTION get_deletion_status(UUID) IS '사용자의 탈퇴 상태 조회';

-- ================================================
-- 마이그레이션 완료
-- ================================================

-- 적용 확인
SELECT
  'Migration completed successfully' AS status,
  NOW() AS applied_at;
