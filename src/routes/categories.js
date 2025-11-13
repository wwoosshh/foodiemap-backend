const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

// 카테고리 목록 조회
router.get('/', async (req, res) => {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        categories
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

module.exports = router;