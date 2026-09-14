# Research & Design Decisions

## Summary
- **Feature**: `8-organization-member-management`
- **Discovery Scope**: Extension（既存の組織・招待・組織コンテキスト基盤への拡張）
- **Key Findings**:
  - `organization-lifecycle.ts` の `getOrganizationMembers` は既にメール アドレスを無条件に全メンバーへ返しており、Requirement 1.1/1.2 のロール別可視性を満たしていない。既存関数は変更せず、本機能側で閲覧者ロールに応じてメールアドレスを除去するラッパーを追加する。
  - `organization` / `invitation` テーブルの外部キーは既に `onDelete: 'cascade'` で `membership`・`invitation` を参照しているため、組織削除は `organization` 行の削除のみで Requirement 5.1（メンバーシップ・未受諾招待の一括削除）を満たせる。
  - `/dashboard/org/[orgSlug]/layout.tsx`（spec 7）は所属済みメンバーのみアクセスを許可する門番として既に機能しており、本機能はその内側にルートを追加するだけでよい。ロール別の追加ガード（owner 限定操作）は本機能が新たに実装する。
  - `requireOrganizationAccessBySlug` はロール要求パラメータ (`requiredRole`) を既にサポートしており、owner 限定操作の認可はこの関数を `requiredRole: 'owner'` で呼び出すだけで実現できる。追加の認可ヘルパーは不要。

## Research Log

### 既存メンバー閲覧・招待機能の棚卸し
- **Context**: spec 6（organization-lifecycle）で `member-list.tsx` / `invitation-manager.tsx` / `getOrganizationMembers` / `getInvitations` / `createInvitationAction` が既に実装されているが、どの画面にも配線されていない（未使用コンポーネント）。本機能がこれらを配線し直すか置き換えるかを判断する必要がある。
- **Sources Consulted**: `src/components/organization/member-list.tsx`, `src/components/organization/invitation-manager.tsx`, `src/lib/organization-lifecycle.ts`, `src/app/actions/organization.ts`
- **Findings**:
  - `member-list.tsx` は `userEmail: string`（必須）を前提としており、ロール別非表示に対応していない。
  - `invitation-manager.tsx` は招待作成・招待履歴閲覧のみを提供し、削除（キャンセル）ボタンがない。
  - どちらのコンポーネントも `organizationId` を props で受け取る設計であり、`/dashboard/org/[orgSlug]` 配下から `resolveOrgContext` で解決した `organizationId` を渡せば再利用できる。
- **Implications**: 既存コンポーネントは配線し直した上で、(a) メール表示をロール条件付きにする、(b) owner 向けに削除・ロール変更・招待キャンセル操作を追加する形で拡張する。新規に作り直すよりも、既存の型・データ取得パターンを踏襲した方が一貫性が高い。

### 組織削除のカスケード範囲確認
- **Context**: Requirement 5.1 は「組織、全メンバーシップ、全未受諾招待を削除する」ことを求める。実装が複数テーブルを個別に削除するトランザクションを必要とするか確認する。
- **Sources Consulted**: `src/db/schema.ts`（`membership`, `invitation` の `references(() => organization.id, { onDelete: 'cascade' })`）
- **Findings**: `membership` と `invitation` は両方とも `organization.id` に対して `onDelete: 'cascade'` を宣言済み。PostgreSQL 側で `organization` 行の削除時に自動的に関連行が削除される。
- **Implications**: アプリケーション層で個別削除を実装する必要はない。`organization` 行の削除 1 回（認可チェック後）で要件を満たせる。既受諾・未受諾を問わず全招待が削除される点は「全未受諾招待」という要件文言と整合する（受諾済み招待は既に `membership` に反映済みであり、招待レコード自体の削除は履歴喪失のみで機能上の問題はない）。

