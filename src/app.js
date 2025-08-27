const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// キャッシュファイル名を生成（URL + パラメータ + 日付）
const generateCacheFileName = (url, width, height, format) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const params = `${width}x${height}.${format}`;
  const hash = crypto.createHash('md5').update(url + params).digest('hex');
  return `${today}_${hash}.${format}`;
};

// キャッシュファイルの存在確認
const checkCacheExists = async (fileName) => {
  try {
    const filePath = path.join(CACHE_DIR, fileName);
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
};

// 古いキャッシュファイルを削除
const cleanupOldCache = async () => {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const today = new Date().toISOString().split('T')[0];
    
    for (const file of files) {
      const fileDate = file.split('_')[0];
      if (fileDate !== today) {
        await fs.unlink(path.join(CACHE_DIR, file));
      }
    }
  } catch (error) {
    console.error('キャッシュクリーンアップエラー:', error);
  }
};

// セキュリティミドルウェア
app.use(helmet());
app.use(cors());
app.use(express.json());

let browser;
// レート制限の設定
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // IPアドレスごとに15分間に最大100リクエスト
  message: {
    error: 'リクエストが多すぎます。しばらく時間をおいてから再試行してください。'
  }
});
app.use('/', limiter);

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'サービスは正常に動作しています' });
});

// スクリーンショット生成エンドポイント
app.get('/', async (req, res) => {
  try {
    const { url, width = 800, height = 600, format = 'jpeg' } = req.query;
    // URLパラメータの検証
    if (!url) {
      return res.status(400).json({
        error: 'URLパラメータが必須です',
        message: 'URLパラメータを指定してください'
      });
    }

    // URLの形式を検証
    let targetUrl;
    try {
      targetUrl = new URL(url);
    } catch (error) {
      return res.status(400).json({
        error: '無効なURLです',
        message: '正しいURL形式で指定してください'
      });
    }

    // 幅と高さの検証
    const validWidth = Math.max(100, Math.min(2000, parseInt(width)));
    const validHeight = Math.max(100, Math.min(2000, parseInt(height)));

    // フォーマットの検証
    const validFormats = ['jpeg', 'png', 'webp'];
    const validFormat = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'jpeg';

    // キャッシュファイル名を生成
    const cacheFileName = generateCacheFileName(targetUrl.href, validWidth, validHeight, validFormat);
    
    // キャッシュファイルの存在確認
    const cachedFilePath = await checkCacheExists(cacheFileName);
    
    if (cachedFilePath) {
      console.log(`キャッシュからファイルを返却: ${cacheFileName}`);
      
      // キャッシュファイルを返却
      const cachedImage = await fs.readFile(cachedFilePath);
      res.setHeader('Content-Type', `image/${validFormat}`);
      res.setHeader('Content-Disposition', `inline; filename="screenshot.${validFormat}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24時間キャッシュ
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedImage);
    }

    console.log(`スクリーンショット生成開始: ${targetUrl.href}, サイズ: ${validWidth}x${validHeight}, フォーマット: ${validFormat}`);
    
    if (!browser || !browser.connected) {
      // Puppeteerでブラウザを起動
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--lang=ja,ja-JP,en',
          '--accept-lang=ja,ja-JP;q=0.9,en;q=0.8'
        ]
      });
    }
    const context = await browser.createIncognitoBrowserContext();
    const page = await browser.newPage();

    // ビューポートを設定
    await page.setViewport({
      width: validWidth,
      height: validHeight,
      deviceScaleFactor: 1
    });

    // 日本語フォントとロケールの設定
    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = `
        body, * {
          font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Noto Sans', 'TakaoPGothic', 'IPAPGothic', 'VL PGothic', 'Meiryo', 'sans-serif' !important;
        }
        html {
          lang: 'ja' !important;
        }
      `;
      document.head.appendChild(style);

      // 言語設定を強制的に日本語に
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ja', 'ja-JP', 'en']
      });

      Object.defineProperty(navigator, 'language', {
        get: () => 'ja'
      });

      // Accept-Languageヘッダーを設定
      Object.defineProperty(navigator, 'userAgent', {
        get: () => navigator.userAgent + ' Accept-Language: ja,ja-JP;q=0.9,en;q=0.8'
      });
    });

    // Accept-Languageヘッダーを設定
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja,ja-JP;q=0.9,en;q=0.8'
    });

    // ページにアクセス
    await page.goto(targetUrl.href, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // ページが完全に読み込まれるまで少し待機
    await page.waitForTimeout(2000);

    // スクリーンショットを取得
    const screenshot = await page.screenshot({
      type: validFormat,
      quality: validFormat === 'jpeg' ? 90 : undefined,
      fullPage: false
    });


    // キャッシュファイルに保存
    const cacheFilePath = path.join(CACHE_DIR, cacheFileName);
    await fs.writeFile(cacheFilePath, screenshot);
    
    console.log(`スクリーンショットをキャッシュに保存: ${cacheFileName}`);

    // レスポンスヘッダーを設定
    res.setHeader('Content-Type', `image/${validFormat}`);
    res.setHeader('Content-Disposition', `inline; filename="screenshot.${validFormat}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24時間キャッシュ
    res.setHeader('X-Cache', 'MISS');

    // 画像を返却
    res.send(screenshot);

    console.log(`スクリーンショット生成完了: ${targetUrl.href}`);

    // puppeteerのキャッシュをクリア
    await page.close();
    await context.close();
  } catch (error) {
    console.error('スクリーンショット生成エラー:', error);

    res.status(500).json({
      error: 'スクリーンショットの生成に失敗しました',
      message: error.message
    });
  }
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('アプリケーションエラー:', err);
  res.status(500).json({
    error: 'サーバー内部エラーが発生しました',
    message: 'しばらく時間をおいてから再試行してください'
  });
});

// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({
    error: 'エンドポイントが見つかりません',
    message: '正しいURLを指定してください'
  });
});

// サーバー起動
app.listen(PORT, async () => {
  console.log(`🚀 サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📸 スクリーンショットAPI: http://localhost:${PORT}`);
  console.log(`💚 ヘルスチェック: http://localhost:${PORT}/health`);
  
  // 起動時に古いキャッシュファイルを削除
  await cleanupOldCache();
  console.log(`🗑️  古いキャッシュファイルを削除しました`);
});

module.exports = app; 