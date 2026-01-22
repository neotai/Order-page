import { 
  Menu, 
  MenuItem, 
  MenuTemplate,
  MenuSearchQuery,
  MenuSearchResult,
  MenuCopyRequest,
  MenuCopyResult
} from '../types/menu';
import { MenuService } from './MenuService';

export interface CommunityMenuSearchQuery extends MenuSearchQuery {
  sortBy?: 'popularity' | 'newest' | 'rating' | 'usage';
  templateOnly?: boolean;
  verified?: boolean;
}

export interface CommunityMenuSearchResult extends MenuSearchResult {
  templates?: MenuTemplate[];
  categories?: string[];
  popularTags?: string[];
}

export interface CommunityService {
  // 社群菜單瀏覽和搜尋
  browseCommunityMenus(query?: CommunityMenuSearchQuery, page?: number, limit?: number): Promise<CommunityMenuSearchResult>;
  getPopularMenus(limit?: number): Promise<Menu[]>;
  getFeaturedMenus(limit?: number): Promise<Menu[]>;
  getMenusByCategory(category: string, page?: number, limit?: number): Promise<MenuSearchResult>;
  
  // 菜單模板系統
  browseMenuTemplates(query?: CommunityMenuSearchQuery, page?: number, limit?: number): Promise<CommunityMenuSearchResult>;
  getPopularTemplates(limit?: number): Promise<MenuTemplate[]>;
  getTemplateById(templateId: string): Promise<MenuTemplate | null>;
  createMenuFromTemplate(userId: string, templateId: string, customizations?: Partial<Menu>): Promise<Menu | null>;
  
  // 社群統計和分析
  getCommunityStats(): Promise<{
    totalMenus: number;
    totalTemplates: number;
    totalCategories: number;
    popularCategories: Array<{ name: string; count: number }>;
    popularTags: Array<{ name: string; count: number }>;
  }>;
  
  // 菜單評分和互動
  rateMenu(userId: string, menuId: string, rating: number): Promise<{ success: boolean; error?: string }>;
  getMenuRating(menuId: string): Promise<{ averageRating: number; totalRatings: number }>;
  
  // 搜尋建議
  getSearchSuggestions(query: string): Promise<string[]>;
  getRelatedMenus(menuId: string, limit?: number): Promise<Menu[]>;
}

export class CommunityServiceImpl implements CommunityService {
  private menuService: MenuService;
  private menuRatings: Map<string, Array<{ userId: string; rating: number; createdAt: Date }>> = new Map();
  private menuUsageCount: Map<string, number> = new Map();
  private templateUsageCount: Map<string, number> = new Map();

  constructor(menuService: MenuService) {
    this.menuService = menuService;
  }

  async browseCommunityMenus(query: CommunityMenuSearchQuery = {}, page: number = 1, limit: number = 12): Promise<CommunityMenuSearchResult> {
    // 確保只搜尋公開菜單
    const communityQuery: MenuSearchQuery = {
      ...query,
      isPublic: true
    };

    // 獲取基本搜尋結果
    const baseResult = await this.menuService.searchMenus(communityQuery, page, limit);
    
    // 根據排序方式調整結果
    let sortedMenus = [...baseResult.menus];
    
    switch (query.sortBy) {
      case 'popularity':
        sortedMenus = this.sortByPopularity(sortedMenus);
        break;
      case 'rating':
        sortedMenus = await this.sortByRating(sortedMenus);
        break;
      case 'usage':
        sortedMenus = this.sortByUsage(sortedMenus);
        break;
      case 'newest':
      default:
        // 已經按照更新時間排序
        break;
    }

    // 獲取額外的社群資訊
    const categories = await this.getAvailableCategories();
    const popularTags = await this.getPopularTags();

    return {
      ...baseResult,
      menus: sortedMenus,
      categories,
      popularTags
    };
  }

  async getPopularMenus(limit: number = 10): Promise<Menu[]> {
    const result = await this.menuService.getPublicMenus(1, limit * 2); // 獲取更多以便排序
    return this.sortByPopularity(result.menus).slice(0, limit);
  }

