const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ============================================
// 컬렉션 목록 조회
// ============================================
router.get('/', [
  authMiddleware.optionalAuth,
  query('sort').optional().isIn(['popular', 'recent', 'most_saved']),
  query('type').optional().isIn(['favorites', 'reviewed', 'wishlist', 'custom']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user?.id;
    const { sort = 'popular', type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('collections')
      .select(`
        *,
        users!user_id (
          id,
          name,
          avatar_url
        ),
        collection_items (
          id,
          restaurant_id,
          restaurants (
            id,
            name,
            restaurant_media (
              media_files (
                thumbnail_url
              )
            )
          )
        )
      `, { count: 'exact' })
      .eq('visibility', 'public')
      .eq('is_active', true)
      .gt('item_count', 0);

    if (type) {
      query = query.eq('type', type);
    }

    // 정렬
    switch (sort) {
      case 'recent':
        query = query.order('created_at', { ascending: false });
        break;
      case 'most_saved':
        query = query.order('save_count', { ascending: false });
        break;
      case 'popular':
      default:
        query = query.order('like_count', { ascending: false });
        break;
    }

    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // 사용자의 좋아요/저장 상태 확인
    let userLikes = [];
    let userSaves = [];
    if (userId && data.length > 0) {
      const collectionIds = data.map(c => c.id);

      const [likesResult, savesResult] = await Promise.all([
        supabase
          .from('collection_likes')
          .select('collection_id')
          .eq('user_id', userId)
          .in('collection_id', collectionIds),
        supabase
          .from('collection_saves')
          .select('collection_id')
          .eq('user_id', userId)
          .in('collection_id', collectionIds)
      ]);

      userLikes = (likesResult.data || []).map(l => l.collection_id);
      userSaves = (savesResult.data || []).map(s => s.collection_id);
    }

    // 데이터 변환
    const collections = data.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      cover_image_url: c.cover_image_url,
      type: c.type,
      item_count: c.item_count,
      like_count: c.like_count,
      save_count: c.save_count,
      view_count: c.view_count,
      is_featured: c.is_featured,
      created_at: c.created_at,
      user: {
        id: c.users?.id,
        name: c.users?.name,
        avatar_url: c.users?.avatar_url
      },
      preview_images: (c.collection_items || [])
        .slice(0, 4)
        .map(item => item.restaurants?.restaurant_media?.[0]?.media_files?.thumbnail_url)
        .filter(Boolean),
      is_liked: userLikes.includes(c.id),
      is_saved: userSaves.includes(c.id)
    }));

    res.json({
      success: true,
      data: {
        collections,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('컬렉션 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션 목록을 불러오는데 실패했습니다.'
    });
  }
});

