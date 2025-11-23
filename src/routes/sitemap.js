const express = require('express');
const supabase = require('../config/supabase');
const { logger } = require('../config/logger');

const router = express.Router();

/**
 * 동적 Sitemap 생성 API
 * 모든 맛집의 URL을 포함한 Sitemap.xml을 실시간으로 생성
 */
router.get('/sitemap.xml', async (req, res) => {
  try {
    // 모든 활성 맛집 조회 (ID, 업데이트 날짜)
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('id, updated_at, rating, review_count')
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (error) {
      logger.error('Sitemap generation failed', { error: error.message });
      return res.status(500).send('Failed to generate sitemap');
    }

    // Sitemap XML 생성
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

    // 각 맛집 페이지 추가
    restaurants.forEach(restaurant => {
      const lastmod = new Date(restaurant.updated_at).toISOString().split('T')[0];

      // 평점과 리뷰 수에 따라 우선순위 계산 (0.5 ~ 0.9)
      const ratingScore = (restaurant.rating || 0) / 5;
      const reviewScore = Math.min((restaurant.review_count || 0) / 100, 1);
      const priority = (0.5 + (ratingScore * 0.2) + (reviewScore * 0.2)).toFixed(1);

      sitemap += `
  <url>
    <loc>https://mzcube.com/restaurant/${restaurant.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

    sitemap += '\n</urlset>';

    // XML 헤더 설정 및 응답
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
    res.send(sitemap);

    logger.info('Sitemap generated successfully', {
      restaurantCount: restaurants.length
    });

  } catch (error) {
    logger.error('Sitemap generation error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).send('Internal server error');
  }
});

/**
 * Sitemap Index 생성 (여러 Sitemap을 묶는 인덱스)
 * 맛집이 많아질 경우 대비
 */
router.get('/sitemap-index.xml', async (req, res) => {
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://mzcube.com/sitemap.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://foodiemap-backend.onrender.com/api/sitemap.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
</sitemapindex>`;

  res.header('Content-Type', 'application/xml; charset=utf-8');
  res.send(sitemapIndex);
});

module.exports = router;
