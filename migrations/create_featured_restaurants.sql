-- 푸시 맛집(Featured Restaurants) 테이블 생성
-- 사이트에서 특별히 추천하는 맛집을 관리하는 테이블

CREATE TABLE IF NOT EXISTS featured_restaurants (
  id BIGSERIAL PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL, -- 푸시 제목 (예: "레전드 맛집", "이달의 맛집")
  subtitle VARCHAR(200), -- 부제목 (선택사항)
  description TEXT, -- 추천 이유/설명
  display_order INTEGER NOT NULL DEFAULT 1, -- 표시 순서 (1-3)
  badge_text VARCHAR(50), -- 배지 텍스트 (예: "BEST", "NEW", "HOT")
  badge_color VARCHAR(7) DEFAULT '#FF6B6B', -- 배지 색상 (hex)
  is_active BOOLEAN NOT NULL DEFAULT true, -- 활성화 여부
  start_date TIMESTAMPTZ, -- 푸시 시작일 (선택사항)
  end_date TIMESTAMPTZ, -- 푸시 종료일 (선택사항)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_featured_restaurants_active ON featured_restaurants(is_active);
CREATE INDEX IF NOT EXISTS idx_featured_restaurants_display_order ON featured_restaurants(display_order);
CREATE INDEX IF NOT EXISTS idx_featured_restaurants_restaurant_id ON featured_restaurants(restaurant_id);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_featured_restaurants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_featured_restaurants_updated_at
  BEFORE UPDATE ON featured_restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_featured_restaurants_updated_at();

-- 코멘트 추가
COMMENT ON TABLE featured_restaurants IS '사이트에서 특별히 푸시하는 추천 맛집 목록';
COMMENT ON COLUMN featured_restaurants.title IS '푸시 제목 (예: 레전드 맛집, 이달의 맛집)';
COMMENT ON COLUMN featured_restaurants.display_order IS '표시 순서 (1-3, 낮을수록 우선)';
COMMENT ON COLUMN featured_restaurants.badge_text IS '배지 텍스트 (예: BEST, NEW, HOT)';