### 唯一の owner 保護ロジックの共通化
- **Context**: Requirement 2.5（ロール変更・削除で owner 0人化を禁止）、3.3（唯一の owner の脱退禁止）、4.2（唯一の owner の自己降格禁止）は同じ不変条件（対象組織の owner 数は常に1以上）を異なるトリガーから検証する。
- **Sources Consulted**: 要件書 Requirement 2, 3, 4
- **Findings**: 3つの要件はすべて「操作後に owner 数が0になるか」を判定する同一のガード関数で表現できる（対象操作: メンバー削除、ロール変更、自己脱退、自己降格）。
- **Implications**: 設計では単一の内部ガード（owner 数を数え、対象操作後に0になるなら拒否）を全ミューテーション関数から共有する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 新規サービスモジュールに集約 | `organization-member-management.ts` に全ミューテーション（削除・ロール変更・招待キャンセル・脱退・組織削除）を集約し、既存の `organization-lifecycle.ts` は変更しない | 既存スペックの境界を侵食しない、責務が明確 | 認可チェックのコードが `organization-lifecycle.ts` と類似する（許容範囲） | 採用 |
| `organization-lifecycle.ts` に追記 | 既存ファイルにミューテーション関数を追加 | 招待関連の型を再利用しやすい | spec 6 の所有物に spec 8 の責務が混在し、境界が曖昧になる | 却下 |

## Design Decisions

### Decision: メンバー一覧のメールアドレス可視性はラッパー関数で制御する
- **Context**: 既存 `getOrganizationMembers`（spec 6 所有）はロールに関わらずメールアドレスを返す。Requirement 1.1/1.2 はロールに応じた出し分けを要求する。
- **Alternatives Considered**:
  1. `getOrganizationMembers` 自体を変更し、呼び出し元に viewerRole を渡させる
  2. spec 8 側で結果を受け取ってから viewerRole に応じてメールを除去するラッパーを追加する
- **Selected Approach**: 2を採用。`organization-member-management.ts` に `listMembersForViewer` を実装し、内部で `getOrganizationMembers` を呼び出した後、viewerRole が `owner` でなければ各メンバーの `userEmail` を除去する。
- **Rationale**: spec 6 のファイル・関数シグネチャを変更せず、責務境界（メンバー情報の可視性制御は本スペックの Requirement 1）を明確に保てる。
- **Trade-offs**: DB からは常に email を取得してからサーバー側でフィルタするため、わずかに無駄なデータ取得が発生するが、権限外への漏洩は発生しない（サーバー応答自体に含まれない）。
- **Follow-up**: 将来的に `getOrganizationMembers` 自体を非推奨にし、`listMembersForViewer` に統合するかは spec 6 側の再評価対象とする（本スペックでは実施しない）。

### Decision: owner 最小数保護は共有ガード関数で実装する
- **Context**: 3つの異なる要件（2.5, 3.3, 4.2）が同一不変条件を検証する。
- **Alternatives Considered**:
  1. 各ミューテーション関数内に重複したカウントロジックを書く
  2. 共有の内部ガード関数 `ensureOwnerRemainsAfterChange` を1つ実装し、全ミューテーション関数から呼び出す
- **Selected Approach**: 2を採用。
- **Rationale**: 不変条件が1箇所に定義されるため、将来のロール仕様変更（例: owner 以外のロール追加）時の修正箇所を最小化できる。
- **Trade-offs**: 抽象化のための1段階の関数呼び出しが増えるが、可読性・保守性への影響は軽微。

### Decision: owner 数の同時実行安全性は `SELECT ... FOR UPDATE` による行ロックで担保する
- **Context**: `/kiro-validate-design` の初回レビューで、単純な「カウント→更新」方式では、2人の owner が同時に互いを降格・削除しようとした場合に PostgreSQL のデフォルト分離レベル（Read Committed）下で owner が0人になり得る（Critical Issue として指摘）。
- **Alternatives Considered**:
  1. 分離レベルを `SERIALIZABLE` に引き上げ、シリアライズ失敗時にアプリケーション側でリトライする
  2. 対象組織の `membership` 行を `SELECT ... FOR UPDATE` で明示的に行ロックしてから owner 数を判定し、同一トランザクション内で更新を確定させる
