-- events 테이블에 view_count 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0 CHECK (view_count >= 0);

COMMENT ON COLUMN public.events.view_count IS '이벤트 조회수';
