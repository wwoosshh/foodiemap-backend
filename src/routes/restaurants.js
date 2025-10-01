const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const authMiddleware = require('../middleware/auth');
const supabase = require('../config/supabase');

const router = express.Router();

// 맛집 목록 조회
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '쿼리 파라미터가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const categoryId = req.query.category_id;
    const offset = (page - 1) * limit;

    let restaurants;
    if (categoryId) {
      restaurants = await Restaurant.findByCategory(categoryId, limit);
    } else {
      restaurants = await Restaurant.findAll(limit, offset);
    }

    res.json({
      success: true,
      data: {
        restaurants,
        pagination: {
          page,
          limit,
          hasNext: restaurants.length === limit
        }
      }
    });

  } catch (error) {
    console.error('맛집 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 맛집 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: '맛집을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: {
        restaurant
      }
    });

  } catch (error) {
    console.error('맛집 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 맛집 상세 정보 조회 (조회수 증가 포함)
router.get('/:id/details', async (req, res) => {
  try {
    const { id } = req.params;

    // 상세 정보 조회
    const restaurant = await Restaurant.findByIdWithDetails(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: '맛집을 찾을 수 없습니다.'
      });
    }

    // 조회수 증가
    try {
      await Restaurant.incrementViewCount(id);
    } catch (viewError) {
      console.warn('조회수 증가 실패:', viewError);
      // 조회수 증가 실패해도 상세 정보는 반환
    }

    res.json({
      success: true,
      data: {
        restaurant
      }
    });

  } catch (error) {
    console.error('맛집 상세 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 즐겨찾기 추가
router.post('/:id/favorite', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const favorite = await Restaurant.addToFavorites(userId, id);

    res.json({
      success: true,
      message: '즐겨찾기에 추가되었습니다.',
      data: favorite
    });

  } catch (error) {
    console.error('즐겨찾기 추가 오류:', error);

    // 중복 오류 처리
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: '이미 즐겨찾기에 추가된 맛집입니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 즐겨찾기 제거
router.delete('/:id/favorite', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await Restaurant.removeFromFavorites(userId, id);

    res.json({
      success: true,
      message: '즐겨찾기에서 제거되었습니다.'
    });

  } catch (error) {
    console.error('즐겨찾기 제거 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 즐겨찾기 목록 조회
router.get('/favorites/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const favorites = await Restaurant.getUserFavorites(userId);

    res.json({
      success: true,
      data: {
        favorites
      }
    });

  } catch (error) {
    console.error('즐겨찾기 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 즐겨찾기 상태 확인
router.get('/:id/favorite/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('user_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('restaurant_id', id)
      .single();

    res.json({
      success: true,
      data: {
        is_favorited: !!data
      }
    });

  } catch (error) {
    console.error('즐겨찾기 상태 확인 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 주변 맛집 검색
router.get('/nearby/search', [
  query('lat').isFloat({ min: -90, max: 90 }),
  query('lng').isFloat({ min: -180, max: 180 }),
  query('radius').optional().isFloat({ min: 0.1, max: 50 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '위치 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { lat, lng } = req.query;
    const radius = parseFloat(req.query.radius) || 5;
    const limit = parseInt(req.query.limit) || 50;

    const restaurants = await Restaurant.findNearby(
      parseFloat(lat),
      parseFloat(lng),
      radius,
      limit
    );

    res.json({
      success: true,
      data: {
        restaurants,
        search: {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          radius,
          limit
        }
      }
    });

  } catch (error) {
    console.error('주변 맛집 검색 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 맛집 등록 (임시로 인증 제거)
router.post('/', [
  body('name').notEmpty().trim(),
  body('address').notEmpty().trim(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('category_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '입력 정보가 올바르지 않습니다.',
        errors: errors.array()
      });
    }

    const { name, description, address, phone, category_id, latitude, longitude, images } = req.body;

    const restaurant = await Restaurant.create({
      name,
      description,
      address,
      phone,
      category_id,
      latitude,
      longitude,
      images: images || []
    });

    res.status(201).json({
      success: true,
      message: '맛집이 등록되었습니다.',
      data: {
        restaurant
      }
    });

  } catch (error) {
    console.error('맛집 등록 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;