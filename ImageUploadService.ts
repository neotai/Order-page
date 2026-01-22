import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

export interface ImageUploadService {
  uploadImage(file: Express.Multer.File): Promise<string>;
  deleteImage(imageUrl: string): Promise<boolean>;
  getImageBuffer(imageUrl: string): Promise<Buffer>;
}

export class LocalImageUploadService implements ImageUploadService {
  private uploadDir: string;

  constructor(uploadDir: string = 'uploads/images') {
    this.uploadDir = uploadDir;
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // 生成唯一的檔案名稱
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(file.originalname);
    const filename = `menu_${timestamp}_${randomString}${extension}`;
    
    const filepath = path.join(this.uploadDir, filename);
    
    // 儲存檔案
    await fs.writeFile(filepath, file.buffer);
    
    // 返回相對路徑作為 URL
    return `/uploads/images/${filename}`;
  }

  async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      // 從 URL 提取檔案路徑
      const filename = path.basename(imageUrl);
      const filepath = path.join(this.uploadDir, filename);
      
      await fs.unlink(filepath);
      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  async getImageBuffer(imageUrl: string): Promise<Buffer> {
    try {
      // 如果是本地檔案路徑
      if (imageUrl.startsWith('/uploads/')) {
        const filename = path.basename(imageUrl);
        const filepath = path.join(this.uploadDir, filename);
        return await fs.readFile(filepath);
      }
      
      // 如果是外部 URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to get image buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 建立 multer 中介軟體配置
  createMulterConfig(): multer.Multer {
    const storage = multer.memoryStorage(); // 使用記憶體儲存，方便後續處理

    const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      // 只允許圖片檔案
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 限制
        files: 1 // 一次只能上傳一個檔案
      }
    });
  }
}

// 圖片驗證工具
export class ImageValidator {
  private static readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ];

  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  static validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    // 檢查檔案類型
    if (!this.ALLOWED_TYPES.includes(file.mimetype)) {
      return {
        valid: false,
        error: `Unsupported file type: ${file.mimetype}. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`
      };
    }

    // 檢查檔案大小
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large: ${file.size} bytes. Maximum allowed: ${this.MAX_FILE_SIZE} bytes`
      };
    }

    // 檢查檔案名稱
    if (!file.originalname || file.originalname.trim().length === 0) {
      return {
        valid: false,
        error: 'Invalid filename'
      };
    }

    return { valid: true };
  }

  static validateImageUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsedUrl = new URL(url);
      
      // 檢查協議
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          valid: false,
          error: 'Invalid protocol. Only HTTP and HTTPS are allowed'
        };
      }

      // 檢查副檔名
      const pathname = parsedUrl.pathname.toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const hasValidExtension = allowedExtensions.some(ext => pathname.endsWith(ext));
      
      if (!hasValidExtension) {
        return {
          valid: false,
          error: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid URL format'
      };
    }
  }
}