// ============================================
// 추천 컬렉션 조회
// ============================================
router.get('/featured', [
  authMiddleware.optionalAuth
], async (req, res) => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('collections')
      .select(`
        *,
        users!user_id (
          id,
          name,
          avatar_url
        )
      `)
      .eq('visibility', 'public')
      .eq('is_active', true)
      .eq('is_featured', true)
      .gt('item_count', 0)
      .order('like_count', { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({
      success: true,
      data: data.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        cover_image_url: c.cover_image_url,
        type: c.type,
        item_count: c.item_count,
        like_count: c.like_count,
        user: {
          id: c.users?.id,
          name: c.users?.name,
          avatar_url: c.users?.avatar_url
        }
      }))
    });
  } catch (error) {
    console.error('추천 컬렉션 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '추천 컬렉션을 불러오는데 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션 상세 조회
// ============================================
router.get('/:id', [
  authMiddleware.optionalAuth,
  param('id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user?.id;

    // 컬렉션 조회
    const { data: collection, error } = await supabase
      .from('collections')
      .select(`
        *,
        users!user_id (
          id,
          name,
          avatar_url,
          follower_count,
          collection_count
        )
      `)
      .eq('id', id)
      .single();

    if (error || !collection) {
      return res.status(404).json({
        success: false,
        message: '컬렉션을 찾을 수 없습니다.'
      });
    }

    // 비공개 컬렉션 접근 권한 확인
    if (collection.visibility === 'private' && collection.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '접근 권한이 없습니다.'
      });
    }

    // 조회수 증가
    supabase
      .from('collections')
      .update({ view_count: collection.view_count + 1 })
      .eq('id', id)
      .then();

    // 컬렉션 아이템 조회
    const { data: items } = await supabase
      .from('collection_items')
      .select(`
        id,
        note,
        display_order,
        added_at,
        restaurants (
          id,
          name,
          address,
          rating,
          review_count,
          price_range,
          categories (
            id,
            name,
            icon
          ),
          restaurant_media (
            media_files (
              thumbnail_url,
              medium_url
            )
          )
        )
      `)
      .eq('collection_id', id)
      .order('display_order', { ascending: true });

    // 사용자 상태 확인
    let isLiked = false;
    let isSaved = false;
    let isFollowing = false;

    if (userId) {
      const [likeResult, saveResult, followResult] = await Promise.all([
        supabase
          .from('collection_likes')
          .select('user_id')
          .eq('user_id', userId)
          .eq('collection_id', id)
          .single(),
        supabase
          .from('collection_saves')
          .select('user_id')
          .eq('user_id', userId)
          .eq('collection_id', id)
          .single(),
        supabase
          .from('user_follows')
          .select('follower_id')
          .eq('follower_id', userId)
          .eq('following_id', collection.user_id)
          .single()
      ]);

      isLiked = !!likeResult.data;
      isSaved = !!saveResult.data;
      isFollowing = !!followResult.data;
    }

    res.json({
      success: true,
      data: {
        id: collection.id,
        title: collection.title,
        description: collection.description,
        cover_image_url: collection.cover_image_url,
        type: collection.type,
        visibility: collection.visibility,
        item_count: collection.item_count,
        like_count: collection.like_count,
        save_count: collection.save_count,
        view_count: collection.view_count + 1,
        is_featured: collection.is_featured,
        created_at: collection.created_at,
        updated_at: collection.updated_at,
        user: {
          id: collection.users?.id,
          name: collection.users?.name,
          avatar_url: collection.users?.avatar_url,
          follower_count: collection.users?.follower_count,
          collection_count: collection.users?.collection_count
        },
        items: (items || []).map(item => ({
          id: item.id,
          note: item.note,
          display_order: item.display_order,
          added_at: item.added_at,
          restaurant: {
            id: item.restaurants?.id,
            name: item.restaurants?.name,
            address: item.restaurants?.address,
            rating: item.restaurants?.rating,
            review_count: item.restaurants?.review_count,
            price_range: item.restaurants?.price_range,
            category: item.restaurants?.categories,
            thumbnail: item.restaurants?.restaurant_media?.[0]?.media_files?.thumbnail_url,
            image: item.restaurants?.restaurant_media?.[0]?.media_files?.medium_url
          }
        })),
        is_liked: isLiked,
        is_saved: isSaved,
        is_owner: userId === collection.user_id,
        is_following: isFollowing
      }
    });
  } catch (error) {
    console.error('컬렉션 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션을 불러오는데 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션 생성
// ============================================
router.post('/', [
  authMiddleware.requireAuth,
  body('title').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('type').optional().isIn(['favorites', 'reviewed', 'wishlist', 'custom']),
  body('visibility').optional().isIn(['public', 'private', 'followers_only']),
  body('cover_image_url').optional().isURL(),
  body('restaurant_ids').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      title,
      description,
      type = 'custom',
      visibility = 'public',
      cover_image_url,
      restaurant_ids = []
    } = req.body;

    // 컬렉션 생성
    const { data: collection, error } = await supabase
      .from('collections')
      .insert([{
        user_id: userId,
        title,
        description,
        type,
        visibility,
        cover_image_url
      }])
      .select()
      .single();

    if (error) throw error;

    // 맛집 추가
    if (restaurant_ids.length > 0) {
      const items = restaurant_ids.map((restaurantId, index) => ({
        collection_id: collection.id,
        restaurant_id: restaurantId,
        display_order: index
      }));

      await supabase
        .from('collection_items')
        .insert(items);
    }

    res.status(201).json({
      success: true,
      message: '컬렉션이 생성되었습니다.',
      data: { id: collection.id }
    });
  } catch (error) {
    console.error('컬렉션 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션 생성에 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션 수정
// ============================================
router.put('/:id', [
  authMiddleware.requireAuth,
  param('id').isUUID(),
  body('title').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('visibility').optional().isIn(['public', 'private', 'followers_only']),
  body('cover_image_url').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, visibility, cover_image_url } = req.body;

    // 소유권 확인
    const { data: existing } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '수정 권한이 없습니다.'
      });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (visibility) updateData.visibility = visibility;
    if (cover_image_url !== undefined) updateData.cover_image_url = cover_image_url;

    const { error } = await supabase
      .from('collections')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '컬렉션이 수정되었습니다.'
    });
  } catch (error) {
    console.error('컬렉션 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션 수정에 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션 삭제
// ============================================
router.delete('/:id', [
  authMiddleware.requireAuth,
  param('id').isUUID()
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 소유권 확인
    const { data: existing } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '삭제 권한이 없습니다.'
      });
    }

    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '컬렉션이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('컬렉션 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션 삭제에 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션에 맛집 추가
// ============================================
router.post('/:id/items', [
  authMiddleware.requireAuth,
  param('id').isUUID(),
  body('restaurant_id').isUUID(),
  body('note').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { restaurant_id, note } = req.body;

    // 소유권 확인
    const { data: collection } = await supabase
      .from('collections')
      .select('user_id, item_count')
      .eq('id', id)
      .single();

    if (!collection || collection.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '권한이 없습니다.'
      });
    }

    const { error } = await supabase
      .from('collection_items')
      .insert([{
        collection_id: id,
        restaurant_id,
        note,
        display_order: collection.item_count
      }]);

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: '이미 추가된 맛집입니다.'
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: '맛집이 추가되었습니다.'
    });
  } catch (error) {
    console.error('맛집 추가 오류:', error);
    res.status(500).json({
      success: false,
      message: '맛집 추가에 실패했습니다.'
    });
  }
});

