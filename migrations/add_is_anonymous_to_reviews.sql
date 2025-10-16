-- 리뷰 테이블에 is_anonymous 컬럼 추가
ALTER TABLE restaurant_reviews
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false NOT NULL;

-- 기존 리뷰는 모두 비익명으로 설정
UPDATE restaurant_reviews
SET is_anonymous = false
WHERE is_anonymous IS NULL;

-- 컬럼 설명 추가
COMMENT ON COLUMN restaurant_reviews.is_anonymous IS '익명 리뷰 여부';
