これまでの全ての修正・調整を反映した、完成版の **Dev Container 環境構築手順書** です。

---

# Dev Container（Node.js 24 + PostgreSQL 16 + Mailpit）構築手順

本手順は、WSL2（Ubuntu）上のネイティブ Docker Engine 環境において、VS Code の開発コンテナ拡張機能を用いて開発環境をゼロから構築・起動するための手順です。

---

## 1. ディレクトリ構成

プロジェクト直下に `.devcontainer` フォルダを作成し、以下の構成でファイルを配置します。

```text
next16-multitenant-app-starter/
└── .devcontainer/
    ├── Dockerfile
    ├── docker-compose.yml
    └── devcontainer.json

```

---

## 2. 設定ファイルの配置

### ① `.devcontainer/Dockerfile`

```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# pnpm を有効化
RUN corepack enable && corepack prepare pnpm@latest --activate

# 作業ディレクトリの設定
WORKDIR /workspace

```

### ② `.devcontainer/docker-compose.yml`

```yaml
name: next16-starter

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ..:/workspace:cached
    command: sleep infinity
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgres://postgres:postgres_password@db:5432/app_db"
      SMTP_HOST: "mailpit"
      SMTP_PORT: "1025"

  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_password
      POSTGRES_DB: app_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  mailpit:
    image: axllent/mailpit:latest
    restart: always
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_data:
    name: next16-starter-postgres-data

```

### ③ `.devcontainer/devcontainer.json`

```json
{
  "name": "Next.js 16 Multitenant Starter",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached",
  "containerEnv": {
    "WAYLAND_DISPLAY": "",
    "DISPLAY": ""
  },
  "customizations": {
    "vscode": {
      "settings": {
        "dev.containers.mountWaylandSocket": false
      },
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "mtxr.sqltools",
        "mtxr.sqltools-driver-pg"
      ]
    }
  },
  "forwardPorts": [3000, 5432, 8025],
  "postCreateCommand": "cp -n .env.example .env.local || true && pnpm --version"
}

```

---

## 3. コンテナの起動手順

1. **VS Code を WSL 接続で開く:** WSL ターミナル.
WSL2 (Ubuntu) のターミナルを開き、プロジェクトルートから直接 VS Code を起動します。

```bash
cd /home/y-ngi/work/next16-multitenant-app-starter
code .

```

画面左下のステータスバーが `WSL: Ubuntu-24.04` と表示されていることを確認します。


2. **開発コンテナを起動する:** VS Code.
1. リモートエクスプローラーの「開発コンテナ」エリアにある **`+`（開発コンテナを作成するアクションを選択する）** アイコンをクリックします（または `Ctrl + Shift + P` を押します）。
2. リストから **「コンテナで現在のフォルダーを開く」** を選択します。


3. **起動完了の確認:** VS Code.
ビルドおよびコンテナ群の立ち上げが自動実行されます。画面左下のステータスバーが **`Dev Container: Next.js 16 Multitenant Starter`** に変われば接続完了です。


---

## 4. 動作確認

VS Code 内のターミナル（`Ctrl + Shift + ~`）を開き、各環境の疎通を確認します。

```bash
# Node.js 24 の確認
node -v

# pnpm の確認
pnpm -v

# DB（PostgreSQL）へのネットワーク導通確認（Node.jsワンライナー）
node -e "require('net').connect(5432, 'db').on('connect', () => console.log('DB Connection Successful!')).on('error', (e) => console.error(e))"

```

ブラウザで `http://localhost:8025` にアクセスし、Mailpit の画面が表示されれば開発環境の構築はすべて完了です。