- **Selected Approach**: 2を採用。
- **Rationale**: `SERIALIZABLE` はDB全体の分離レベル変更とリトライロジックの実装コストが高く、本機能が必要とするのは「対象組織内の owner 数」という単一の集約に閉じた整合性のみである。行ロックは対象範囲を組織単位に限定でき、既存の `db.transaction`（Drizzle）パターンをそのまま拡張できる。
- **Trade-offs**: 同一組織に対する同時操作はロック待ちにより直列化されるため、極端に頻繁な同時操作がある場合はレイテンシが増加するが、組織あたりの管理操作頻度は低いと想定されるため許容する。
- **Follow-up**: 実装は生SQL実行 (`tx.execute(sql`...`)`) ではなく、Drizzle 標準クエリビルダーの `.for('update')` 節（`db.select(...).from(...).where(...).for('update')`）を用いる。`docs/steering/tech.md` が「明示的な標準クエリビルダーを使用する」ことを規約化しているため（`/kiro-validate-design` 2回目のレビューで指摘）、生SQL実行は避ける。

### Decision: owner 数の同時実行テストはモックDBでの呼び出し順序検証に留める（実DB統合テストは対象外）
- **Context**: `/kiro-validate-design` 2回目のレビューで、Testing Strategy が「既存のDB統合テスト方式」を前提としていたが、実際には本リポジトリの全テスト（`organization-lifecycle.test.ts` を含む）は `vi.mock('@/db', ...)` によって DB を完全にモック化しており、実DB接続・行ロックを検証する統合テスト基盤が存在しないことが判明した。
- **Alternatives Considered**:
  1. 新規に実DB統合テスト基盤（testcontainers 等）を本スペックで導入する
  2. モック化した `db` に対して、ロック取得（`.for('update')`）が更新処理より先に呼ばれることを呼び出し順序・引数で検証する静的テストに留める
- **Selected Approach**: 2を採用。
- **Rationale**: 実DB統合テスト基盤の導入は本スペックの境界（owner 保護ロジックの実装）を超える大きな変更であり、既存プロジェクトのテスト方針（モックDB前提）からも逸脱する。行ロックによる直列化保証はPostgreSQLの標準機能に基づく設計上の保証とし、自動テストでは「実装が設計通りの手順（ロック→判定→更新）で呼び出しているか」を検証する。
- **Trade-offs**: 真の同時実行下での owner 数不整合が発生しないことは自動テストでは検証されず、設計レビューとコードレビューによる保証に留まる。
- **Follow-up**: 将来、実DB統合テスト基盤がプロジェクトに導入された場合は、本項目を真の並行リクエストテストに差し替える。

### Decision: 組織コンテキストからの「移動」はサーバー側の強制セッション終了ではなく、次回アクセス時のアクセス制御で実現する
- **Context**: Requirement 3.1/3.2/5.1 は脱退・削除後に「組織コンテキストから移動させる」ことを求めるが、本アプリにはリアルタイムプッシュ基盤（WebSocket 等）がない。
- **Alternatives Considered**:
  1. リアルタイム通知基盤を新規導入し、対象ユーザーを即座に画面遷移させる
  2. 操作を実行したユーザー（自己脱退の場合）はクライアント側で明示的にリダイレクトし、他ユーザーによる操作（owner によるメンバー削除等）は次回のサーバーアクセス時に `resolveOrgContext` が `not-member` を返すことで自然にアクセス不能にする
- **Selected Approach**: 2を採用。
- **Rationale**: spec 7 が確立した「毎リクエストでサーバー側の所属を検証する」というアクセス制御モデルと一貫しており、新規インフラを必要としない。既存の `/dashboard/org/[orgSlug]` layout が既に不所属時に 404 を返す。
- **Trade-offs**: 他ユーザーによる強制退去はブラウザタブを開いたままにしていると即時反映されない（次回のナビゲーション/再読み込みで反映）。これは本機能のスコープ外（リアルタイム性は非機能要件として要求されていない）と判断する。
- **Follow-up**: 将来リアルタイム要件が追加された場合は再設計が必要。

### Decision: 自己降格（Requirement 4.1/4.2）のUIは `OrganizationDangerZone` に一本化する
- **Context**: `/kiro-validate-design` 2回目のレビューで、Requirements Traceability表が4.1を「`MemberList`（自分の行）」の担当としていた一方、Components summary表・詳細ブロックでは同じ4.1/4.2を`OrganizationDangerZone`（Settings画面）の担当としており、実装場所が二重定義されていることが指摘された。
- **Alternatives Considered**:
  1. `MemberList` の自分の行にもロール変更ボタンを表示し、`OrganizationDangerZone` と並行して自己降格を実行できるようにする
  2. 自己降格のUI導線を `OrganizationDangerZone` に一本化し、`MemberList` は自分の行の操作ボタンを非表示にする（対象は常に他者のみ）
