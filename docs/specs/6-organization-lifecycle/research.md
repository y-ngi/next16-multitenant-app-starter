# Research & Design Decisions: Organization Lifecycle

## Summary
- **Feature**: `6-organization-lifecycle`
- **Discovery Scope**: Extension (organization creation, invitation lifecycle, member/org listing)
- **Key Findings**:
  - `5-organization-foundation` で追加された独自 Drizzle スキーマ (`organization`, `membership`, `organizationRole`) と認可モジュール (`requireOrganizationAccess`) をそのまま拡張・統合可能。
  - 招待管理には新規の `invitation` テーブル（`id`, `organization_id`, `email`, `role`, `token`, `status`, `inviter_id`, `expires_at`, `created_at`, `updated_at`）が必要。
  - 招待状態は `pending` / `accepted` / `rejected` / `expired` / `canceled` の5状態。
  - 未登録ユーザーの招待フローでは、招待メールからリンクを開いた際にメールアドレス固定の登録処理および登録後の自動所属を実現する。
  - 既存アカウントでのログイン時・別アカウントログイン時のミスマッチハンドリング（要件 4.4）は、招待トークン検証処理および画面リダイレクトにて解決する。

## Research Log

### 招待永続化モデルとテーブル設計
- **Context**: `owner` によるユーザー招待、有効期限（14日間）、再招待時の旧招待無効化、履歴確認を実現するためのモデル設計。
- **Sources Consulted**: `src/db/schema.ts`, Drizzle ORM Documentation, Better Auth user schema.
- **Findings**:
  - `invitation` テーブルに `token` (一意なUUID/ランダム文字列) を保持し、招待受諾リンクのキーとする。
  - `status` は Postgres Enum (`invitation_status`) で管理。
  - `expires_at` に作成から14日後のタイムスタンプを設定。
  - 同一メールアドレス・同一組織への再招待時は、既存の `pending` な `invitation` の `status` を `canceled` に更新し、新たな `invitation` レコードを生成する。
- **Implications**: `src/db/schema.ts` に `invitationStatusEnum` と `invitation` テーブルを追加する。

### 招待の承諾・拒否・未登録者登録フロー
- **Context**: 既存アカウントの承諾/拒否、および未登録ユーザーの招待メール経由でのアカウント作成と自動組織所属。
- **Sources Consulted**: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/organization-authz.ts`
- **Findings**:
  - 既存アカウント: `/invitations/accept?token=...` へアクセス。ログイン中かつメールアドレス一致なら「承諾/拒否」を選択可能。
  - 別アカウントでログイン中: 要件 4.4 に従い「他のユーザへの招待ですので、招待されたメールアドレスで再ログインしてください。」とエラーメッセージを表示し、再ログインを促す。
  - 未登録ユーザー: `/invitations/accept?token=...` を開くと未登録を検知。メールアドレスが固定（編集不可）された登録フォームを表示し、登録完了（+メール検証）後に自動で `membership` (role: `member`) を作成し `invitation` を `accepted` に変更する。
- **Implications**: 招待トークン検証 API/関数と、クライアント向け案内画面コンポーネントが必要。

### メール送信とエラーハンドリング
- **Context**: Nodemailer を利用した招待メール送信および送信失敗時の挙動。
- **Sources Consulted**: `src/lib/auth.ts` (Nodemailer transporter パターン)
- **Findings**:
  - `src/lib/invitation-mailer.ts` モジュールを作成し、SMTP経由で招待メールおよび承認通知メールを送信する。
  - メール送信が失敗した場合でも、招待レコード自体は `pending` 状態としてDBに保存・維持し、`owner` が招待履歴画面で招待先限定リンク (`/invitations/accept?token=...`) を直接取得・手動送付できるようにする (要件 5.3)。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| フルスタックモノリス統合 | `src/lib/organization-lifecycle.ts` にビジネスロジックを集約し、Server Actions / API Route から呼び出す | シンプル、既存構成（Better Auth + Drizzle）と完全合致 | 特になし | 採択方針 |

## Design Decisions

### Decision: `invitation` テーブルの追加と状態管理
- **Context**: 招待の発行、有効期限（14日）、重複時の再発行、承諾/拒否履歴の記録。
- **Selected Approach**: Drizzle スキーマに `invitation` テーブルと `invitation_status` Enum を追加。
- **Rationale**: 招待に関するビジネスルールを型安全かつ宣言的に永続化・クエリ可能にするため。

### Decision: ログインアカウント不一致時の安全なガード (要件 4.4)
- **Context**: 招待メールのリンクを別ユーザーのアカウントで開いた場合のエラー処理。
- **Selected Approach**: 招待トークンに関連付けられた `email` と現在セッションの `user.email` を照合。不一致時は操作を拒否し、メッセージ「他のユーザへの招待ですので、招待されたメールアドレスで再ログインしてください。」を表示してログアウト/再ログインへ誘導。

## Risks & Mitigations
- メール送信エラーによる招待停止リスク — 送信エラーが発生しても招待データは保存し、画面上にエラーを表示しつつ限定リンクの直接コピーを可能にする（要件 5.3）。
- 招待トークンの不正利用・漏洩リスク — トークンは一意かつランダムな文字列（UUID v4等）を使用し、有効期限（14日）と使用済み・キャンセル状態のチェックをサーバー側で厳格に実施。
