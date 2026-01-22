import { createApp } from './app';
import { DatabaseManager, getDefaultDatabaseConfig } from './config/database';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

interface SystemStatus {
  database: boolean;
  webSocket: boolean;
  staticFiles: boolean;
  environment: boolean;
  services: boolean;
}

class SystemIntegration {
  private static instance: SystemIntegration;
  private systemStatus: SystemStatus = {
    database: false,
    webSocket: false,
    staticFiles: false,
    environment: false,
    services: false
  };

  static getInstance(): SystemIntegration {
    if (!SystemIntegration.instance) {
      SystemIntegration.instance = new SystemIntegration();
    }
    return SystemIntegration.instance;
  }

  async validateEnvironment(): Promise<boolean> {
    console.log('🔍 驗證環境配置...');
    
    try {
      // 檢查必要的環境變數
      const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`⚠️  缺少環境變數: ${missingVars.join(', ')}`);
        console.log('💡 使用預設值繼續運行...');
      }

      // 檢查上傳目錄
      const uploadDir = process.env.UPLOAD_DIR || 'uploads/images';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log(`📁 已創建上傳目錄: ${uploadDir}`);
      }

      // 檢查客戶端建置檔案
      const clientBuildPath = path.join(__dirname, '../client/build');
      if (!fs.existsSync(clientBuildPath)) {
        console.warn('⚠️  客戶端建置檔案不存在，請執行 npm run build:client');
        this.systemStatus.staticFiles = false;
      } else {
        this.systemStatus.staticFiles = true;
        console.log('✅ 客戶端建置檔案已就緒');
      }

      this.systemStatus.environment = true;
      return true;
    } catch (error) {
      console.error('❌ 環境驗證失敗:', error);
      this.systemStatus.environment = false;
      return false;
    }
  }

  async validateDatabase(): Promise<boolean> {
    console.log('🔍 驗證資料庫連接...');
    
    try {
      const dbManager = DatabaseManager.getInstance();
      const dbConfig = getDefaultDatabaseConfig();
      
      await dbManager.connect(dbConfig);
      
      if (dbManager.isConnectionActive()) {
        console.log('✅ 資料庫連接成功');
        this.systemStatus.database = true;
        return true;
      } else {
        throw new Error('資料庫連接未啟用');
      }
    } catch (error) {
      console.error('❌ 資料庫連接失敗:', error);
      this.systemStatus.database = false;
      return false;
    }
  }

  async validateServices(): Promise<boolean> {
    console.log('🔍 驗證系統服務...');
    
    try {
      // 這裡可以添加服務健康檢查
      // 例如檢查外部 API 連接、檔案系統權限等
      
      // 檢查 Google Vision API 配置（如果需要）
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!fs.existsSync(credentialsPath)) {
          console.warn('⚠️  Google Vision API 憑證檔案不存在');
        } else {
          console.log('✅ Google Vision API 憑證已配置');
        }
      }

      this.systemStatus.services = true;
      console.log('✅ 系統服務驗證完成');
      return true;
    } catch (error) {
      console.error('❌ 服務驗證失敗:', error);
      this.systemStatus.services = false;
      return false;
    }
  }

  async startSystem(): Promise<{ server: any; app: any; services: any }> {
    console.log('🚀 啟動團購訂餐系統...');
    console.log('=' .repeat(50));

    // 1. 驗證環境
    const envValid = await this.validateEnvironment();
    if (!envValid) {
      throw new Error('環境驗證失敗');
    }

    // 2. 驗證資料庫
    const dbValid = await this.validateDatabase();
    if (!dbValid) {
      throw new Error('資料庫驗證失敗');
    }

    // 3. 驗證服務
    const servicesValid = await this.validateServices();
    if (!servicesValid) {
      console.warn('⚠️  部分服務驗證失敗，但系統將繼續啟動');
    }

    // 4. 創建 HTTP 伺服器和應用程式
    const PORT = process.env.PORT || 3001;
    const server = createServer();
    
    const appResult = createApp(server);
    const { app, webSocketService } = appResult;
    
    // 5. 設定 WebSocket
    if (webSocketService) {
      this.systemStatus.webSocket = true;
      console.log('✅ WebSocket 服務已啟用');
    } else {
      console.warn('⚠️  WebSocket 服務未啟用');
      this.systemStatus.webSocket = false;
    }

    // 6. 將 Express 應用程式附加到 HTTP 伺服器
    server.on('request', app);

    // 7. 啟動伺服器
    return new Promise((resolve, reject) => {
      server.listen(PORT, () => {
        console.log('=' .repeat(50));
        console.log('🎉 系統啟動成功！');
        console.log(`📍 伺服器地址: http://localhost:${PORT}`);
        console.log(`🔗 健康檢查: http://localhost:${PORT}/health`);
        console.log(`🔐 認證 API: http://localhost:${PORT}/api/auth`);
        console.log(`📊 系統狀態:`);
        console.log(`   - 資料庫: ${this.systemStatus.database ? '✅' : '❌'}`);
        console.log(`   - WebSocket: ${this.systemStatus.webSocket ? '✅' : '❌'}`);
        console.log(`   - 靜態檔案: ${this.systemStatus.staticFiles ? '✅' : '❌'}`);
        console.log(`   - 環境配置: ${this.systemStatus.environment ? '✅' : '❌'}`);
        console.log(`   - 系統服務: ${this.systemStatus.services ? '✅' : '❌'}`);
        console.log('=' .repeat(50));

        resolve({ server, app, services: appResult });
      });

      server.on('error', (error) => {
        console.error('❌ 伺服器啟動失敗:', error);
        reject(error);
      });
    });
  }

  async gracefulShutdown(server: any, services: any): Promise<void> {
    console.log('\n🛑 正在關閉系統...');
    
    try {
      // 1. 關閉 WebSocket 服務
      if (services.webSocketService) {
        services.webSocketService.close();
        console.log('✅ WebSocket 服務已關閉');
      }

      // 2. 停止訂單調度器
      if (services.orderScheduler) {
        services.orderScheduler.stop();
        console.log('✅ 訂單調度器已停止');
      }

      // 3. 關閉 HTTP 伺服器
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('✅ HTTP 伺服器已關閉');
          resolve();
        });
      });

      // 4. 關閉資料庫連接
      const dbManager = DatabaseManager.getInstance();
      await dbManager.disconnect();
      console.log('✅ 資料庫連接已關閉');

      console.log('🎯 系統已安全關閉');
    } catch (error) {
      console.error('❌ 關閉系統時發生錯誤:', error);
      throw error;
    }
  }

  getSystemStatus(): SystemStatus {
    return { ...this.systemStatus };
  }
}

export { SystemIntegration };