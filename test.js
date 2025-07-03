const http = require('http');

// テスト用のURL
const testUrl = 'https://example.com';
const baseUrl = 'http://localhost:3000';

// ヘルスチェックテスト
function testHealthCheck() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ ヘルスチェック: 成功');
          resolve();
        } else {
          console.log('❌ ヘルスチェック: 失敗', res.statusCode);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.log('❌ ヘルスチェック: エラー', err.message);
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('タイムアウト'));
    });
  });
}

// スクリーンショットAPIテスト
function testScreenshot() {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/api/screenshot?url=${encodeURIComponent(testUrl)}&width=800&height=600&format=jpeg`;

    const req = http.get(url, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ スクリーンショット生成: 成功');
        console.log(`📊 レスポンスサイズ: ${res.headers['content-length']} bytes`);
        console.log(`🎨 コンテンツタイプ: ${res.headers['content-type']}`);
        resolve();
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('❌ スクリーンショット生成: 失敗', res.statusCode);
          console.log('エラーレスポンス:', data);
          reject(new Error(`HTTP ${res.statusCode}`));
        });
      }
    });

    req.on('error', (err) => {
      console.log('❌ スクリーンショット生成: エラー', err.message);
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('タイムアウト'));
    });
  });
}

// エラーハンドリングテスト
function testErrorHandling() {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/api/screenshot`; // URLパラメータなし

    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 400) {
          console.log('✅ エラーハンドリング: 成功（URLパラメータなし）');
          resolve();
        } else {
          console.log('❌ エラーハンドリング: 予期しないステータスコード', res.statusCode);
          reject(new Error(`予期しないステータスコード: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.log('❌ エラーハンドリング: エラー', err.message);
      reject(err);
    });
  });
}

// メイン実行関数
async function runTests() {
  console.log('🧪 APIテストを開始します...\n');

  try {
    await testHealthCheck();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機

    await testScreenshot();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機

    await testErrorHandling();

    console.log('\n🎉 すべてのテストが成功しました！');
  } catch (error) {
    console.log('\n💥 テストが失敗しました:', error.message);
    process.exit(1);
  }
}

// サーバーが起動しているかチェックしてからテスト実行
console.log('🚀 サーバーの起動を確認中...');
setTimeout(() => {
  runTests();
}, 2000); 