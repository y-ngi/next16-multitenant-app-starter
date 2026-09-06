FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# pnpm を有効化
RUN corepack enable && corepack prepare pnpm@latest --activate

# 作業ディレクトリの設定
WORKDIR /workspace