  async getFeaturedMenus(limit: number = 6): Promise<Menu[]> {
    // 獲取高評分且有完整資訊的菜單作為精選
    const result = await this.menuService.getPublicMenus(1, limit * 3);
    
    const featuredMenus = result.menus.filter(menu => {
      // 精選條件：有餐廳資訊、有描述、項目數量充足
      return menu.restaurantName && 
             menu.description && 
             menu.items.length >= 3 &&
             menu.tags.length > 0;
    });

    return await this.sortByRating(featuredMenus.slice(0, limit));
  }

  async getMenusByCategory(category: string, page: number = 1, limit: number = 12): Promise<MenuSearchResult> {
    return await this.menuService.searchMenus({
      category,
      isPublic: true
    }, page, limit);
  }

  async browseMenuTemplates(query: CommunityMenuSearchQuery = {}, page: number = 1, limit: number = 12): Promise<CommunityMenuSearchResult> {
    // 使用 MenuService 的模板搜尋功能
    const templateResult = await this.menuService.searchMenuTemplates(query, page, limit);
    
    // 根據排序方式調整結果
    let sortedTemplates = [...templateResult.templates];
    
    switch (query.sortBy) {
      case 'popularity':
        sortedTemplates = this.sortTemplatesByPopularity(sortedTemplates);
        break;
      case 'rating':
        sortedTemplates = this.sortTemplatesByRating(sortedTemplates);
        break;
      case 'usage':
        sortedTemplates = this.sortTemplatesByUsage(sortedTemplates);
        break;
      case 'newest':
      default:
        // 已經按照創建時間排序
        break;
    }

    // 如果需要驗證過的模板
    if (query.verified !== undefined) {
      sortedTemplates = sortedTemplates.filter(template => template.isVerified === query.verified);
    }
    
    return {
      menus: [],
      templates: sortedTemplates,
      total: templateResult.total,
      page: templateResult.page,
      limit: templateResult.limit,
      categories: await this.getAvailableCategories(),
      popularTags: await this.getPopularTags()
    };
  }

  async getPopularTemplates(limit: number = 10): Promise<MenuTemplate[]> {
    const templates = await this.menuService.getMenuTemplates(1, limit * 2); // 獲取更多以便排序
    return this.sortTemplatesByPopularity(templates).slice(0, limit);
  }

  async getTemplateById(templateId: string): Promise<MenuTemplate | null> {
    return await this.menuService.getMenuTemplateById(templateId);
  }

  async createMenuFromTemplate(userId: string, templateId: string, customizations?: Partial<Menu>): Promise<Menu | null> {
    const template = await this.getTemplateById(templateId);
    if (!template) {
      return null;
    }

    // 增加模板使用次數
    const currentUsage = this.templateUsageCount.get(templateId) || 0;
    this.templateUsageCount.set(templateId, currentUsage + 1);

    // 從模板創建菜單
    const menuData = {
      name: customizations?.name || `${template.name} (從模板建立)`,
      description: customizations?.description || template.description,
      items: template.items,
      categories: template.category ? [template.category] : [],
      tags: [...template.tags, '從模板建立'],
      isPublic: customizations?.isPublic || false,
      ...customizations
    };

    return await this.menuService.createMenu(userId, menuData);
  }

