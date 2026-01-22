import express from 'express';
import { MenuServiceImpl } from '../services/MenuService';
import { UserManager } from '../managers/UserManager';
import { LocalImageUploadService, ImageValidator } from '../services/ImageUploadService';
import { 
  MenuCreateRequest, 
  MenuUpdateRequest, 
  MenuSearchQuery,
  MenuItemCreateRequest,
  MenuItemUpdateRequest,
  MenuCopyRequest
} from '../types/menu';

export function createMenuRouter(userManager: UserManager): express.Router {
  const router = express.Router();
  const menuService = new MenuServiceImpl(undefined, undefined, userManager);
  const imageUploadService = new LocalImageUploadService();
  
  // 設定 multer 中介軟體用於檔案上傳
  const upload = imageUploadService.createMulterConfig();

  // 創建菜單
  router.post('/', async (req: express.Request, res: express.Response) => {
    try {
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

      const menuData: MenuCreateRequest = req.body;
      
      // 基本驗證
      if (!menuData.name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Menu name is required' 
        });
      }

      const menu = await menuService.createMenu(user.id, menuData);
      
      res.status(201).json({
        success: true,
        menu
      });
    } catch (error) {
      console.error('Create menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取菜單詳情
  router.get('/:menuId', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      let userId: string | undefined;
      if (token) {
        const user = await userManager.verifyToken(token);
        userId = user?.id;
      }

      // 檢查查看權限
      const canView = await menuService.canUserViewMenu(menuId, userId);
      if (!canView) {
        return res.status(403).json({ 
          success: false, 
          error: 'Permission denied' 
        });
      }

      const menu = await menuService.getMenuById(menuId);
      if (!menu) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu not found' 
        });
      }

      res.json({
        success: true,
        menu
      });
    } catch (error) {
      console.error('Get menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 更新菜單
  router.put('/:menuId', async (req: express.Request, res: express.Response) => {
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

      const updateData: MenuUpdateRequest = req.body;
      const menu = await menuService.updateMenu(menuId, user.id, updateData);
      
      if (!menu) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu not found or permission denied' 
        });
      }

      res.json({
        success: true,
        menu
      });
    } catch (error) {
      console.error('Update menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 刪除菜單
  router.delete('/:menuId', async (req: express.Request, res: express.Response) => {
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

      const success = await menuService.deleteMenu(menuId, user.id);
      
      if (!success) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu not found or permission denied' 
        });
      }

      res.json({
        success: true,
        message: 'Menu deleted successfully'
      });
    } catch (error) {
      console.error('Delete menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 搜尋菜單
  router.get('/', async (req: express.Request, res: express.Response) => {
    try {
      const query: MenuSearchQuery = {
        keyword: req.query.keyword as string,
        category: req.query.category as string,
        restaurantName: req.query.restaurantName as string,
        isPublic: req.query.isPublic === 'true',
        createdBy: req.query.createdBy as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        priceRange: req.query.minPrice && req.query.maxPrice ? {
          min: parseFloat(req.query.minPrice as string),
          max: parseFloat(req.query.maxPrice as string)
        } : undefined
      };

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await menuService.searchMenus(query, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Search menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取用戶的菜單
  router.get('/user/my-menus', async (req: express.Request, res: express.Response) => {
    try {
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

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await menuService.getUserMenus(user.id, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get user menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取公開菜單
  router.get('/public/all', async (req: express.Request, res: express.Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await menuService.getPublicMenus(page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get public menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 添加菜單項目
  router.post('/:menuId/items', async (req: express.Request, res: express.Response) => {
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

      const itemData: MenuItemCreateRequest = req.body;
      
      // 基本驗證
      if (!itemData.name || itemData.price === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Item name and price are required' 
        });
      }

      const item = await menuService.addMenuItem(menuId, user.id, itemData);
      
      if (!item) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu not found or permission denied' 
        });
      }

      res.status(201).json({
        success: true,
        item
      });
    } catch (error) {
      console.error('Add menu item error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 更新菜單項目
  router.put('/:menuId/items/:itemId', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId, itemId } = req.params;
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

      const updateData: MenuItemUpdateRequest = req.body;
      const item = await menuService.updateMenuItem(menuId, itemId, user.id, updateData);
      
      if (!item) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu or item not found, or permission denied' 
        });
      }

      res.json({
        success: true,
        item
      });
    } catch (error) {
      console.error('Update menu item error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 刪除菜單項目
  router.delete('/:menuId/items/:itemId', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId, itemId } = req.params;
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

      const success = await menuService.removeMenuItem(menuId, itemId, user.id);
      
      if (!success) {
        return res.status(404).json({ 
          success: false, 
          error: 'Menu or item not found, or permission denied' 
        });
      }

      res.json({
        success: true,
        message: 'Menu item deleted successfully'
      });
    } catch (error) {
      console.error('Delete menu item error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 複製菜單
  router.post('/copy', async (req: express.Request, res: express.Response) => {
    try {
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

      const copyRequest: MenuCopyRequest = req.body;
      
      // 基本驗證
      if (!copyRequest.sourceMenuId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Source menu ID is required' 
        });
      }

      const result = await menuService.copyMenu(user.id, copyRequest);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.status(201).json({
        success: true,
        menu: result.newMenu
      });
    } catch (error) {
      console.error('Copy menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // OCR 圖片處理 - 檔案上傳
  router.post('/ocr/upload', upload.single('image'), async (req: express.Request, res: express.Response) => {
    try {
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

      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: 'No image file provided' 
        });
      }

      // 驗證檔案
      const validation = ImageValidator.validateFile(req.file);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: validation.error 
        });
      }

      // 處理圖片 OCR
      const result = await menuService.processMenuImage(req.file.buffer);
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('OCR file upload processing error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // OCR 圖片處理 - URL
  router.post('/ocr/process', async (req: express.Request, res: express.Response) => {
    try {
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URL is required' 
        });
      }

      // 驗證 URL
      const validation = ImageValidator.validateImageUrl(imageUrl);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: validation.error 
        });
      }

      const result = await menuService.processMenuImageFromUrl(imageUrl);
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('OCR URL processing error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 從 OCR 結果創建菜單
  router.post('/ocr/create', async (req: express.Request, res: express.Response) => {
    try {
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

      const { ocrResult, menuName } = req.body;
      
      if (!ocrResult || !menuName) {
        return res.status(400).json({ 
          success: false, 
          error: 'OCR result and menu name are required' 
        });
      }

      // 驗證 OCR 結果格式
      if (!ocrResult.success || !ocrResult.detectedItems || !Array.isArray(ocrResult.detectedItems)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid OCR result format' 
        });
      }

      const menu = await menuService.createMenuFromOCR(user.id, ocrResult, menuName);
      
      if (!menu) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to create menu from OCR result' 
        });
      }

      res.status(201).json({
        success: true,
        menu
      });
    } catch (error) {
      console.error('Create menu from OCR error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 一步完成：上傳圖片並創建菜單
  router.post('/ocr/upload-and-create', upload.single('image'), async (req: express.Request, res: express.Response) => {
    try {
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

      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: 'No image file provided' 
        });
      }

      const { menuName } = req.body;
      if (!menuName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Menu name is required' 
        });
      }

      // 驗證檔案
      const validation = ImageValidator.validateFile(req.file);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: validation.error 
        });
      }

      // 處理 OCR
      const ocrResult = await menuService.processMenuImage(req.file.buffer);
      
      if (!ocrResult.success) {
        return res.status(400).json({
          success: false,
          error: ocrResult.error || 'OCR processing failed',
          ocrResult
        });
      }

      // 創建菜單
      const menu = await menuService.createMenuFromOCR(user.id, ocrResult, menuName);
      
      if (!menu) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to create menu from OCR result',
          ocrResult
        });
      }

      res.status(201).json({
        success: true,
        menu,
        ocrResult
      });
    } catch (error) {
      console.error('Upload and create menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 菜單儲存和分享功能 API (Task 5.5)
  
  // 儲存菜單到用戶收藏
  router.post('/:menuId/save', async (req: express.Request, res: express.Response) => {
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

      const result = await menuService.saveMenuForUser(user.id, menuId);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Menu saved successfully'
      });
    } catch (error) {
      console.error('Save menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 取消儲存菜單
  router.delete('/:menuId/save', async (req: express.Request, res: express.Response) => {
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

      const result = await menuService.unsaveMenuForUser(user.id, menuId);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Menu unsaved successfully'
      });
    } catch (error) {
      console.error('Unsave menu error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取用戶儲存的菜單
  router.get('/user/saved-menus', async (req: express.Request, res: express.Response) => {
    try {
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

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await menuService.getUserSavedMenus(user.id, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get saved menus error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 驗證菜單是否可以分享到社群
  router.get('/:menuId/share/validate', async (req: express.Request, res: express.Response) => {
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

      const validation = await menuService.validateMenuForSharing(menuId, user.id);
      
      res.json({
        success: true,
        canShare: validation.canShare,
        reason: validation.reason
      });
    } catch (error) {
      console.error('Validate menu sharing error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 分享菜單到社群
  router.post('/:menuId/share', async (req: express.Request, res: express.Response) => {
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

      const result = await menuService.shareMenuToCommunity(menuId, user.id);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        message: 'Menu shared to community successfully'
      });
    } catch (error) {
      console.error('Share menu to community error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 創建菜單模板
  router.post('/:menuId/template', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const { templateName, description } = req.body;
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

      if (!templateName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Template name is required' 
        });
      }

      const template = await menuService.createMenuTemplate(user.id, menuId, templateName, description || '');
      
      if (!template) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to create menu template. Menu not found or insufficient permissions.' 
        });
      }

      res.status(201).json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Create menu template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 創建菜單模板
  router.post('/:menuId/template', async (req: express.Request, res: express.Response) => {
    try {
      const { menuId } = req.params;
      const { templateName, description } = req.body;
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

      if (!templateName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Template name is required' 
        });
      }

      const template = await menuService.createMenuTemplate(user.id, menuId, templateName, description || '');
      
      if (!template) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to create menu template. Menu not found or insufficient permissions.' 
        });
      }

      res.status(201).json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Create menu template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取所有菜單模板
  router.get('/templates/all', async (req: express.Request, res: express.Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const templates = await menuService.getMenuTemplates(page, limit);
      
      res.json({
        success: true,
        templates,
        page,
        limit
      });
    } catch (error) {
      console.error('Get menu templates error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 搜尋菜單模板
  router.get('/templates/search', async (req: express.Request, res: express.Response) => {
    try {
      const query: MenuSearchQuery = {
        keyword: req.query.keyword as string,
        category: req.query.category as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        createdBy: req.query.createdBy as string
      };

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await menuService.searchMenuTemplates(query, page, limit);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Search menu templates error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 獲取特定模板
  router.get('/templates/:templateId', async (req: express.Request, res: express.Response) => {
    try {
      const { templateId } = req.params;
      const template = await menuService.getMenuTemplateById(templateId);
      
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
      console.error('Get menu template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 更新菜單模板
  router.put('/templates/:templateId', async (req: express.Request, res: express.Response) => {
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

      const updates = req.body;
      const template = await menuService.updateMenuTemplate(templateId, user.id, updates);
      
      if (!template) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found or permission denied' 
        });
      }

      res.json({
        success: true,
        template
      });
    } catch (error) {
      console.error('Update menu template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // 刪除菜單模板
  router.delete('/templates/:templateId', async (req: express.Request, res: express.Response) => {
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

      const success = await menuService.deleteMenuTemplate(templateId, user.id);
      
      if (!success) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found or permission denied' 
        });
      }

      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
    } catch (error) {
      console.error('Delete menu template error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  return router;
}