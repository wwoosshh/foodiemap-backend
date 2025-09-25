const express = require('express');
const { supabase } = require('../config/supabase');
const { adminAuth } = require('../middleware/adminAuth');

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

// 관리자용 모든 배너 목록 조회 (관리자 권한 필요)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('banners')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    // 검색 조건 추가
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // 페이지네이션 적용
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: banners, count, error } = await query;

    if (error) {
      throw error;
    }

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      message: '배너를 성공적으로 불러왔습니다.',
      data: {
        banners,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: totalPages
        }
      }
    });

  } catch (error) {
    console.error('관리자 배너 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 불러오는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 배너 상세 조회 (관리자 권한 필요)
router.get('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: banner, error } = await supabase
      .from('banners')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: '배너를 찾을 수 없습니다.'
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: '배너를 성공적으로 불러왔습니다.',
      data: banner
    });

  } catch (error) {
    console.error('배너 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 불러오는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 배너 생성 (관리자 권한 필요)
router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { title, description, image_url, link_url, is_active = true, sort_order = 0 } = req.body;

    // 필수 필드 검증
    if (!title || !image_url) {
      return res.status(400).json({
        success: false,
        message: '제목과 이미지 URL은 필수 입력 항목입니다.'
      });
    }

    const { data: banner, error } = await supabase
      .from('banners')
      .insert([
        {
          title,
          description,
          image_url,
          link_url,
          is_active,
          sort_order: parseInt(sort_order)
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      success: true,
      message: '배너가 성공적으로 생성되었습니다.',
      data: banner
    });

  } catch (error) {
    console.error('배너 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 생성하는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 배너 수정 (관리자 권한 필요)
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, image_url, link_url, is_active, sort_order } = req.body;

    // 배너 존재 여부 확인
    const { data: existingBanner, error: findError } = await supabase
      .from('banners')
      .select('id')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: '배너를 찾을 수 없습니다.'
        });
      }
      throw findError;
    }

    // 업데이트할 데이터 준비
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (link_url !== undefined) updateData.link_url = link_url;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (sort_order !== undefined) updateData.sort_order = parseInt(sort_order);

    const { data: banner, error } = await supabase
      .from('banners')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: '배너가 성공적으로 수정되었습니다.',
      data: banner
    });

  } catch (error) {
    console.error('배너 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 수정하는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 배너 삭제 (관리자 권한 필요)
router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 배너 존재 여부 확인
    const { data: existingBanner, error: findError } = await supabase
      .from('banners')
      .select('id')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: '배너를 찾을 수 없습니다.'
        });
      }
      throw findError;
    }

    const { error } = await supabase
      .from('banners')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      message: '배너가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('배너 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너를 삭제하는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 배너 순서 업데이트 (관리자 권한 필요)
router.patch('/admin/reorder', adminAuth, async (req, res) => {
  try {
    const { banners } = req.body;

    if (!Array.isArray(banners)) {
      return res.status(400).json({
        success: false,
        message: '잘못된 데이터 형식입니다.'
      });
    }

    // 트랜잭션으로 여러 배너의 순서를 업데이트
    const updatePromises = banners.map(({ id, sort_order }) =>
      supabase
        .from('banners')
        .update({ sort_order: parseInt(sort_order), updated_at: new Date().toISOString() })
        .eq('id', id)
    );

    const results = await Promise.all(updatePromises);

    // 오류 확인
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      throw new Error('일부 배너 순서 업데이트에 실패했습니다.');
    }

    res.status(200).json({
      success: true,
      message: '배너 순서가 성공적으로 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('배너 순서 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '배너 순서를 업데이트하는 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;