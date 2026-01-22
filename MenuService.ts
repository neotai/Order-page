import { 
  Menu, 
  MenuItem, 
  MenuCreateRequest, 
  MenuUpdateRequest, 
  MenuSearchQuery, 
  MenuSearchResult,
  MenuItemCreateRequest,
  MenuItemUpdateRequest,
  MenuCopyRequest,
  MenuCopyResult,
  OCRProcessingResult,
  MenuTemplate
} from '../types/menu';
import { OCRService, GoogleVisionOCRService, MockOCRService } from './OCRService';
import { ImageUploadService, LocalImageUploadService } from './ImageUploadService';
import { UserManager } from '../managers/UserManager';

export interface MenuService {
  // 菜單 CRUD 操作
  createMenu(userId: string, request: MenuCreateRequest): Promise<Menu>;
  getMenuById(menuId: string): Promise<Menu | null>;
  updateMenu(menuId: string, userId: string, request: MenuUpdateRequest): Promise<Menu | null>;
  deleteMenu(menuId: string, userId: string): Promise<boolean>;
  
  // 菜單搜尋和列表
  searchMenus(query: MenuSearchQuery, page?: number, limit?: number): Promise<MenuSearchResult>;
  getUserMenus(userId: string, page?: number, limit?: number): Promise<MenuSearchResult>;
  getPublicMenus(page?: number, limit?: number): Promise<MenuSearchResult>;
  
  // 菜單項目管理
  addMenuItem(menuId: string, userId: string, item: MenuItemCreateRequest): Promise<MenuItem | null>;
  updateMenuItem(menuId: string, itemId: string, userId: string, request: MenuItemUpdateRequest): Promise<MenuItem | null>;
  removeMenuItem(menuId: string, itemId: string, userId: string): Promise<boolean>;
  
  // 菜單複製功能
  copyMenu(userId: string, request: MenuCopyRequest): Promise<MenuCopyResult>;
  
  // 圖片處理和 OCR
  processMenuImage(imageFile: Buffer): Promise<OCRProcessingResult>;
  processMenuImageFromUrl(imageUrl: string): Promise<OCRProcessingResult>;
  createMenuFromOCR(userId: string, ocrResult: OCRProcessingResult, menuName: string): Promise<Menu | null>;
  
  // 菜單儲存和分享功能 (Task 5.5)
  saveMenuForUser(userId: string, menuId: string): Promise<{ success: boolean; error?: string }>;
  unsaveMenuForUser(userId: string, menuId: string): Promise<{ success: boolean; error?: string }>;
  getUserSavedMenus(userId: string, page?: number, limit?: number): Promise<MenuSearchResult>;
  validateMenuForSharing(menuId: string, userId: string): Promise<{ canShare: boolean; reason?: string }>;
  shareMenuToCommunity(menuId: string, userId: string): Promise<{ success: boolean; error?: string }>;
  createMenuTemplate(userId: string, menuId: string, templateName: string, description: string): Promise<MenuTemplate | null>;
  
  // 菜單模板管理
  getMenuTemplates(page?: number, limit?: number): Promise<MenuTemplate[]>;
  searchMenuTemplates(query: MenuSearchQuery, page?: number, limit?: number): Promise<{ templates: MenuTemplate[]; total: number; page: number; limit: number }>;
  getMenuTemplateById(templateId: string): Promise<MenuTemplate | null>;
  updateMenuTemplate(templateId: string, userId: string, updates: Partial<MenuTemplate>): Promise<MenuTemplate | null>;
  deleteMenuTemplate(templateId: string, userId: string): Promise<boolean>;
  
  // 權限檢查
  canUserModifyMenu(menuId: string, userId: string): Promise<boolean>;
  canUserViewMenu(menuId: string, userId?: string): Promise<boolean>;
}

export class MenuServiceImpl implements MenuService {
  private menus: Map<string, Menu> = new Map();
  private menuItems: Map<string, MenuItem[]> = new Map();
  private menuTemplates: Map<string, MenuTemplate> = new Map();
  private userSavedMenus: Map<string, Set<string>> = new Map(); // userId -> Set of menuIds
  private ocrService: OCRService;
  private imageUploadService: ImageUploadService;
  private userManager?: UserManager; // Optional dependency for user integration

