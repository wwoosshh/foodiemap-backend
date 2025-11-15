const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const authMiddleware = require('../middleware/auth');
const supabase = require('../config/supabase');

const router = express.Router();

// 다중 정렬 맛집 목록 조회 (한 번의 요청으로 모든 정렬 방식 반환)
router.get('/multi-sort', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category_id').optional().isUUID()
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

    const limit = parseInt(req.query.limit) || 10;
    const categoryId = req.query.category_id || null;

    // 기본 쿼리 설정
    const baseSelect = `
      id,
      name,
      description,
      address,
      rating,
      review_count,
      view_count,
      favorite_count,
      latitude,
      longitude,
      created_at,
      categories (
        id,
        name,
        icon,
        color
      ),
      restaurant_contacts (
        phone
      ),
      restaurant_media (
        id,
        display_order,
        is_representative,
        media_files (
          file_url,
          thumbnail_url
        )
      )
    `;

    // 병렬로 모든 정렬 방식의 데이터 가져오기
    const [byRating, byReviewCount, byViewCount, byFavoriteCount, byLatest] = await Promise.all([
      // 평점 높은 순
      (async () => {
        let query = supabase.from('restaurants').select(baseSelect);
        if (categoryId) query = query.eq('category_id', categoryId);
        return await query.order('rating', { ascending: false }).limit(limit);
      })(),

      // 리뷰 많은 순
      (async () => {
        let query = supabase.from('restaurants').select(baseSelect);
        if (categoryId) query = query.eq('category_id', categoryId);
        return await query.order('review_count', { ascending: false }).limit(limit);
      })(),

      // 조회수 많은 순
      (async () => {
        let query = supabase.from('restaurants').select(baseSelect);
        if (categoryId) query = query.eq('category_id', categoryId);
        return await query.order('view_count', { ascending: false }).limit(limit);
      })(),

      // 좋아요 많은 순
      (async () => {
        let query = supabase.from('restaurants').select(baseSelect);
        if (categoryId) query = query.eq('category_id', categoryId);
        return await query.order('favorite_count', { ascending: false }).limit(limit);
      })(),

      // 최신순
      (async () => {
        let query = supabase.from('restaurants').select(baseSelect);
        if (categoryId) query = query.eq('category_id', categoryId);
        return await query.order('created_at', { ascending: false }).limit(limit);
      })()
    ]);

    // 에러 체크
    if (byRating.error) {
      console.error('평점순 조회 실패:', byRating.error);
    }
    if (byReviewCount.error) {
      console.error('리뷰순 조회 실패:', byReviewCount.error);
    }
    if (byViewCount.error) {
      console.error('조회수순 조회 실패:', byViewCount.error);
    }
    if (byFavoriteCount.error) {
      console.error('좋아요순 조회 실패:', byFavoriteCount.error);
    }
    if (byLatest.error) {
      console.error('최신순 조회 실패:', byLatest.error);
    }

    // 레스토랑 데이터 변환 함수
    const transformRestaurants = (restaurants) => {
      return (restaurants || []).map(restaurant => {
        // 대표 이미지 추출
        const representativeMedia = restaurant.restaurant_media?.find(m => m.is_representative);
        const images = representativeMedia?.media_files?.file_url
          ? [representativeMedia.media_files.file_url]
          : [];

        return {
          ...restaurant,
          images
        };
      });
    };

    res.json({
      success: true,
      data: {
        byRating: transformRestaurants(byRating.data),
        byReviewCount: transformRestaurants(byReviewCount.data),
        byViewCount: transformRestaurants(byViewCount.data),
        byFavoriteCount: transformRestaurants(byFavoriteCount.data),
        byLatest: transformRestaurants(byLatest.data),
        filters: {
          limit,
          categoryId
        }
      }
    });

  } catch (error) {
    console.error('다중 정렬 맛집 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 맛집 목록 조회 (정렬 및 검색 기능 포함)
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category_id').optional().isUUID(),
  query('search').optional().trim(),
  query('sort').optional().isIn([
    'view_count_desc',
    'review_count_desc',
    'rating_desc',
    'created_at_desc',
    'favorite_count_desc'
  ])
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
    const categoryId = req.query.category_id || null;
    const search = req.query.search || null;
    const sort = req.query.sort || 'created_at_desc';
    const offset = (page - 1) * limit;

    // Supabase에서 직접 쿼리 (모델 메서드 대신 유연한 쿼리 구성)
    let query = supabase
      .from('restaurants')
      .select(`
        id,
        name,
        description,
        address,
        rating,
        review_count,
        view_count,
        favorite_count,
        latitude,
        longitude,
        created_at,
        categories (
          id,
          name,
          icon,
          color
        ),
        restaurant_contacts (
          phone
        ),
        restaurant_media (
          id,
          display_order,
          is_representative,
          media_files (
            file_url,
            thumbnail_url
          )
        )
      `, { count: 'exact' });

    // 카테고리 필터
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    // 검색 필터 (이름, 주소, 설명)
    if (search) {
      // SQL Injection 방지: 특수 문자 이스케이프
      const sanitizedSearch = search.replace(/[%_\\]/g, '\\$&');
      query = query.or(`name.ilike.%${sanitizedSearch}%,address.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`);
    }

    // 정렬
    let orderColumn = 'created_at';
    let orderAscending = false;

    switch (sort) {
      case 'view_count_desc':
        orderColumn = 'view_count';
        break;
      case 'review_count_desc':
        orderColumn = 'review_count';
        break;
      case 'rating_desc':
        orderColumn = 'rating';
        break;
      case 'favorite_count_desc':
        orderColumn = 'favorite_count';
        break;
      case 'created_at_desc':
      default:
        orderColumn = 'created_at';
        break;
    }

    query = query.order(orderColumn, { ascending: orderAscending });

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data: restaurants, error, count } = await query;

    if (error) {
      console.error('Supabase 쿼리 오류:', error);
      throw error;
    }

    const totalPages = count ? Math.ceil(count / limit) : 0;

    // 레스토랑 데이터 변환 (대표 이미지 추출)
    const transformedRestaurants = (restaurants || []).map(restaurant => {
      const representativeMedia = restaurant.restaurant_media?.find(m => m.is_representative);
      const images = representativeMedia?.media_files?.file_url
        ? [representativeMedia.media_files.file_url]
        : [];

      return {
        ...restaurant,
        images
      };
    });

    res.json({
      success: true,
      data: {
        restaurants: transformedRestaurants,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          categoryId,
          search,
          sort
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

// 즐겨찾기 메모 수정
router.patch('/favorites/:favoriteId/memo', authMiddleware, async (req, res) => {
  try {
    const { favoriteId } = req.params;
    const { memo } = req.body;
    const userId = req.user.id;

    // 소유권 확인 및 메모 업데이트
    const { data, error } = await supabase
      .from('user_favorites')
      .update({ memo, updated_at: new Date().toISOString() })
      .eq('id', favoriteId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '메모 수정 중 오류가 발생했습니다.'
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '즐겨찾기를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '메모가 수정되었습니다.',
      data
    });

  } catch (error) {
    console.error('메모 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 즐겨찾기 폴더 변경
router.patch('/favorites/:favoriteId/folder', authMiddleware, async (req, res) => {
  try {
    const { favoriteId } = req.params;
    const { folder_name } = req.body;
    const userId = req.user.id;

    // 소유권 확인 및 폴더 업데이트
    const { data, error } = await supabase
      .from('user_favorites')
      .update({ folder_name, updated_at: new Date().toISOString() })
      .eq('id', favoriteId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '폴더 변경 중 오류가 발생했습니다.'
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '즐겨찾기를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '폴더가 변경되었습니다.',
      data
    });

  } catch (error) {
    console.error('폴더 변경 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 폴더 목록 조회
router.get('/favorites/folders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('favorite_folders')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: '폴더 목록 조회 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      data: {
        folders: data || []
      }
    });

  } catch (error) {
    console.error('폴더 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 폴더 생성
router.post('/favorites/folders', [
  body('folder_name').notEmpty().trim()
], authMiddleware, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '폴더 이름이 필요합니다.',
        errors: errors.array()
      });
    }

    const { folder_name, description } = req.body;
    const userId = req.user.id;

    // 중복 폴더명 확인
    const { data: existingFolder } = await supabase
      .from('favorite_folders')
      .select('id')
      .eq('user_id', userId)
      .eq('folder_name', folder_name)
      .single();

    if (existingFolder) {
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 폴더 이름입니다.'
      });
    }

    // 폴더 생성
    const { data, error } = await supabase
      .from('favorite_folders')
      .insert([{
        user_id: userId,
        folder_name,
        description: description || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '폴더 생성 중 오류가 발생했습니다.'
      });
    }

    res.status(201).json({
      success: true,
      message: `"${folder_name}" 폴더가 생성되었습니다.`,
      data: {
        folder: data
      }
    });

  } catch (error) {
    console.error('폴더 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 폴더명 일괄 변경 (폴더 이름 수정)
router.patch('/favorites/folders/rename', authMiddleware, async (req, res) => {
  try {
    const { old_name, new_name } = req.body;
    const userId = req.user.id;

    if (!old_name || !new_name) {
      return res.status(400).json({
        success: false,
        message: '기존 폴더명과 새 폴더명이 필요합니다.'
      });
    }

    // 같은 이름인 경우
    if (old_name === new_name) {
      return res.status(400).json({
        success: false,
        message: '기존 폴더명과 새 폴더명이 같습니다.'
      });
    }

    // 새 폴더명 중복 확인
    const { data: existingFolder } = await supabase
      .from('favorite_folders')
      .select('id')
      .eq('user_id', userId)
      .eq('folder_name', new_name)
      .single();

    if (existingFolder) {
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 폴더 이름입니다.'
      });
    }

    // 1. favorite_folders 테이블에서 폴더명 업데이트
    const { error: folderError } = await supabase
      .from('favorite_folders')
      .update({ folder_name: new_name, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('folder_name', old_name);

    if (folderError) {
      return res.status(500).json({
        success: false,
        message: '폴더명 변경 중 오류가 발생했습니다.'
      });
    }

    // 2. 해당 폴더의 모든 즐겨찾기 업데이트
    const { data, error } = await supabase
      .from('user_favorites')
      .update({ folder_name: new_name, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('folder_name', old_name)
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '폴더명 변경 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      message: `폴더명이 "${old_name}"에서 "${new_name}"으로 변경되었습니다.`,
      data: {
        updated_count: data?.length || 0
      }
    });

  } catch (error) {
    console.error('폴더명 변경 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 폴더 삭제 (폴더 내 모든 즐겨찾기를 미분류로 이동)
router.delete('/favorites/folders/:folderName', authMiddleware, async (req, res) => {
  try {
    const { folderName } = req.params;
    const userId = req.user.id;

    // 1. 해당 폴더의 모든 즐겨찾기를 미분류(null)로 변경
    const { data, error } = await supabase
      .from('user_favorites')
      .update({ folder_name: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('folder_name', folderName)
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '폴더 삭제 중 오류가 발생했습니다.'
      });
    }

    // 2. favorite_folders 테이블에서 폴더 삭제
    const { error: folderError } = await supabase
      .from('favorite_folders')
      .delete()
      .eq('user_id', userId)
      .eq('folder_name', folderName);

    if (folderError) {
      console.error('폴더 테이블 삭제 오류:', folderError);
      // 즐겨찾기 이동은 성공했으므로 경고만 출력
    }

    res.json({
      success: true,
      message: `"${folderName}" 폴더가 삭제되었습니다. (${data?.length || 0}개의 즐겨찾기가 미분류로 이동)`,
      data: {
        moved_count: data?.length || 0
      }
    });

  } catch (error) {
    console.error('폴더 삭제 오류:', error);
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

    // 썸네일 이미지 변환 (대표 이미지만 추출)
    const transformedRestaurants = transformRestaurants(restaurants);

    res.json({
      success: true,
      data: {
        restaurants: transformedRestaurants,
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
  body('category_id').isUUID()
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