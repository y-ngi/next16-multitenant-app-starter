# Research & Design Decisions: Organization Context

## Summary
- **Feature**: `7-organization-context`
- **Discovery Scope**: Extension（既存の組織選択 UI と認可基盤に、URL slug ベースのコンテキスト解決層を追加する）
- **Key Findings**:
  - `organization.slug` は `5-organization-foundation` のスキーマで既に一意制約付きで存在し、`createOrganization` が `trim().toLowerCase()` で正規化した値を保存している。slug 解決もこれと同じ正規化規則を使う必要がある。
  - `src/lib/organization-authz.ts` の `requireOrganizationAccess` は `organizationId` を入力に取る現行の認可ゲート。slug ベースの新エントリポイントは、この関数のロジック（認証確認 → 組織存在確認 → メンバーシップ確認 → ロール確認）を再利用しつつ、解決キーを `slug` に変えた並行関数として追加するのが最小変更。
  - `getUserOrganizations()`（`src/lib/organization-lifecycle.ts`）は `{id, name, slug, role, joinedAt}` を返し、選択 UI にそのまま使える。新規のデータ取得ロジックは不要。
  - `/dashboard` は既に `OrganizationSection` → `OrganizationList` を描画しており、組織一覧はメンバー一覧/招待管理をインライン展開するトグルボタンを持つ。`/personal/organizations` はまだ存在しない。
  - `membership` レコードは `createOrganization`（オーナー作成時）と `respondToInvitation`（承諾時）でのみ作成される。保留中・拒否済み・期限切れ・無効な招待は `membership` を生成しないため、要件3.4「承認前・拒否済み・期限切れ・無効な招待だけが存在する場合はコンテキストを表示しない」は、既存の「メンバーシップ存在確認」ロジックだけで自然に満たされる（追加ロジック不要）。
  - Next.js App Router には未認証/存在しないルートのための独自 `not-found.tsx` は現状どこにも定義されていない。`notFound()` 呼び出しに対して `src/app/org/[orgSlug]/not-found.tsx` を新設するのが標準パターン。
  - `8-organization-member-management`（後続仕様）が `/org/[orgSlug]` 配下のメンバー一覧・招待操作・ロール変更・組織削除 UI を所有すると roadmap に明記されている。したがって本仕様は `/org/[orgSlug]` に「アクセス制御 + 組織名を表示する共通ヘッダー + 最小限のコンテキスト表示」のみを実装し、メンバー一覧/招待管理 UI の移設は行わない。

## Research Log

### slug ベースの組織解決と既存認可ロジックとの統合
- **Context**: 要件2は `/org/[orgSlug]` の slug を組織コンテキストの唯一の情報源として扱うことを求める。既存の `requireOrganizationAccess` は `organizationId` 起点。
- **Sources Consulted**: `src/lib/organization-authz.ts`, `src/lib/organization-lifecycle.ts`（`createOrganization` の slug 正規化箇所）, `src/db/schema.ts`（`organization.slug` 定義）
- **Findings**:
  - `organization` テーブルは `slug` に一意インデックスを持つため、`eq(organization.slug, normalizedSlug)` で単一レコードに解決できる。
  - 認可判定（認証済み確認 → 組織存在確認 → メンバーシップ確認 → 必要ロール確認）は `requireOrganizationAccess` と同一の順序・失敗理由（`unauthenticated` / `organization-not-found` / `not-member` / `insufficient-role`）を再利用できる。
- **Implications**: `organization-authz.ts` に `requireOrganizationAccessBySlug` を追加し、内部の「メンバーシップ + ロール確認」ロジックを共通の非公開ヘルパーへ抽出して重複を避ける。戻り値には後続の共通ヘッダー描画のため `organizationName` / `organizationSlug` を含める。

### `/org/[orgSlug]` のレイアウトとページ責務分割
- **Context**: 要件2.4は「配下の全画面で共通ヘッダーに組織名を表示する」ことを求める。Next.js App Router で `layout.tsx` と `page.tsx` は同一リクエスト内で個別にレンダリングされる。
- **Sources Consulted**: Next.js App Router ドキュメント（layout/page の責務分離、`notFound()` の挙動）、既存の `src/app/dashboard/page.tsx`（保護ルートパターン）
- **Findings**:
  - `layout.tsx` は配下の全ページに共通するアクセス制御と組織名ヘッダー表示に適している。
  - `layout.tsx` と `page.tsx` は個別に `params` を受け取り、それぞれが認可解決を呼び出す必要がある（React の `cache()` で同一リクエスト内の重複 DB アクセスを避ける）。
  - `notFound()` を呼ぶと、直近の `not-found.tsx`（`src/app/org/[orgSlug]/not-found.tsx`）が使われる。
