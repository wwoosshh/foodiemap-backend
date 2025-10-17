-- 블로그 형태의 이벤트 본문 저장 테이블
-- Supabase SQL Editor에서 실행하세요

-- event_posts 테이블 생성
CREATE TABLE IF NOT EXISTS public.event_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid UNIQUE, -- events 테이블과 1:1 관계
  title character varying NOT NULL,
  content text NOT NULL, -- 마크다운 또는 HTML 본문
  content_type character varying DEFAULT 'html'::character varying CHECK (content_type::text = ANY (ARRAY['html'::character varying::text, 'markdown'::character varying::text])),
  excerpt text, -- 요약문 (선택)
  thumbnail_url text, -- 썸네일 이미지
  author_id uuid, -- 작성자 (admins 테이블 참조)
  status character varying DEFAULT 'published'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying::text, 'published'::character varying::text, 'archived'::character varying::text])),
  slug character varying UNIQUE, -- SEO 친화적 URL
  seo_title character varying, -- SEO 제목
  seo_description text, -- SEO 설명
  seo_keywords text[], -- SEO 키워드 배열
  tags text[], -- 태그 배열
  view_count integer DEFAULT 0 CHECK (view_count >= 0),
  like_count integer DEFAULT 0 CHECK (like_count >= 0),
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT event_posts_pkey PRIMARY KEY (id),
  CONSTRAINT event_posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.admins(id) ON DELETE SET NULL
);

-- notice_posts 테이블 생성
CREATE TABLE IF NOT EXISTS public.notice_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notice_id uuid UNIQUE, -- notices 테이블과 1:1 관계
  title character varying NOT NULL,
  content text NOT NULL, -- 마크다운 또는 HTML 본문
  content_type character varying DEFAULT 'html'::character varying CHECK (content_type::text = ANY (ARRAY['html'::character varying::text, 'markdown'::character varying::text])),
  excerpt text, -- 요약문 (선택)
  thumbnail_url text, -- 썸네일 이미지
  author_id uuid, -- 작성자 (admins 테이블 참조)
  status character varying DEFAULT 'published'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying::text, 'published'::character varying::text, 'archived'::character varying::text])),
  slug character varying UNIQUE, -- SEO 친화적 URL
  seo_title character varying, -- SEO 제목
  seo_description text, -- SEO 설명
  seo_keywords text[], -- SEO 키워드 배열
  tags text[], -- 태그 배열
  view_count integer DEFAULT 0 CHECK (view_count >= 0),
  like_count integer DEFAULT 0 CHECK (like_count >= 0),
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notice_posts_pkey PRIMARY KEY (id),
  CONSTRAINT notice_posts_notice_id_fkey FOREIGN KEY (notice_id) REFERENCES public.notices(id) ON DELETE CASCADE,
  CONSTRAINT notice_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.admins(id) ON DELETE SET NULL
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_event_posts_event_id ON public.event_posts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_posts_status ON public.event_posts(status);
CREATE INDEX IF NOT EXISTS idx_event_posts_published_at ON public.event_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_event_posts_slug ON public.event_posts(slug);

CREATE INDEX IF NOT EXISTS idx_notice_posts_notice_id ON public.notice_posts(notice_id);
CREATE INDEX IF NOT EXISTS idx_notice_posts_status ON public.notice_posts(status);
CREATE INDEX IF NOT EXISTS idx_notice_posts_published_at ON public.notice_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_notice_posts_slug ON public.notice_posts(slug);

-- updated_at 자동 업데이트 트리거 함수 (이미 없는 경우만 생성)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS update_event_posts_updated_at ON public.event_posts;
CREATE TRIGGER update_event_posts_updated_at
    BEFORE UPDATE ON public.event_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notice_posts_updated_at ON public.notice_posts;
CREATE TRIGGER update_notice_posts_updated_at
    BEFORE UPDATE ON public.notice_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 코멘트 추가
COMMENT ON TABLE public.event_posts IS '이벤트 상세 본문 저장 테이블 (블로그 형태)';
COMMENT ON TABLE public.notice_posts IS '공지사항 상세 본문 저장 테이블 (블로그 형태)';

COMMENT ON COLUMN public.event_posts.content IS 'HTML 또는 마크다운 형식의 본문';
COMMENT ON COLUMN public.event_posts.content_type IS '본문 형식: html 또는 markdown';
COMMENT ON COLUMN public.event_posts.slug IS 'SEO 친화적 URL (예: my-event-title)';
COMMENT ON COLUMN public.event_posts.status IS '게시 상태: draft(임시저장), published(게시됨), archived(보관)';

COMMENT ON COLUMN public.notice_posts.content IS 'HTML 또는 마크다운 형식의 본문';
COMMENT ON COLUMN public.notice_posts.content_type IS '본문 형식: html 또는 markdown';
COMMENT ON COLUMN public.notice_posts.slug IS 'SEO 친화적 URL (예: important-notice)';
COMMENT ON COLUMN public.notice_posts.status IS '게시 상태: draft(임시저장), published(게시됨), archived(보관)';
