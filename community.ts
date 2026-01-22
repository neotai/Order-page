import express from 'express';
import { CommunityServiceImpl, CommunityMenuSearchQuery } from '../services/CommunityService';
import { MenuServiceImpl } from '../services/MenuService';
import { UserManager } from '../managers/UserManager';
import { MenuCopyRequest } from '../types/menu';

export function createCommunityRouter(userManager: UserManager): express.Router {
  const router = express.Router();
  const menuService = new MenuServiceImpl(undefined, undefined, userManager);
  const communityService = new CommunityServiceImpl(menuService);

  // 瀏覽社群菜單
  router.get('/menus', async (req: express.Request, res: express.Response) => {
    try {
      const query: CommunityMenuSearchQuery = {
        keyword: req.query.keyword as string,
        category: req.query.category as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        sortBy: req.query.sortBy as 'popularity' | 'newest' | 'rating' | 'usage',
        priceRange: req.query.minPrice && req.query.maxPrice ? {
          min: parseFloat(req.query.minPrice as string),
          max: parseFloat(req.query.maxPrice as string)
        } : undefined
      };

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;

      const result = await communityService.browseCommunityMenus(query, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Browse community menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取熱門菜單
  router.get('/menus/popular', async (req: express.Request, res: express.Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const menus = await communityService.getPopularMenus(limit);
      
      res.json({
        success: true,
        menus
      });
    } catch (error) {
      console.error('Get popular menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取精選菜單
  router.get('/menus/featured', async (req: express.Request, res: express.Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 6;
      const menus = await communityService.getFeaturedMenus(limit);
      
      res.json({
        success: true,
        menus
      });
    } catch (error) {
      console.error('Get featured menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 按分類獲取菜單
  router.get('/menus/category/:category', async (req: express.Request, res: express.Response) => {
    try {
      const { category } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;

      const result = await communityService.getMenusByCategory(category, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get menus by category error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 瀏覽菜單模板
  router.get('/templates', async (req: express.Request, res: express.Response) => {
    try {
      const query: CommunityMenuSearchQuery = {
        keyword: req.query.keyword as string,
        category: req.query.category as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        sortBy: req.query.sortBy as 'popularity' | 'newest' | 'rating' | 'usage',
        templateOnly: true,
        verified: req.query.verified === 'true'
      };

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;

      const result = await communityService.browseMenuTemplates(query, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Browse menu templates error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取熱門模板
  router.get('/templates/popular', async (req: express.Request, res: express.Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const templates = await communityService.getPopularTemplates(limit);
      
      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error('Get popular templates error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取模板詳情
  router.get('/templates/:templateId', async (req: express.Request, res: express.Response) => {
    try {
      const { templateId } = req.params;
      const template = await communityService.getTemplateById(templateId);
      
      if (!template) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 從模板創建菜單
  router.post('/templates/:templateId/create-menu', async (req: express.Request, res: express.Response) => {
    try {
      const { templateId } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const user = await userManager.verifyToken(token);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token' 
        });
      }

      const customizations = req.body;
      const menu = await communityService.createMenuFromTemplate(user.id, templateId, customizations);
      
      if (!menu) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to create menu from template' 
        });
      }

      res.status(201).json({
        success: true,
        menu
      });
    } catch (error) {
      console.error('Create menu from template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 複製社群菜單（增強版）
  router.post('/menus/:menuId/copy', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const user = await userManager.verifyToken(token);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token' 
        });
      }

      const copyRequest: MenuCopyRequest = {
        sourceMenuId: menuId,
        newName: req.body.newName,
        copyItems: req.body.copyItems !== false, // 預設為 true
        copyCustomizations: req.body.copyCustomizations !== false, // 預設為 true
        makePublic: req.body.makePublic || false
      };

      const result = await menuService.copyMenu(user.id, copyRequest);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // 增加原菜單的使用次數
      communityService.incrementMenuUsage(menuId);

      res.status(201).json({
        success: true,
        menu: result.newMenu
      });
    } catch (error) {
      console.error('Copy community menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 評分菜單
  router.post('/menus/:menuId/rate', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const { rating } = req.body;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const user = await userManager.verifyToken(token);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token' 
        });
      }

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ 
          success: false, 
          error: 'Rating must be between 1 and 5' 
        });
      }

      const result = await communityService.rateMenu(user.id, menuId, rating);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Menu rated successfully'
      });
    } catch (error) {
      console.error('Rate menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取菜單評分
  router.get('/menus/:menuId/rating', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const rating = await communityService.getMenuRating(menuId);
      
      res.json({
        success: true,
        ...rating
      });
    } catch (error) {
      console.error('Get menu rating error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取相關菜單
  router.get('/menus/:menuId/related', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;
      
      const relatedMenus = await communityService.getRelatedMenus(menuId, limit);
      
      res.json({
        success: true,
        menus: relatedMenus
      });
    } catch (error) {
      console.error('Get related menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取搜尋建議
  router.get('/search/suggestions', async (req: express.Request, res: express.Response) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.json({
          success: true,
          suggestions: []
        });
      }

      const suggestions = await communityService.getSearchSuggestions(query);
      
      res.json({
        success: true,
        suggestions
      });
    } catch (error) {
      console.error('Get search suggestions error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取社群統計
  router.get('/stats', async (req: express.Request, res: express.Response) => {
    try {
      const stats = await communityService.getCommunityStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get community stats error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  return router;
}