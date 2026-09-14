## 🗺️ サイト構成 & ルーティング設計 (App Router)

> 2026-09-13 更新: 認証済みエリアの共通プレフィックスとして、ルートグループ（URLに現れない）ではなく明示的な `/dashboard` を採用する方針に変更した（`docs/specs/7-organization-context/research.md` の Design Decision 参照）。個人アカウント領域は `/dashboard/personal/*`、組織領域は `/dashboard/org/[orgSlug]/*` に配置する。公開ページ（`/terms`, `/privacy`, `/ip/[ipName]` など）と、組織の公開プロフィールページ（`/org/[orgSlug]`、認証不要）は将来構想として記載するが、現行の roadmap（組織管理・認可基盤）のスコープ外であり未着手。

### ディレクトリ構造と URL マッピング

| ルートグループ | ディレクトリパス | アクセス可能 URL | アクセス権限 / 役割 |
| :--- | :--- | :--- | :--- |
| `(public)` | `src/app/(public)/*` | `/`, `/terms`, `/privacy`, `/ip/[ipName]`, `/org/[orgSlug]`（公開プロフィール） | 未認証（誰でも閲覧可能）。**未着手（スコープ外）** |
| `(auth)` | `src/app/(auth)/*` | `/login` など | 認証処理（ログイン前限定）。現行実装は `/login`（`?mode=signup` でサインアップ兼用） |
| 認証済みエリア | `src/app/dashboard/personal/*` | `/dashboard/personal`, `/dashboard/personal/organizations` など | 認証済み個人アカウント領域 |
| 認証済みエリア | `src/app/dashboard/org/[orgSlug]/*` | `/dashboard/org/acme-corp` など | 該当組織のメンバー権限必須 |

---

### 詳細ルーティングツリー（現行方針）

```text
src/app/
├── (public)/                           # 未着手（スコープ外・将来構想）
│   ├── page.tsx                        # GET / (トップページ / LP)
│   ├── terms/page.tsx                  # GET /terms
│   ├── privacy/page.tsx                # GET /privacy
│   ├── ip/[ipName]/page.tsx            # GET /ip/[ipName]
│   └── org/[orgSlug]/page.tsx          # GET /org/[orgSlug] (組織の公開プロフィール、認証不要)
│
├── login/                              # 認証処理エリア
│   └── page.tsx                        # GET /login (ログイン / ?mode=signup でサインアップ兼用)
│
└── dashboard/                          # 認証済みエリア (要ログイン・Route Guard適用)
    │
    ├── personal/                       # 【個人アカウント領域】 (Personal Context)
    │   ├── page.tsx                    # GET /dashboard/personal (マイページTOP。旧 /dashboard)
    │   └── organizations/
    │       └── page.tsx                # GET /dashboard/personal/organizations (所属組織一覧・選択)
    │
    └── org/                            # 【組織・テナント領域】 (Organization Context)
        └── [orgSlug]/                  # 動的テナント識別子 (例: /dashboard/org/acme-corp)
            ├── layout.tsx              # 組織コンテキストの認可ガード & 共通ヘッダー（組織名表示）
            ├── page.tsx                # GET /dashboard/org/[orgSlug] (組織コンテキストTOP)
            └── members/page.tsx        # GET /dashboard/org/[orgSlug]/members (組織メンバー管理、8-organization-member-management で実装)
```

### 補足

- `(public)` 領域（`/terms`, `/privacy`, `/ip/[ipName]`, 組織の公開プロフィールページ）は、現行 roadmap（組織管理・認可基盤）のスコープ外。将来のマーケティング/公開ページ仕様で別途着手する。
- `(auth)` 領域は現行実装では `/login` の単一ページで、クエリパラメータ `?mode=signup` によりログイン/サインアップの両方を提供する（`/register` の独立ページは設けていない）。
- 認証済みエリアは、Next.js のルートグループ（URLに現れない `(protected)`）ではなく、明示的な `/dashboard` パスプレフィックスを採用する。個人領域とテナント（組織）領域を同じ認証済みプレフィックス配下に配置する。
