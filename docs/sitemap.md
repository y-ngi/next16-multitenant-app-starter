## 🗺️ サイト構成 & ルーティング設計 (App Router)

### ディレクトリ構造と URL マッピング

| ルートグループ | ディレクトリパス | アクセス可能 URL | アクセス権限 / 役割 |
| :--- | :--- | :--- | :--- |
| `(public)` | `src/app/(public)/*` | `/`, `/terms`, `/features` など | 未認証（誰でも閲覧可能） |
| `(auth)` | `src/app/(auth)/*` | `/login`, `/register` | 認証処理（ログイン前限定） |
| `(protected)` | `src/app/(protected)/personal/*` | `/personal/profile` など | 認証済み個人アカウント領域 |
| `(protected)` | `src/app/(protected)/org/[orgSlug]/*` | `/org/acme-corp` など | 該当組織のメンバー権限必須 |

---

### 詳細ルーティングツリー

```text
src/app/
├── (public)/                           # 1. 未認証公開エリア (URLに (public) は含まれない)
│   ├── layout.tsx                      # 一般公開用ヘッダー・フッター
│   ├── page.tsx                        # GET / (トップページ / LP)
│   ├── terms/page.tsx                  # GET /terms (利用規約・会員規約)
│   ├── privacy/page.tsx                # GET /privacy (プライバシーポリシー)
│   ├── features/                       # 特集・機能紹介
│   │   ├── page.tsx                    # GET /features
│   │   └── [slug]/page.tsx            # GET /features/[slug] (特集詳細)
│   └── contact/page.tsx                # GET /contact (お問い合わせ)
│
├── (auth)/                             # 2. 認証処理エリア (URLに (auth) は含まれない)
│   ├── layout.tsx                      # フォーム用シンプルレイアウト
│   ├── login/page.tsx                  # GET /login (ログイン画面)
│   └── register/page.tsx               # GET /register (新規会員登録)
│
└── (protected)/                        # 3. 認証済みエリア (要ログイン・Route Guard適用)
    ├── layout.tsx                      # セッション検証 & 共通コンテキストプロバイダー
    │
    ├── personal/                       # 【個人アカウント領域】 (Personal Context)
    │   ├── layout.tsx                  # 個人マイページ用レイアウト
    │   ├── profile/page.tsx            # GET /personal/profile (プロフィール・パスワード設定)
    │   ├── organizations/page.tsx      # GET /personal/organizations (所属組織一覧・新規組織作成)
    │   └── favorites/page.tsx          # GET /personal/favorites (個人お気に入り)
    │
    └── org/                            # 【組織・テナント領域】 (Organization Context)
        └── [orgSlug]/                  # 動的テナント識別子 (例: /org/acme-corp)
            ├── layout.tsx              # 組織用共通サイドバー (dashboard-05) & 組織メンバーシップ検証
            │
            ├── page.tsx                # GET /org/[orgSlug] (メインダッシュボード / dashboard-05)
            ├── members/page.tsx        # GET /org/[orgSlug]/members (組織メンバー管理)
            └── settings/page.tsx       # GET /org/[orgSlug]/settings (組織設定・契約管理)