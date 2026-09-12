# Research & Design Decisions

## Summary

- **Feature**: 5-organization-foundation
- **Discovery Scope**: Extension
- **Key Findings**:
  - Better Auth は既存のユーザアカウント、セッション、メール検証、二段階認証を管理しており、organization プラグインは有効化されていない。
  - Drizzle スキーマには組織・メンバーシップがなく、既存の認証テーブルを維持した加算的マイグレーションが必要である。
  - 組織操作の認可は、既存のセッション取得パターンを起点に、組織・所属・ロールを毎回確認するサーバー専用境界として追加する。

## Research Log

### 既存認証と組織基盤の統合

- **Context**: 認証済みユーザアカウントを基盤とし、組織・所属・ロールを独自に管理する必要がある。
- **Sources Consulted**: `src/lib/auth.ts`、`src/lib/auth-client.ts`、`src/app/api/auth/[...all]/route.ts`、`src/app/dashboard/page.tsx`、`docs/steering/tech.md`
- **Findings**: Better Auth は Drizzle adapter、メール/パスワード、メール検証、二段階認証を設定している。組織プラグインは設定されていない。保護ページはリクエストヘッダーからセッションを取得する。
- **Implications**: Better Auth のユーザIDを membership の外部キーとして参照し、組織ロジックは認証設定やクライアントへ追加しない。サーバー側認可ヘルパーがセッション取得と組織所属確認を統一する。

### 永続化と移行

- **Context**: 既存認証データを失わず、組織と所属を識別可能にする必要がある。
- **Sources Consulted**: `src/db/schema.ts`、`src/db/index.ts`、`drizzle.config.ts`、`package.json`
- **Findings**: 現在のスキーマは Better Auth の認証関連テーブルと二段階認証テーブルだけである。Drizzle のマイグレーション出力先は `drizzle/` で、組織用の既存マイグレーションはない。
- **Implications**: migration 履歴がない既存 Better Auth スキーマを baseline migration として確立する。既存 DB では baseline DDL を実行せず、スキーマ一致を確認して履歴へ登録してから、organization と membership の加算的 migration を適用する。空の DB は baseline と organization migration の順に構築する。

### 認可と認証オリジン

- **Context**: クライアント指定の組織IDだけを信頼せず、認証オリジンの安全な運用を維持する必要がある。
- **Sources Consulted**: `src/lib/auth.ts`、`.env.example`、`docs/steering/4-roadmap.md`、`docs/specs/5-organization-foundation/requirements.md`
- **Findings**: 認証の公開URLに関する環境変数は存在するが、認証設定で canonical URL を一貫して使用する設計が必要である。プロキシ運用では信頼境界外の転送ヘッダーを認証オリジンとして扱えない。
- **Implications**: canonical な `BETTER_AUTH_URL` を認証サーバー・クライアントで共通の base URL とし、任意の Host または転送ヘッダーから URL を組み立てない。プロキシはアプリケーションへ渡す転送ヘッダーを上書きまたは制限する運用前提を明記する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
| --- | --- | --- | --- | --- |
| Better Auth organization plugin | 組織とロールを認証ライブラリへ委譲する | 初期実装が少ない | 業務ロジックがプラグイン仕様に結合する | 方針により不採用 |
| 独自 schema と認可ヘルパー | 組織データと認可をアプリケーションで管理する | ロールと認可ルールを安定して制御できる | スキーマ・認可検証を実装する必要がある | 採用 |
| 汎用 repository 層 | 全ての組織データアクセスを抽象化する | 将来の交換が容易 | 現時点では単一の Drizzle 実装に対して過剰 | 不採用 |

## Design Decisions

### Decision: 組織認可を単一のサーバー境界に集約する

- **Context**: 後続のライフサイクル、コンテキスト、メンバー管理が同じ所属・ロール判定を必要とする。
- **Alternatives Considered**:
  1. 各ページまたは操作で個別にセッションと membership を照会する。
  2. サーバー専用の組織認可モジュールで照会と失敗分類を統一する。
- **Selected Approach**: `src/lib/organization-authz.ts` が認証済みユーザ、対象組織、membership、必要ロールを検証し、識別可能な成功または失敗結果を返す。
- **Rationale**: 後続仕様が再利用でき、認可漏れとロール判定の重複を防止できる。
- **Trade-offs**: 後続機能はこのモジュールを経由する必要があるが、責任境界が明確になる。
- **Follow-up**: 未認証、組織不存在、非所属、ロール不足、組織ID改変を単体テストで検証する。

### Decision: role を永続化と型の両方で閉じる

- **Context**: 初期ロールは `owner` と `member` に限定される。
- **Alternatives Considered**:
  1. 自由な文字列として role を保存する。
  2. 許可された2値を型とデータベース制約で保存する。
- **Selected Approach**: `owner` と `member` のみを表現する型とデータベース制約を使用する。
- **Rationale**: 不正または未定義のロールを保存・認可できない。
- **Trade-offs**: ロール追加にはスキーマ、型、認可テストの明示的な変更と後続仕様の再検証が必要になる。
- **Follow-up**: migration と認可テストが同じ許可集合を検証する。

### Decision: 組織基盤は加算的に導入する

- **Context**: 既存ユーザ、認証情報、セッションを維持する必要がある。
- **Alternatives Considered**:
  1. 既存認証テーブルを組織モデル用に変更する。
  2. 新しい organization と membership テーブルだけを追加する。
- **Selected Approach**: 認証テーブルを変更せず、2つの組織テーブルと外部キー・一意制約を追加する。
- **Rationale**: 既存のログイン、メール検証、二段階認証、セッションに影響しない。
- **Trade-offs**: 既存ユーザは自動的には組織へ所属しない。組織作成は lifecycle の責務である。
- **Follow-up**: 空の organization/membership 状態で既存認証フローが継続することを確認する。

## Risks & Mitigations

- セッションだけで組織操作を許可するリスク — 組織操作ごとに organization と membership をサーバーで照会して fail-closed にする。
- role の値が不正になるリスク — 型、DB制約、認可判定のすべてを `owner`/`member` に閉じる。
- 移行時に既存認証データへ影響するリスク — 既存テーブルを変更しない加算的 migration とし、適用前後で認証テストを実行する。
- ホストヘッダーを認証URLとして使用するリスク — 固定 base URL とプロキシによる転送ヘッダー制御を必須の運用前提とする。

## References

- [Better Auth Configuration](https://www.better-auth.com/docs/reference/options) — base URL と認証設定の参照。
- [Drizzle ORM PostgreSQL Indexes and Constraints](https://orm.drizzle.team/docs/indexes-constraints) — 外部キーと一意制約の設計参照。
- `docs/steering/tech.md` — プロジェクトの認証、組織ロール、テスト方針。
