# Node.js 18 Alpine Linux ベースイメージを使用
FROM node:18-alpine

# 作業ディレクトリを設定
WORKDIR /app

# 日本語フォントとPuppeteerの依存関係をインストール
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
    musl-locales \
    && rm -rf /var/cache/apk/*

# 日本語ロケールを生成
RUN locale-gen ja_JP.UTF-8

# 環境変数を設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8 \
    LC_LANG=ja_JP.UTF-8

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production

# アプリケーションのソースコードをコピー
COPY src/ ./src/

# 非rootユーザーを作成（セキュリティ向上）
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# アプリケーションディレクトリの所有者を変更
RUN chown -R nodejs:nodejs /app

# 非rootユーザーに切り替え
USER nodejs

# ポート3000を公開
EXPOSE 3000

# ヘルスチェックを設定
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# アプリケーションを起動
CMD ["node", "src/app.js"] 