  constructor(
    ocrService?: OCRService,
    imageUploadService?: ImageUploadService,
    userManager?: UserManager
  ) {
    // 根據環境變數決定使用真實的 OCR 服務還是模擬服務
    const isProduction = typeof process !== 'undefined' && 
      (process.env?.NODE_ENV === 'production' || process.env?.GOOGLE_APPLICATION_CREDENTIALS);
    
    this.ocrService = ocrService || (
      isProduction
        ? new GoogleVisionOCRService()
        : new MockOCRService()
    );
    
    this.imageUploadService = imageUploadService || new LocalImageUploadService();
    this.userManager = userManager;
  }

  async createMenu(userId: string, request: MenuCreateRequest): Promise<Menu> {
    const menuId = this.generateId();
    const now = new Date();
    
    const menu: Menu = {
      id: menuId,
      name: request.name,
      description: request.description,
      restaurantName: request.restaurantName,
      restaurantPhone: request.restaurantPhone,
      restaurantAddress: request.restaurantAddress,
      items: request.items || [],
      categories: request.categories || [],
      isPublic: request.isPublic || false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      tags: request.tags || [],
      imageUrl: request.imageUrl,
      ocrProcessed: false
    };

    this.menus.set(menuId, menu);
    if (menu.items.length > 0) {
      this.menuItems.set(menuId, [...menu.items]);
    }

    // 自動儲存菜單給創建者 (Task 5.5 - 登入用戶菜單自動儲存)
    await this.saveMenuForUser(userId, menuId);

    return menu;
  }

  async getMenuById(menuId: string): Promise<Menu | null> {
    const menu = this.menus.get(menuId);
    if (!menu) return null;

    // 確保菜單項目是最新的
    const items = this.menuItems.get(menuId) || [];
    return {
      ...menu,
      items
    };
  }

  async updateMenu(menuId: string, userId: string, request: MenuUpdateRequest): Promise<Menu | null> {
    const menu = this.menus.get(menuId);
    if (!menu || menu.createdBy !== userId) {
      return null;
    }

    const updatedMenu: Menu = {
      ...menu,
      ...request,
      id: menuId, // 確保 ID 不被覆蓋
      createdBy: menu.createdBy, // 確保創建者不被覆蓋
      createdAt: menu.createdAt, // 確保創建時間不被覆蓋
      updatedAt: new Date()
    };

    this.menus.set(menuId, updatedMenu);
    
    // 如果更新了項目，也要更新項目列表
    if (request.items) {
      this.menuItems.set(menuId, [...request.items]);
    }

    return this.getMenuById(menuId);
  }

  async deleteMenu(menuId: string, userId: string): Promise<boolean> {
    const menu = this.menus.get(menuId);
    if (!menu || menu.createdBy !== userId) {
      return false;
    }

    this.menus.delete(menuId);
    this.menuItems.delete(menuId);
    return true;
  }

