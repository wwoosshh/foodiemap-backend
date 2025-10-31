const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

// 공개 배너 목록 조회 (로그인 불필요)
router.get('/', async (req, res) => {
  try {
    const { data: banners, error } = await supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: '배너를 성공적으로 불러왔습니다.',
      data: { banners }
    });

  } catch (error) {
    console.error('배너 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 불러오는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