- **Implications**: `requireOrganizationAccessBySlug` の呼び出しを `React.cache()` でラップした共有ヘルパー（例: `resolveOrgContext`）を用意し、layout と page の双方から呼び出す。

### 選択 UI の配置（`/dashboard` と `/personal/organizations`）
- **Context**: 要件1は両画面で所属組織の選択肢を提示し、選択時に `/org/[orgSlug]` へ遷移させることを求める。
- **Sources Consulted**: `src/components/organization/organization-list.tsx`, `organization-section.tsx`, `src/app/dashboard/page.tsx`
- **Findings**:
  - 既存の `OrganizationList` は組織カードとメンバー一覧/招待管理のインライントグルを提供済み。これらのトグルは `6-organization-lifecycle` が所有する既存の閲覧機能であり、本仕様のスコープ外（削除も追加移設もしない）。
  - 要件1.2を満たすには、各組織カードに `/org/[slug]` へ遷移するリンクを追加するだけで十分。既存トグルと共存できる。
  - `/personal/organizations` は新規ページ。`OrganizationSection`（作成ダイアログ + 一覧）をそのまま再利用すれば、`/dashboard` と同一の選択体験を重複実装なしで提供できる。
- **Implications**: `OrganizationList` に「組織を開く」リンクを追加し、`/personal/organizations/page.tsx` を新設して認証ガード後に `OrganizationSection` を描画する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存認可モジュールの並行拡張 | `organization-authz.ts` に slug 版の関数を追加し、既存の `organizationId` 版と共存させる | 既存呼び出し元（`getOrganizationMembers` 等）への影響ゼロ、パターンの一貫性を維持 | 認可ロジックが2つのエントリポイントに分かれる | 採択方針。共通ヘルパー抽出で重複を最小化 |
| `requireOrganizationAccess` のシグネチャ変更（`organizationId \| slug`） | 既存関数の入力を拡張し1つの関数に統合 | エントリポイントが1つ | 既存呼び出し元すべての改修が必要、影響範囲が広く本仕様の境界を超える | 不採択 |

## Design Decisions

### Decision: slug 解決は新規の並行関数として追加する
- **Context**: `requireOrganizationAccess` は `organizationId` を前提に設計されており、他のモジュール（`getOrganizationMembers` など）から広く使われている。
- **Alternatives Considered**:
  1. 既存関数のシグネチャを `organizationId | slug` の union に変更する
  2. 新規に `requireOrganizationAccessBySlug` を追加し、内部ロジックを共有ヘルパーへ抽出する
- **Selected Approach**: 2を採用。`organization-authz.ts` 内に非公開の `checkMembershipAndRole(userId, organizationId, requiredRole)` を抽出し、`requireOrganizationAccess` と `requireOrganizationAccessBySlug` の双方から呼び出す。
- **Rationale**: 既存呼び出し元への影響をゼロにしつつ、認可ロジックの重複を避けられる。境界を明確に保てる。
- **Trade-offs**: エントリポイントが2つになるが、責務は明確（ID起点 vs slug起点）。
- **Follow-up**: `8-organization-member-management` がロール変更等の操作を追加する際、どちらの関数を使うかを明示する。

### Decision: `/org/[orgSlug]` は本仕様ではアクセス制御と組織名ヘッダーのみを実装する
- **Context**: roadmap で `8-organization-member-management` が `/org/[orgSlug]` 配下のメンバー管理 UI を所有すると明記されている。
- **Selected Approach**: `layout.tsx` で認可・共通ヘッダーを実装し、`page.tsx` は組織名・slug・自分のロールを表示する最小限のコンテキストページとする。既存のメンバー一覧/招待管理コンポーネントは `/dashboard` 上に据え置き、移設しない。
- **Rationale**: 要件1〜3の範囲内に留め、8番との責務境界（roadmap 明記）を尊重する。
- **Trade-offs**: `/org/[orgSlug]` の初期実装は情報量が少ないが、後続仕様で拡張される前提。

## Risks & Mitigations
- 既存の `OrganizationList` インライン展開と新規の `/org/[orgSlug]` 遷移が並存し、UX が二重に見えるリスク — 本仕様では意図的に両立させ、`8-organization-member-management` でインライン展開を `/org/[orgSlug]` 側へ統合・整理する前提とする（roadmap の依存順序どおり）。
- slug の大文字小文字や前後空白の不一致による解決失敗リスク — `createOrganization` と同じ `trim().toLowerCase()` 正規化を解決関数側にも適用して防止する。
- layout と page で認可解決処理が二重に DB アクセスするリスク — `React.cache()` でリクエスト単位にメモ化し、同一 `slug` に対する重複クエリを避ける。

## References
- 既存実装: `src/lib/organization-authz.ts`, `src/lib/organization-lifecycle.ts`, `src/db/schema.ts`
- `docs/steering/4-roadmap.md`（8番との依存・境界の明記）
