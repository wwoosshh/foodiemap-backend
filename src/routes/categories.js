const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: 카테고리 목록 조회 (다국어 지원)
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           enum: [ko, en, ja, zh]
 *           default: ko
 *         description: 언어 코드
 */
router.get('/', async (req, res) => {
  try {
    const lang = req.query.lang || 'ko';

    // 카테고리 기본 정보 조회
    const { data: categories, error } = await supabase
      .from('categories')
      .select(`
        id,
        name,
        icon,
        color,
        display_order
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    // 한국어가 아닌 경우 번역 조회
    if (lang !== 'ko' && categories && categories.length > 0) {
      const categoryIds = categories.map(c => c.id);

      const { data: translations, error: transError } = await supabase
        .from('category_translations')
        .select('category_id, name, description')
        .in('category_id', categoryIds)
        .eq('language_code', lang);

      if (!transError && translations) {
        // 번역 매핑
        const translationMap = {};
        translations.forEach(t => {
          translationMap[t.category_id] = t;
        });

        // 카테고리에 번역 적용
        categories.forEach(category => {
          const translation = translationMap[category.id];
          if (translation) {
            category.name = translation.name;
            category.description = translation.description;
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        categories,
        language: lang
      }
    });

  } catch (error) {
    console.error('카테고리 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: 카테고리 상세 조회 (다국어 지원)
 *     tags: [Categories]
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || 'ko';

    // 카테고리 기본 정보 조회
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !category) {
      return res.status(404).json({
        success: false,
        message: '카테고리를 찾을 수 없습니다.'
      });
    }

    // 한국어가 아닌 경우 번역 조회
    if (lang !== 'ko') {
      const { data: translation } = await supabase
        .from('category_translations')
        .select('name, description')
        .eq('category_id', id)
        .eq('language_code', lang)
        .single();

      if (translation) {
        category.name = translation.name;
        category.description = translation.description;
      }
    }

    res.json({
      success: true,
      data: { category, language: lang }
    });

  } catch (error) {
    console.error('카테고리 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;