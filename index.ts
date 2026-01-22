import { SystemIntegration } from './startup';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

async function startServer() {
  const systemIntegration = SystemIntegration.getInstance();
  let server: any;
  let services: any;

  try {
    // 啟動系統
    const result = await systemIntegration.startSystem();
    server = result.server;
    services = result.services;

    // 註冊關閉處理程序
    const gracefulShutdown = async () => {
      try {
        await systemIntegration.gracefulShutdown(server, services);
        process.exit(0);
      } catch (error) {
        console.error('❌ 系統關閉失敗:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    console.error('❌ 系統啟動失敗:', error);
    
    // 嘗試清理資源
    if (server || services) {
      try {
        await systemIntegration.gracefulShutdown(server, services);
      } catch (cleanupError) {
        console.error('❌ 清理資源失敗:', cleanupError);
      }
    }
    
    process.exit(1);
  }
}

// 處理未捕獲的異常和未處理的 Promise 拒絕
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
  console.error('堆疊追蹤:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// 啟動伺服器
if (require.main === module) {
  startServer();
}

export { startServer };