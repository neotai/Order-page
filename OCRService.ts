import { ImageAnnotatorClient } from '@google-cloud/vision';
import { OCRProcessingResult, DetectedMenuItem } from '../types/menu';

export interface OCRService {
  processImage(imageBuffer: Buffer): Promise<OCRProcessingResult>;
  processImageFromUrl(imageUrl: string): Promise<OCRProcessingResult>;
  parseMenuText(text: string): DetectedMenuItem[];
}

export class GoogleVisionOCRService implements OCRService {
  private client: ImageAnnotatorClient;

  constructor() {
    // 初始化 Google Vision API 客戶端
    // 需要設定 GOOGLE_APPLICATION_CREDENTIALS 環境變數或提供服務帳戶金鑰
    this.client = new ImageAnnotatorClient();
  }

  async processImage(imageBuffer: Buffer): Promise<OCRProcessingResult> {
    try {
      // 使用 Google Vision API 進行文字偵測
      const [result] = await this.client.textDetection({
        image: { content: imageBuffer }
      });

      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        return {
          success: false,
          confidence: 0,
          error: 'No text detected in image'
        };
      }

      // 第一個元素包含完整的偵測文字
      const fullText = detections[0].description || '';
      
      // 解析菜單項目
      const detectedItems = this.parseMenuText(fullText);
      
      // 計算整體信心度（基於偵測到的項目數量和文字清晰度）
      const confidence = this.calculateConfidence(detections, detectedItems);

      return {
        success: true,
        extractedText: fullText,
        detectedItems,
        confidence
      };

    } catch (error) {
      console.error('OCR processing error:', error);
      return {
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown OCR error'
      };
    }
  }

  async processImageFromUrl(imageUrl: string): Promise<OCRProcessingResult> {
    try {
      // 從 URL 下載圖片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      return this.processImage(imageBuffer);

    } catch (error) {
      console.error('Error processing image from URL:', error);
      return {
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Failed to process image from URL'
      };
    }
  }

  parseMenuText(text: string): DetectedMenuItem[] {
    const items: DetectedMenuItem[] = [];
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      const item = this.parseMenuLine(line);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  private parseMenuLine(line: string): DetectedMenuItem | null {
    // 移除多餘的空白字符
    const cleanLine = line.trim();
    
    // 常見的菜單項目格式模式
    const patterns = [
      // 格式: "菜名 $價格" 或 "菜名 NT$價格"
      /^(.+?)\s+(?:NT\$|\$|￥|元)\s*(\d+(?:\.\d{2})?)$/,
      // 格式: "菜名 價格元" 或 "菜名 價格"
      /^(.+?)\s+(\d+(?:\.\d{2})?)\s*(?:元|塊)?$/,
      // 格式: "$價格 菜名" 
      /^(?:NT\$|\$|￥)\s*(\d+(?:\.\d{2})?)\s+(.+)$/,
      // 格式: "價格元 菜名"
      /^(\d+(?:\.\d{2})?)\s*(?:元|塊)?\s+(.+)$/
    ];

    for (const pattern of patterns) {
      const match = cleanLine.match(pattern);
      if (match) {
        let name: string;
        let priceStr: string;

        if (pattern.source.startsWith('^(.+?)')) {
          // 菜名在前，價格在後
          name = match[1].trim();
          priceStr = match[2];
        } else {
          // 價格在前，菜名在後
          priceStr = match[1];
          name = match[2].trim();
        }

        const price = parseFloat(priceStr);
        
        // 驗證解析結果
        if (this.isValidMenuItem(name, price)) {
          return {
            name,
            price,
            confidence: this.calculateItemConfidence(cleanLine, name, price),
            description: this.extractDescription(name)
          };
        }
      }
    }

    return null;
  }

  private isValidMenuItem(name: string, price: number): boolean {
    // 檢查菜名是否合理（長度、字符等）
    if (name.length < 2 || name.length > 50) return false;
    
    // 檢查價格是否合理
    if (isNaN(price) || price <= 0 || price > 10000) return false;
    
    // 排除明顯不是菜名的文字
    const invalidPatterns = [
      /^[\d\s\$￥元]+$/, // 只有數字和貨幣符號
      /^[^\u4e00-\u9fff\w\s]+$/, // 只有特殊符號
      /營業時間|電話|地址|TEL|ADD/i // 常見的非菜單文字
    ];

    return !invalidPatterns.some(pattern => pattern.test(name));
  }

  private extractDescription(name: string): string | undefined {
    // 嘗試從菜名中提取描述信息
    const descriptionPatterns = [
      /\(([^)]+)\)/, // 括號內的描述
      /（([^）]+)）/, // 中文括號內的描述
      /\[([^\]]+)\]/, // 方括號內的描述
    ];

    for (const pattern of descriptionPatterns) {
      const match = name.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  private calculateItemConfidence(originalLine: string, name: string, price: number): number {
    let confidence = 0.5; // 基礎信心度

    // 根據格式規整度調整信心度
    if (originalLine.includes('$') || originalLine.includes('￥') || originalLine.includes('元')) {
      confidence += 0.2;
    }

    // 根據菜名合理性調整
    if (name.length >= 3 && name.length <= 20) {
      confidence += 0.1;
    }

    // 根據價格合理性調整
    if (price >= 10 && price <= 1000) {
      confidence += 0.1;
    }

    // 根據中文字符比例調整（假設是中文菜單）
    const chineseCharCount = (name.match(/[\u4e00-\u9fff]/g) || []).length;
    const chineseRatio = chineseCharCount / name.length;
    if (chineseRatio > 0.5) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private calculateConfidence(detections: any[], detectedItems: DetectedMenuItem[]): number {
    if (detectedItems.length === 0) return 0;

    // 基於偵測到的項目信心度計算整體信心度
    const itemConfidences = detectedItems.map(item => item.confidence);
    const avgItemConfidence = itemConfidences.reduce((sum, conf) => sum + conf, 0) / itemConfidences.length;

    // 基於文字偵測品質調整
    let textQualityBonus = 0;
    if (detections.length > 1) {
      // 有多個文字區塊被偵測到，通常表示圖片品質較好
      textQualityBonus = 0.1;
    }

    // 基於偵測到的項目數量調整
    let itemCountBonus = 0;
    if (detectedItems.length >= 3) {
      itemCountBonus = 0.1;
    } else if (detectedItems.length >= 5) {
      itemCountBonus = 0.2;
    }

    return Math.min(avgItemConfidence + textQualityBonus + itemCountBonus, 1.0);
  }
}

// 用於測試和開發的模擬 OCR 服務
export class MockOCRService implements OCRService {
  async processImage(imageBuffer: Buffer): Promise<OCRProcessingResult> {
    // 模擬處理時間
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      extractedText: "模擬 OCR 結果：\n牛肉麵 $120\n雞肉飯 $80\n滷肉飯 $60\n炸雞腿便當 $100\n素食便當 $70",
      detectedItems: [
        {
          name: "牛肉麵",
          price: 120,
          confidence: 0.95
        },
        {
          name: "雞肉飯",
          price: 80,
          confidence: 0.90
        },
        {
          name: "滷肉飯",
          price: 60,
          confidence: 0.88
        },
        {
          name: "炸雞腿便當",
          price: 100,
          confidence: 0.92
        },
        {
          name: "素食便當",
          price: 70,
          confidence: 0.85
        }
      ],
      confidence: 0.90
    };
  }

  async processImageFromUrl(imageUrl: string): Promise<OCRProcessingResult> {
    return this.processImage(Buffer.from('mock'));
  }

  parseMenuText(text: string): DetectedMenuItem[] {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const items: DetectedMenuItem[] = [];

    for (const line of lines) {
      // 簡單的模擬解析
      const match = line.match(/^(.+?)\s+\$(\d+)$/);
      if (match) {
        items.push({
          name: match[1],
          price: parseInt(match[2]),
          confidence: 0.9
        });
      }
    }

    return items;
  }
}