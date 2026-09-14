# プロジェクト構成

## 構成方針

Next.js App Router をアプリケーションの入口にし、画面・再利用 UI・認証などの共通ロジック・永続化を `src` 配下で責務ごとに分離する。画面はルーティングに近い `app` に置き、複数画面で使う UI は `components` に置く。

## ディレクトリパターン

### App Router
**配置**: `src/app/`  
**役割**: レイアウト、ページ、グローバルスタイル、および URL に対応する画面を定義する。  
**例**: `src/app/dashboard/personal/page.tsx` でサーバー側にセッションを取得し、未認証時はログイン画面へ遷移させる。

### コンポーネント
**配置**: `src/components/`  
**役割**: アプリケーション固有の複合 UI と、再利用可能な UI プリミティブを分けて置く。  
**例**: `src/components/auth-form.tsx` は画面機能用、`src/components/ui/button.tsx` は shadcn/ui ベースのプリミティブ。

### 共通ロジック
**配置**: `src/lib/` と `src/hooks/`  
**役割**: 認証クライアント／サーバー設定、ユーティリティ、再利用可能なクライアント Hooks を置く。  
**例**: Better Auth のサーバー設定は `src/lib/auth.ts`、クライアント設定は `src/lib/auth-client.ts`。

### 永続化
**配置**: `src/db/`  
**役割**: Drizzle の接続、スキーマ、シードを集約し、データベース固有の実装を UI から分離する。  
**例**: テーブル定義は `schema.ts`、初期データは `seed.ts`。

### テスト
**配置**: 実装に隣接する `*.test.ts(x)` と `tests/`  
**役割**: 実装に密接な単体・コンポーネントテストはソースと同居させ、共有セットアップやサンプルは `tests/` に置く。

## 命名規則

- **React コンポーネント**: ファイル名は kebab-case、エクスポートするコンポーネント名は PascalCase。
- **Hooks**: `use-` 接頭辞の kebab-case ファイル名と `use` 接頭辞の camelCase 関数名。
- **ルート**: App Router の規約に従い、画面は `page.tsx`、共通レイアウトは `layout.tsx` とする。
- **テスト**: 対象に `.test.ts` または `.test.tsx` を付ける。

## インポート規約

アプリケーション内のモジュールには `@/`（`src/` に対応）を使い、同じ機能内の近接モジュールに限って相対パスを使う。

```ts
import { auth } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { localHelper } from './local-helper';
```

## コード配置の原則

- サーバー専用の認証・DB 操作はページまたは `lib`／`db` 側に留め、クライアント UI に永続化の詳細を持ち込まない。
- `components/ui/` は共有プリミティブとして保ち、ドメイン固有の振る舞いは `components/` または画面側に置く。
- 新しい機能は、画面・UI・共通ロジック・データアクセスの責務を混在させず、既存の配置パターンに従う。

---
_ファイルツリーの網羅ではなく、新しいコードの置き場所を判断する規約を記録する。_