  async getCommunityStats(): Promise<{
    totalMenus: number;
    totalTemplates: number;
    totalCategories: number;
    popularCategories: Array<{ name: string; count: number }>;
    popularTags: Array<{ name: string; count: number }>;
  }> {
    const publicMenusResult = await this.menuService.getPublicMenus(1, 1000); // 獲取所有公開菜單進行統計
    const menus = publicMenusResult.menus;
    
    const templates = await this.menuService.getMenuTemplates(1, 1000); // 獲取所有模板進行統計

    // 統計分類
    const categoryCount = new Map<string, number>();
    const tagCount = new Map<string, number>();

    menus.forEach(menu => {
      // 統計分類
      menu.categories.forEach(category => {
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
      });

      // 統計標籤
      menu.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });

    // 統計模板的分類和標籤
    templates.forEach(template => {
      if (template.category) {
        categoryCount.set(template.category, (categoryCount.get(template.category) || 0) + 1);
      }
      
      template.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });

    // 轉換為排序陣列
    const popularCategories = Array.from(categoryCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const popularTags = Array.from(tagCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      totalMenus: menus.length,
      totalTemplates: templates.length,
      totalCategories: categoryCount.size,
      popularCategories,
      popularTags
    };
  }

  async rateMenu(userId: string, menuId: string, rating: number): Promise<{ success: boolean; error?: string }> {
    // 驗證評分範圍
    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }

    // 檢查菜單是否存在且為公開
    const menu = await this.menuService.getMenuById(menuId);
    if (!menu || !menu.isPublic) {
      return { success: false, error: 'Menu not found or not public' };
    }

    // 檢查用戶是否已經評分過
    let ratings = this.menuRatings.get(menuId) || [];
    const existingRatingIndex = ratings.findIndex(r => r.userId === userId);

    if (existingRatingIndex >= 0) {
      // 更新現有評分
      ratings[existingRatingIndex] = {
        userId,
        rating,
        createdAt: new Date()
      };
    } else {
      // 添加新評分
      ratings.push({
        userId,
        rating,
        createdAt: new Date()
      });
    }

    this.menuRatings.set(menuId, ratings);
    return { success: true };
  }

  async getMenuRating(menuId: string): Promise<{ averageRating: number; totalRatings: number }> {
    const ratings = this.menuRatings.get(menuId) || [];
    
    if (ratings.length === 0) {
      return { averageRating: 0, totalRatings: 0 };
    }

    const totalScore = ratings.reduce((sum, rating) => sum + rating.rating, 0);
    const averageRating = totalScore / ratings.length;

    return {
      averageRating: Math.round(averageRating * 10) / 10, // 保留一位小數
      totalRatings: ratings.length
    };
  }

  async getSearchSuggestions(query: string): Promise<string[]> {
    const publicMenusResult = await this.menuService.getPublicMenus(1, 100);
    const menus = publicMenusResult.menus;
    
    const suggestions = new Set<string>();
    const lowerQuery = query.toLowerCase();

    menus.forEach(menu => {
      // 從菜單名稱、餐廳名稱、標籤中提取建議
      if (menu.name.toLowerCase().includes(lowerQuery)) {
        suggestions.add(menu.name);
      }
      if (menu.restaurantName && menu.restaurantName.toLowerCase().includes(lowerQuery)) {
        suggestions.add(menu.restaurantName);
      }
      menu.tags.forEach(tag => {
        if (tag.toLowerCase().includes(lowerQuery)) {
          suggestions.add(tag);
        }
      });
      menu.categories.forEach(category => {
        if (category.toLowerCase().includes(lowerQuery)) {
          suggestions.add(category);
        }
      });
    });

    return Array.from(suggestions).slice(0, 10);
  }