- **Selected Approach**: 2を採用。
- **Rationale**: 同一操作（自己降格）に対して2つの独立したUI実装が存在すると、確認文言・エラーハンドリング・遷移先が重複実装され不整合が生じやすい。Settings画面（危険操作の集約先）に一本化することで、owner にとっても「自己に関する重大な操作はSettingsで行う」という一貫したメンタルモデルになる。
- **Trade-offs**: メンバー一覧画面から直接自己降格できず、Settings画面への遷移が1手間増えるが、誤操作防止の観点ではむしろ望ましい。
- **Follow-up**: なし。サービス層の `changeMemberRole` 自体は対象ユーザーを限定しないため、UI側の制約のみで境界を維持する。

### Decision: 一覧再描画は `router.refresh()` によるサーバー再取得に統一する（クライアント側で一覧state を保持しない）
- **Context**: `/kiro-spec-tasks` のタスクグラフ健全性レビューで、「`MembersPage`（Server Component）が `MemberMutationResult.members` を受け取って state を更新し再描画する」という記述が、Server Component は React state を持てないため実装不能であることが判明した。また `InvitationManager` の招待一覧取得責務が `MembersPage` と重複・曖昧であることも指摘された。
- **Alternatives Considered**:
  1. `MembersPage` の内側に新規のクライアントラッパーコンポーネントを追加し、そこで一覧 state を保持する
  2. Next.js App Router の `router.refresh()` を用い、ミューテーション成功後にサーバー側を再実行させて最新の props を再取得する（クライアント側は state を持たない）
- **Selected Approach**: 2を採用。
- **Rationale**: 新規のラッパーコンポーネントを追加するより実装が単純であり、既存の Next.js App Router パターン（Server Component + Server Action + `router.refresh()`）に沿う。`MemberList` / `InvitationManager` は「props をそのまま描画するだけ」という既存の境界（Critical Issue 1 対応）をそのまま維持できる。
- **Trade-offs**: ミューテーションごとにページ全体の Server Component 再実行が発生するが、対象ページの規模・更新頻度を考えると許容範囲。
- **Follow-up**: `InvitationManager` の招待一覧取得責務も `MemberList` と同様に `MembersPage` に一本化し、`InvitationManager` は自ら取得しないことを design.md に明記した。

## Risks & Mitigations
- owner 最小数チェックのタイミングと実際の削除/更新の間で競合状態（同時に2人が最後の owner を降格しようとする）が発生しうる — `SELECT ... FOR UPDATE` による行ロックで対象組織の membership 行を直列化し、単一 SQL トランザクション内でカウント確認と更新を行うことで整合性を担保する（詳細は Design Decisions を参照）。
- 招待キャンセル対象が既に `accepted`/`expired` などへ遷移済みの場合の扱いが曖昧になりうる — `status = 'pending'` の場合のみキャンセル可能とし、それ以外は明示的なエラーを返す。
- 組織削除の同時実行（2つのリクエストが同時に削除を要求）— 2回目の削除は対象組織が既に存在しないため `organization-not-found` 相当のエラーとして扱う。
- `MemberList` が独自にメンバー取得を行う旧設計のままだと、ロール別メール秘匿（Requirement 1.2/1.3）がコンポーネント境界を越えて破られるリスクがあった — `MembersPage` が唯一のデータ取得元となり、`MemberList` は props 経由でフィルタ済みデータのみを受け取る設計に修正済み（詳細は Components and Interfaces / MemberList を参照）。

## References
- 内部: `docs/specs/5-organization-foundation/design.md` — 認可基盤の契約
- 内部: `docs/specs/6-organization-lifecycle/design.md` — 招待ステータス遷移とスキーマ
- 内部: `docs/specs/7-organization-context/design.md` — 組織コンテキスト解決とルーティングガード