  async searchMenus(query: MenuSearchQuery, page: number = 1, limit: number = 10): Promise<MenuSearchResult> {
    const allMenus = Array.from(this.menus.values());
    
    let filteredMenus = allMenus.filter(menu => {
      // 關鍵字搜尋
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const matchesName = menu.name.toLowerCase().includes(keyword);
        const matchesDescription = menu.description?.toLowerCase().includes(keyword);
        const matchesRestaurant = menu.restaurantName?.toLowerCase().includes(keyword);
        const matchesTags = menu.tags.some(tag => tag.toLowerCase().includes(keyword));
        
        if (!matchesName && !matchesDescription && !matchesRestaurant && !matchesTags) {
          return false;
        }
      }

      // 分類篩選
      if (query.category && !menu.categories.includes(query.category)) {
        return false;
      }

      // 標籤篩選
      if (query.tags && query.tags.length > 0) {
        const hasMatchingTag = query.tags.some(tag => menu.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // 餐廳名稱篩選
      if (query.restaurantName && menu.restaurantName !== query.restaurantName) {
        return false;
      }

      // 公開狀態篩選
      if (query.isPublic !== undefined && menu.isPublic !== query.isPublic) {
        return false;
      }

      // 創建者篩選
      if (query.createdBy && menu.createdBy !== query.createdBy) {
        return false;
      }

      // 價格範圍篩選
      if (query.priceRange) {
        const menuItems = this.menuItems.get(menu.id) || [];
        const prices = menuItems.map(item => item.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (prices.length > 0) {
          if (minPrice < query.priceRange.min || maxPrice > query.priceRange.max) {
            return false;
          }
        }
      }

      return true;
    });

    // 排序：最新的在前面
    filteredMenus.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMenus = filteredMenus.slice(startIndex, endIndex);

    // 確保每個菜單都有最新的項目
    const menusWithItems = await Promise.all(
      paginatedMenus.map(async menu => {
        const items = this.menuItems.get(menu.id) || [];
        return { ...menu, items };
      })
    );

    return {
      menus: menusWithItems,
      total: filteredMenus.length,
      page,
      limit
    };
  }

  async getUserMenus(userId: string, page: number = 1, limit: number = 10): Promise<MenuSearchResult> {
    return this.searchMenus({ createdBy: userId }, page, limit);
  }

  async getPublicMenus(page: number = 1, limit: number = 10): Promise<MenuSearchResult> {
    return this.searchMenus({ isPublic: true }, page, limit);
  }

  async addMenuItem(menuId: string, userId: string, item: MenuItemCreateRequest): Promise<MenuItem | null> {
    const menu = this.menus.get(menuId);
    if (!menu || menu.createdBy !== userId) {
      return null;
    }

    const menuItem: MenuItem = {
      id: this.generateId(),
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      imageUrl: item.imageUrl,
      isAvailable: true,
      customizations: item.customizations || []
    };

    const currentItems = this.menuItems.get(menuId) || [];
    const updatedItems = [...currentItems, menuItem];
    this.menuItems.set(menuId, updatedItems);

    // 更新菜單的 updatedAt
    const updatedMenu = { ...menu, updatedAt: new Date() };
    this.menus.set(menuId, updatedMenu);

    return menuItem;
  }

  async updateMenuItem(menuId: string, itemId: string, userId: string, request: MenuItemUpdateRequest): Promise<MenuItem | null> {
    const menu = this.menus.get(menuId);
    if (!menu || menu.createdBy !== userId) {
      return null;
    }

    const currentItems = this.menuItems.get(menuId) || [];
    const itemIndex = currentItems.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return null;
    }

    const updatedItem: MenuItem = {
      ...currentItems[itemIndex],
      ...request,
      id: itemId // 確保 ID 不被覆蓋
    };

    const updatedItems = [...currentItems];
    updatedItems[itemIndex] = updatedItem;
    this.menuItems.set(menuId, updatedItems);

    // 更新菜單的 updatedAt
    const updatedMenu = { ...menu, updatedAt: new Date() };
    this.menus.set(menuId, updatedMenu);

    return updatedItem;
  }

  async removeMenuItem(menuId: string, itemId: string, userId: string): Promise<boolean> {
    const menu = this.menus.get(menuId);
    if (!menu || menu.createdBy !== userId) {
      return false;
    }

    const currentItems = this.menuItems.get(menuId) || [];
    const filteredItems = currentItems.filter(item => item.id !== itemId);
    
    if (filteredItems.length === currentItems.length) {
      return false; // 項目不存在
    }

    this.menuItems.set(menuId, filteredItems);

    // 更新菜單的 updatedAt
    const updatedMenu = { ...menu, updatedAt: new Date() };
    this.menus.set(menuId, updatedMenu);

    return true;
  }

  async copyMenu(userId: string, request: MenuCopyRequest): Promise<MenuCopyResult> {
    const sourceMenu = await this.getMenuById(request.sourceMenuId);
    if (!sourceMenu) {
      return {
        success: false,
        error: 'Source menu not found'
      };
    }

    // 檢查是否可以複製（公開菜單或自己的菜單）
    if (!sourceMenu.isPublic && sourceMenu.createdBy !== userId) {
      return {
        success: false,
        error: 'Permission denied: Cannot copy private menu'
      };
    }

    try {
      const newMenuRequest: MenuCreateRequest = {
        name: request.newName || `${sourceMenu.name} (複製)`,
        description: sourceMenu.description,
        restaurantName: sourceMenu.restaurantName,
        restaurantPhone: sourceMenu.restaurantPhone,
        restaurantAddress: sourceMenu.restaurantAddress,
        categories: [...sourceMenu.categories],
        isPublic: request.makePublic || false,
        tags: [...sourceMenu.tags],
        imageUrl: sourceMenu.imageUrl
      };

      if (request.copyItems) {
        newMenuRequest.items = sourceMenu.items.map(item => ({
          ...item,
          id: this.generateId(), // 生成新的 ID
          customizations: request.copyCustomizations ? item.customizations : []
        }));
      }

      const newMenu = await this.createMenu(userId, newMenuRequest);

      return {
        success: true,
        newMenu
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async processMenuImage(imageBuffer: Buffer): Promise<OCRProcessingResult> {
    try {
      // 使用 OCR 服務處理圖片
      const result = await this.ocrService.processImage(imageBuffer);
      
      // 記錄處理結果用於除錯
      console.log('OCR processing completed:', {
        success: result.success,
        itemCount: result.detectedItems?.length || 0,
        confidence: result.confidence
      });

      return result;
    } catch (error) {
      console.error('Error processing menu image:', error);
      return {
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred during OCR processing'
      };
    }
  }

  async processMenuImageFromUrl(imageUrl: string): Promise<OCRProcessingResult> {
    try {
      // 使用 OCR 服務處理來自 URL 的圖片
      const result = await this.ocrService.processImageFromUrl(imageUrl);
      
      console.log('OCR processing from URL completed:', {
        success: result.success,
        itemCount: result.detectedItems?.length || 0,
        confidence: result.confidence
      });

      return result;
    } catch (error) {
      console.error('Error processing menu image from URL:', error);
      return {
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred during OCR processing'
      };
    }
  }

  async createMenuFromOCR(userId: string, ocrResult: OCRProcessingResult, menuName: string): Promise<Menu | null> {
    if (!ocrResult.success || !ocrResult.detectedItems || ocrResult.detectedItems.length === 0) {
      return null;
    }

    try {
      const items: MenuItem[] = ocrResult.detectedItems.map(detectedItem => ({
        id: this.generateId(),
        name: detectedItem.name,
        description: detectedItem.description,
        price: detectedItem.price || 0,
        isAvailable: true,
        customizations: []
      }));

      const menuRequest: MenuCreateRequest = {
        name: menuName,
        description: `從圖片自動建立的菜單 (信心度: ${Math.round(ocrResult.confidence * 100)}%)`,
        items,
        tags: ['OCR', '自動建立', '圖片辨識']
      };

      const menu = await this.createMenu(userId, menuRequest);
      
      // 標記為 OCR 處理過的菜單，並儲存原始 OCR 結果
      const updatedMenu = {
        ...menu,
        ocrProcessed: true,
        originalImageUrl: ocrResult.extractedText ? 'processed' : undefined
      };
      this.menus.set(menu.id, updatedMenu);

      console.log('Menu created from OCR:', {
        menuId: menu.id,
        itemCount: items.length,
        confidence: ocrResult.confidence
      });

      return updatedMenu;
    } catch (error) {
      console.error('Error creating menu from OCR:', error);
      return null;
    }
  }

  async canUserModifyMenu(menuId: string, userId: string): Promise<boolean> {
    const menu = this.menus.get(menuId);
    return menu ? menu.createdBy === userId : false;
  }

  async canUserViewMenu(menuId: string, userId?: string): Promise<boolean> {
    const menu = this.menus.get(menuId);
    if (!menu) return false;

    // 公開菜單任何人都可以查看
    if (menu.isPublic) return true;

    // 私人菜單只有創建者可以查看
    return userId ? menu.createdBy === userId : false;
  }

  // 菜單儲存和分享功能實作 (Task 5.5)
  
  async saveMenuForUser(userId: string, menuId: string): Promise<{ success: boolean; error?: string }> {
    // 檢查菜單是否存在
    const menu = await this.getMenuById(menuId);
    if (!menu) {
      return { success: false, error: 'Menu not found' };
    }

    // 檢查用戶是否有權限查看此菜單
    const canView = await this.canUserViewMenu(menuId, userId);
    if (!canView) {
      return { success: false, error: 'Permission denied: Cannot save private menu' };
    }

    // 檢查是否已經儲存過
    let userSavedSet = this.userSavedMenus.get(userId);
    if (!userSavedSet) {
      userSavedSet = new Set();
      this.userSavedMenus.set(userId, userSavedSet);
    }

    if (userSavedSet.has(menuId)) {
      return { success: false, error: 'Menu already saved' };
    }

    // 儲存菜單到本地快取
    userSavedSet.add(menuId);
    
    // 同步到 UserManager（如果可用）
    if (this.userManager) {
      await this.userManager.addSavedMenu(userId, menuId);
    }
    
    console.log(`User ${userId} saved menu ${menuId}`);
    return { success: true };
  }

  async unsaveMenuForUser(userId: string, menuId: string): Promise<{ success: boolean; error?: string }> {
    const userSavedSet = this.userSavedMenus.get(userId);
    if (!userSavedSet || !userSavedSet.has(menuId)) {
      return { success: false, error: 'Menu not in saved list' };
    }

    // 從本地快取移除
    userSavedSet.delete(menuId);
    
    // 同步到 UserManager（如果可用）
    if (this.userManager) {
      await this.userManager.removeSavedMenu(userId, menuId);
    }
    
    console.log(`User ${userId} unsaved menu ${menuId}`);
    return { success: true };
  }

  async getUserSavedMenus(userId: string, page: number = 1, limit: number = 10): Promise<MenuSearchResult> {
    const userSavedSet = this.userSavedMenus.get(userId) || new Set();
    const savedMenuIds = Array.from(userSavedSet);
    
    // 獲取所有已儲存的菜單
    const savedMenus: Menu[] = [];
    for (const menuId of savedMenuIds) {
      const menu = await this.getMenuById(menuId);
      if (menu && await this.canUserViewMenu(menuId, userId)) {
        savedMenus.push(menu);
      }
    }

    // 按更新時間排序（最新的在前面）
    savedMenus.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMenus = savedMenus.slice(startIndex, endIndex);

    return {
      menus: paginatedMenus,
      total: savedMenus.length,
      page,
      limit
    };
  }

  async validateMenuForSharing(menuId: string, userId: string): Promise<{ canShare: boolean; reason?: string }> {
    const menu = await this.getMenuById(menuId);
    if (!menu) {
      return { canShare: false, reason: 'Menu not found' };
    }

    // 只有菜單創建者可以分享菜單
    if (menu.createdBy !== userId) {
      return { canShare: false, reason: 'Only menu creator can share to community' };
    }

    // 檢查菜單是否已經是公開的
    if (menu.isPublic) {
      return { canShare: false, reason: 'Menu is already public' };
    }

    // 檢查菜單是否有足夠的內容可以分享
    if (!menu.items || menu.items.length === 0) {
      return { canShare: false, reason: 'Menu must have at least one item to share' };
    }

    // 檢查菜單是否有基本資訊
    if (!menu.name || menu.name.trim().length === 0) {
      return { canShare: false, reason: 'Menu must have a name to share' };
    }

    // 檢查是否有餐廳資訊（建議但非必須）
    const hasRestaurantInfo = menu.restaurantName && menu.restaurantName.trim().length > 0;
    if (!hasRestaurantInfo) {
      return { 
        canShare: true, 
        reason: 'Menu can be shared, but adding restaurant information would make it more useful for the community' 
      };
    }

    return { canShare: true };
  }

  async shareMenuToCommunity(menuId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    // 驗證是否可以分享
    const validation = await this.validateMenuForSharing(menuId, userId);
    if (!validation.canShare) {
      return { success: false, error: validation.reason };
    }

    const menu = this.menus.get(menuId);
    if (!menu) {
      return { success: false, error: 'Menu not found' };
    }

    // 將菜單設為公開
    const updatedMenu = {
      ...menu,
      isPublic: true,
      updatedAt: new Date(),
      tags: [...menu.tags, '社群分享', '公開菜單'].filter((tag, index, arr) => arr.indexOf(tag) === index) // 去重
    };

    this.menus.set(menuId, updatedMenu);
    
    console.log(`Menu ${menuId} shared to community by user ${userId}`);
    return { success: true };
  }

  async createMenuTemplate(userId: string, menuId: string, templateName: string, description: string): Promise<MenuTemplate | null> {
    const menu = await this.getMenuById(menuId);
    if (!menu) {
      return null;
    }

    // 檢查用戶是否有權限創建模板（必須是菜單創建者或菜單是公開的）
    const canAccess = menu.createdBy === userId || menu.isPublic;
    if (!canAccess) {
      return null;
    }

    // 檢查菜單是否有足夠內容創建模板
    if (!menu.items || menu.items.length === 0) {
      return null;
    }

    const templateId = this.generateId();
    const template: MenuTemplate = {
      id: templateId,
      name: templateName,
      description: description,
      category: menu.categories.length > 0 ? menu.categories[0] : '其他',
      items: menu.items.map(item => ({
        ...item,
        id: this.generateId() // 為模板項目生成新的 ID
      })),
      tags: [...menu.tags, '菜單模板'],
      usageCount: 0,
      rating: 0,
      createdBy: userId,
      createdAt: new Date(),
      isVerified: false
    };

    this.menuTemplates.set(templateId, template);
    
    console.log(`Menu template ${templateId} created from menu ${menuId} by user ${userId}`);
    return template;
  }

  // 菜單模板管理實作
  
  async getMenuTemplates(page: number = 1, limit: number = 10): Promise<MenuTemplate[]> {
    const allTemplates = Array.from(this.menuTemplates.values());
    
    // 按創建時間排序（最新的在前面）
    allTemplates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return allTemplates.slice(startIndex, endIndex);
  }

  async searchMenuTemplates(query: MenuSearchQuery, page: number = 1, limit: number = 10): Promise<{ templates: MenuTemplate[]; total: number; page: number; limit: number }> {
    const allTemplates = Array.from(this.menuTemplates.values());
    
    let filteredTemplates = allTemplates.filter(template => {
      // 關鍵字搜尋
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const matchesName = template.name.toLowerCase().includes(keyword);
        const matchesDescription = template.description?.toLowerCase().includes(keyword);
        const matchesTags = template.tags.some(tag => tag.toLowerCase().includes(keyword));
        
        if (!matchesName && !matchesDescription && !matchesTags) {
          return false;
        }
      }

      // 分類篩選
      if (query.category && template.category !== query.category) {
        return false;
      }

      // 標籤篩選
      if (query.tags && query.tags.length > 0) {
        const hasMatchingTag = query.tags.some(tag => template.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // 創建者篩選
      if (query.createdBy && template.createdBy !== query.createdBy) {
        return false;
      }

      return true;
    });

    // 排序：最新的在前面
    filteredTemplates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTemplates = filteredTemplates.slice(startIndex, endIndex);

    return {
      templates: paginatedTemplates,
      total: filteredTemplates.length,
      page,
      limit
    };
  }

  async getMenuTemplateById(templateId: string): Promise<MenuTemplate | null> {
    return this.menuTemplates.get(templateId) || null;
  }

  async updateMenuTemplate(templateId: string, userId: string, updates: Partial<MenuTemplate>): Promise<MenuTemplate | null> {
    const template = this.menuTemplates.get(templateId);
    if (!template || template.createdBy !== userId) {
      return null;
    }

    const updatedTemplate: MenuTemplate = {
      ...template,
      ...updates,
      id: templateId, // 確保 ID 不被覆蓋
      createdBy: template.createdBy, // 確保創建者不被覆蓋
      createdAt: template.createdAt // 確保創建時間不被覆蓋
    };

    this.menuTemplates.set(templateId, updatedTemplate);
    return updatedTemplate;
  }

  async deleteMenuTemplate(templateId: string, userId: string): Promise<boolean> {
    const template = this.menuTemplates.get(templateId);
    if (!template || template.createdBy !== userId) {
      return false;
    }

    this.menuTemplates.delete(templateId);
    return true;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }
}