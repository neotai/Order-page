import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseManager } from '../config/database';
import { createAuthMiddleware } from '../middleware/auth';
import { UserManager } from '../managers/UserManager';
import { WebSocketService } from '../services/WebSocketService';
import { OrderScheduler } from '../services/OrderScheduler';
import fs from 'fs';
import path from 'path';

export function createSystemRouter(
  userManager: UserManager,
  webSocketService?: WebSocketService,
  orderScheduler?: OrderScheduler
) {
  const router = Router();
  const authMiddleware = createAuthMiddleware(userManager);

  // 系統狀態總覽
  router.get('/status', asyncHandler(async (req, res) => {
    const dbManager = DatabaseManager.getInstance();
    
    const systemStatus = {
      timestamp: new Date().toISOString(),
      service: 'meal-ordering-system',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        connected: dbManager.isConnectionActive(),
        status: dbManager.isConnectionActive() ? 'healthy' : 'disconnected'
      },
      webSocket: webSocketService ? {
        enabled: true,
        status: webSocketService.getStatus(),
        connections: webSocketService.getConnectionCount ? webSocketService.getConnectionCount() : 0
      } : {
        enabled: false,
        status: 'disabled'
      },
      scheduler: orderScheduler ? {
        enabled: true,
        status: orderScheduler.getStatus(),
        isRunning: orderScheduler.isRunning ? orderScheduler.isRunning() : false
      } : {
        enabled: false,
        status: 'disabled'
      },
      staticFiles: {
        clientBuild: fs.existsSync(path.join(__dirname, '../../client/build')),
        uploads: fs.existsSync('uploads/images')
      }
    };

    res.json({
      success: true,
      status: systemStatus
    });
  }));

  // 詳細健康檢查
  router.get('/health/detailed', asyncHandler(async (req, res) => {
    const dbManager = DatabaseManager.getInstance();
    const checks = [];

    // 資料庫連接檢查
    try {
      const dbConnected = dbManager.isConnectionActive();
      checks.push({
        name: 'database',
        status: dbConnected ? 'pass' : 'fail',
        message: dbConnected ? '資料庫連接正常' : '資料庫連接失敗',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      checks.push({
        name: 'database',
        status: 'fail',
        message: `資料庫檢查失敗: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    }

    // WebSocket 服務檢查
    if (webSocketService) {
      try {
        const wsStatus = webSocketService.getStatus();
        checks.push({
          name: 'websocket',
          status: wsStatus.running ? 'pass' : 'fail',
          message: wsStatus.running ? 'WebSocket 服務正常' : 'WebSocket 服務未運行',
          details: wsStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        checks.push({
          name: 'websocket',
          status: 'fail',
          message: `WebSocket 檢查失敗: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      checks.push({
        name: 'websocket',
        status: 'warn',
        message: 'WebSocket 服務未啟用',
        timestamp: new Date().toISOString()
      });
    }

    // 訂單調度器檢查
    if (orderScheduler) {
      try {
        const schedulerStatus = orderScheduler.getStatus();
        checks.push({
          name: 'scheduler',
          status: schedulerStatus.running ? 'pass' : 'fail',
          message: schedulerStatus.running ? '訂單調度器正常' : '訂單調度器未運行',
          details: schedulerStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        checks.push({
          name: 'scheduler',
          status: 'fail',
          message: `調度器檢查失敗: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      checks.push({
        name: 'scheduler',
        status: 'warn',
        message: '訂單調度器未啟用',
        timestamp: new Date().toISOString()
      });
    }

    // 檔案系統檢查
    const fileChecks = [
      { path: path.join(__dirname, '../../client/build'), name: '前端建置檔案' },
      { path: 'uploads/images', name: '圖片上傳目錄' }
    ];

    for (const check of fileChecks) {
      const exists = fs.existsSync(check.path);
      checks.push({
        name: `filesystem_${check.name}`,
        status: exists ? 'pass' : 'warn',
        message: exists ? `${check.name}存在` : `${check.name}不存在`,
        path: check.path,
        timestamp: new Date().toISOString()
      });
    }

    // 記憶體使用檢查
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
    checks.push({
      name: 'memory',
      status: memoryMB < 512 ? 'pass' : memoryMB < 1024 ? 'warn' : 'fail',
      message: `記憶體使用: ${memoryMB.toFixed(2)} MB`,
      details: memoryUsage,
      timestamp: new Date().toISOString()
    });

    const overallStatus = checks.every(c => c.status === 'pass') ? 'healthy' :
                         checks.some(c => c.status === 'fail') ? 'unhealthy' : 'degraded';

    res.json({
      success: true,
      overallStatus,
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.status === 'pass').length,
        warnings: checks.filter(c => c.status === 'warn').length,
        failed: checks.filter(c => c.status === 'fail').length
      }
    });
  }));

  // 系統資訊
  router.get('/info', asyncHandler(async (req, res) => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    res.json({
      success: true,
      info: {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        environment: process.env.NODE_ENV || 'development',
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptime: {
          seconds: Math.floor(process.uptime()),
          human: this.formatUptime(process.uptime())
        }
      }
    });
  }));

  // 系統指標
  router.get('/metrics', authMiddleware, asyncHandler(async (req, res) => {
    const dbManager = DatabaseManager.getInstance();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      database: {
        connected: dbManager.isConnectionActive()
      },
      webSocket: webSocketService ? {
        connections: webSocketService.getConnectionCount ? webSocketService.getConnectionCount() : 0,
        status: webSocketService.getStatus()
      } : null,
      scheduler: orderScheduler ? {
        status: orderScheduler.getStatus(),
        lastRun: orderScheduler.getLastRunTime ? orderScheduler.getLastRunTime() : null
      } : null
    };

    res.json({
      success: true,
      metrics
    });
  }));

  // 重啟服務（僅限管理員）
  router.post('/restart', authMiddleware, asyncHandler(async (req, res) => {
    // 這裡可以添加管理員權限檢查
    const { service } = req.body;

    if (service === 'scheduler' && orderScheduler) {
      try {
        orderScheduler.stop();
        orderScheduler.start();
        res.json({
          success: true,
          message: '訂單調度器已重啟'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: `重啟調度器失敗: ${error.message}`
        });
      }
    } else if (service === 'websocket' && webSocketService) {
      try {
        // WebSocket 服務重啟邏輯
        res.json({
          success: true,
          message: 'WebSocket 服務重啟請求已接收'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: `重啟 WebSocket 服務失敗: ${error.message}`
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: '不支援的服務或服務未啟用'
      });
    }
  }));

  return router;
}

// 輔助函數
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小時`);
  if (minutes > 0) parts.push(`${minutes}分鐘`);
  if (secs > 0) parts.push(`${secs}秒`);

  return parts.join(' ') || '0秒';
}