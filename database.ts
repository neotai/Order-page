// 模擬 mongoose 模組以進行型別驗證
interface MockMongoose {
  ConnectOptions: any;
  connect(uri: string, options?: any): Promise<void>;
  disconnect(): Promise<void>;
  connection: {
    readyState: number;
  };
}

// 創建模擬的 mongoose 物件
const mongoose: MockMongoose = {
  ConnectOptions: {},
  async connect(uri: string, options?: any): Promise<void> {
    console.log(`模擬連接到資料庫: ${uri}`, options);
  },
  async disconnect(): Promise<void> {
    console.log('模擬斷開資料庫連接');
  },
  connection: {
    readyState: 1 // 1 表示已連接
  }
};

export interface DatabaseConfig {
  uri: string;
  options: any; // 使用 any 來避免 mongoose 依賴
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async connect(config: DatabaseConfig): Promise<void> {
    try {
      await mongoose.connect(config.uri, config.options);
      this.isConnected = true;
      console.log('Database connected successfully');
    } catch (error) {
      this.isConnected = false;
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('Database disconnected successfully');
    } catch (error) {
      console.error('Database disconnection failed:', error);
      throw error;
    }
  }

  public isConnectionActive(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  public getConnectionState(): number {
    return mongoose.connection.readyState;
  }
}

export const getDefaultDatabaseConfig = (): DatabaseConfig => {
  // 模擬環境變數讀取
  const mockEnvUri = 'mongodb://localhost:27017/meal-ordering-test';
  
  return {
    uri: mockEnvUri,
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  };
};