  async getRelatedMenus(menuId: string, limit: number = 5): Promise<Menu[]> {
    const targetMenu = await this.menuService.getMenuById(menuId);
    if (!targetMenu || !targetMenu.isPublic) {
      return [];
    }

    const publicMenusResult = await this.menuService.getPublicMenus(1, 100);
    const allMenus = publicMenusResult.menus.filter(menu => menu.id !== menuId);

    // 計算相似度分數
    const scoredMenus = allMenus.map(menu => ({
      menu,
      score: this.calculateSimilarityScore(targetMenu, menu)
    }));

    // 按相似度排序並返回前幾個
    return scoredMenus
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.menu);
  }

  // 私有輔助方法

  private sortByPopularity(menus: Menu[]): Menu[] {
    return menus.sort((a, b) => {
      const aUsage = this.menuUsageCount.get(a.id) || 0;
      const bUsage = this.menuUsageCount.get(b.id) || 0;
      return bUsage - aUsage;
    });
  }

  private async sortByRating(menus: Menu[]): Promise<Menu[]> {
    const menusWithRatings = await Promise.all(
      menus.map(async menu => ({
        menu,
        rating: await this.getMenuRating(menu.id)
      }))
    );

    return menusWithRatings
      .sort((a, b) => {
        // 先按平均評分排序，再按評分數量排序
        if (a.rating.averageRating !== b.rating.averageRating) {
          return b.rating.averageRating - a.rating.averageRating;
        }
        return b.rating.totalRatings - a.rating.totalRatings;
      })
      .map(item => item.menu);
  }

  private sortByUsage(menus: Menu[]): Menu[] {
    return menus.sort((a, b) => {
      const aUsage = this.menuUsageCount.get(a.id) || 0;
      const bUsage = this.menuUsageCount.get(b.id) || 0;
      return bUsage - aUsage;
    });
  }

  private sortTemplatesByPopularity(templates: MenuTemplate[]): MenuTemplate[] {
    return templates.sort((a, b) => {
      const aUsage = this.templateUsageCount.get(a.id) || 0;
      const bUsage = this.templateUsageCount.get(b.id) || 0;
      return bUsage - aUsage;
    });
  }

  private sortTemplatesByRating(templates: MenuTemplate[]): MenuTemplate[] {
    return templates.sort((a, b) => {
      // 按評分排序，如果評分相同則按使用次數排序
      if (a.rating !== b.rating) {
        return b.rating - a.rating;
      }
      return b.usageCount - a.usageCount;
    });
  }

  private sortTemplatesByUsage(templates: MenuTemplate[]): MenuTemplate[] {
    return templates.sort((a, b) => {
      const aUsage = this.templateUsageCount.get(a.id) || a.usageCount || 0;
      const bUsage = this.templateUsageCount.get(b.id) || b.usageCount || 0;
      return bUsage - aUsage;
    });
  }

  private async getAvailableCategories(): Promise<string[]> {
    const publicMenusResult = await this.menuService.getPublicMenus(1, 1000);
    const categories = new Set<string>();
    
    publicMenusResult.menus.forEach(menu => {
      menu.categories.forEach(category => categories.add(category));
    });

    return Array.from(categories).sort();
  }

  private async getPopularTags(): Promise<string[]> {
    const stats = await this.getCommunityStats();
    return stats.popularTags.slice(0, 10).map(tag => tag.name);
  }

  private calculateSimilarityScore(menu1: Menu, menu2: Menu): number {
    let score = 0;

    // 相同分類加分
    const commonCategories = menu1.categories.filter(cat => menu2.categories.includes(cat));
    score += commonCategories.length * 3;

    // 相同標籤加分
    const commonTags = menu1.tags.filter(tag => menu2.tags.includes(tag));
    score += commonTags.length * 2;

    // 相同餐廳加分
    if (menu1.restaurantName && menu1.restaurantName === menu2.restaurantName) {
      score += 5;
    }

    // 價格範圍相似加分
    const menu1Prices = menu1.items.map(item => item.price);
    const menu2Prices = menu2.items.map(item => item.price);
    
    if (menu1Prices.length > 0 && menu2Prices.length > 0) {
      const menu1AvgPrice = menu1Prices.reduce((sum, price) => sum + price, 0) / menu1Prices.length;
      const menu2AvgPrice = menu2Prices.reduce((sum, price) => sum + price, 0) / menu2Prices.length;
      
      const priceDiff = Math.abs(menu1AvgPrice - menu2AvgPrice);
      if (priceDiff < 50) score += 2;
      else if (priceDiff < 100) score += 1;
    }

    return score;
  }

  // 增加菜單使用次數（當有人複製或使用菜單時調用）
  incrementMenuUsage(menuId: string): void {
    const currentUsage = this.menuUsageCount.get(menuId) || 0;
    this.menuUsageCount.set(menuId, currentUsage + 1);
  }

  // 增加模板使用次數
  incrementTemplateUsage(templateId: string): void {
    const currentUsage = this.templateUsageCount.get(templateId) || 0;
    this.templateUsageCount.set(templateId, currentUsage + 1);
  }
}