// ============================================
// 컬렉션에서 맛집 제거
// ============================================
router.delete('/:id/items/:itemId', [
  authMiddleware.requireAuth,
  param('id').isUUID(),
  param('itemId').isUUID()
], async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const userId = req.user.id;

    // 소유권 확인
    const { data: collection } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!collection || collection.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '권한이 없습니다.'
      });
    }

    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('id', itemId)
      .eq('collection_id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '맛집이 제거되었습니다.'
    });
  } catch (error) {
    console.error('맛집 제거 오류:', error);
    res.status(500).json({
      success: false,
      message: '맛집 제거에 실패했습니다.'
    });
  }
});

// ============================================
// 좋아요 토글
// ============================================
router.post('/:id/like', [
  authMiddleware.requireAuth,
  param('id').isUUID()
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 기존 좋아요 확인
    const { data: existing } = await supabase
      .from('collection_likes')
      .select('user_id')
      .eq('user_id', userId)
      .eq('collection_id', id)
      .single();

    if (existing) {
      // 좋아요 취소
      await supabase
        .from('collection_likes')
        .delete()
        .eq('user_id', userId)
        .eq('collection_id', id);

      res.json({
        success: true,
        message: '좋아요가 취소되었습니다.',
        data: { is_liked: false }
      });
    } else {
      // 좋아요 추가
      await supabase
        .from('collection_likes')
        .insert([{ user_id: userId, collection_id: id }]);

      res.json({
        success: true,
        message: '좋아요를 눌렀습니다.',
        data: { is_liked: true }
      });
    }
  } catch (error) {
    console.error('좋아요 오류:', error);
    res.status(500).json({
      success: false,
      message: '처리에 실패했습니다.'
    });
  }
});

// ============================================
// 저장 토글
// ============================================
router.post('/:id/save', [
  authMiddleware.requireAuth,
  param('id').isUUID()
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 기존 저장 확인
    const { data: existing } = await supabase
      .from('collection_saves')
      .select('user_id')
      .eq('user_id', userId)
      .eq('collection_id', id)
      .single();

    if (existing) {
      // 저장 취소
      await supabase
        .from('collection_saves')
        .delete()
        .eq('user_id', userId)
        .eq('collection_id', id);

      res.json({
        success: true,
        message: '저장이 취소되었습니다.',
        data: { is_saved: false }
      });
    } else {
      // 저장 추가
      await supabase
        .from('collection_saves')
        .insert([{ user_id: userId, collection_id: id }]);

      res.json({
        success: true,
        message: '컬렉션을 저장했습니다.',
        data: { is_saved: true }
      });
    }
  } catch (error) {
    console.error('저장 오류:', error);
    res.status(500).json({
      success: false,
      message: '처리에 실패했습니다.'
    });
  }
});

// ============================================
// 내 컬렉션 목록
// ============================================
router.get('/my/list', [
  authMiddleware.requireAuth
], async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('내 컬렉션 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션을 불러오는데 실패했습니다.'
    });
  }
});

// ============================================
// 사용자 프로필의 공개 컬렉션
// ============================================
router.get('/user/:userId', [
  authMiddleware.optionalAuth,
  param('userId').isUUID()
], async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    let query = supabase
      .from('collections')
      .select(`
        *,
        users!user_id (
          id,
          name,
          avatar_url
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('item_count', 0)
      .order('created_at', { ascending: false });

    // 본인이 아니면 공개 컬렉션만
    if (currentUserId !== userId) {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('사용자 컬렉션 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '컬렉션을 불러오는데 실패했습니다.'
    });
  }
});

module.exports = router;
