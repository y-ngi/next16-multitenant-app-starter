# Brief: organization-member-management

## Problem

組織の所有者が、所属メンバーを安全に維持するための操作を行えない。メンバーは自分が所属する組織とそのメンバー情報を確認できない。

## Current State

組織、メンバー、招待、ロールごとの画面・操作は存在しない。組織ライフサイクルと組織コンテキストの基盤を前提として、実際の管理機能を追加する必要がある。

## Desired Outcome

独自の `owner` と `member` の2ロールに従い、owner だけが招待、削除、ロール変更、組織削除を行える。複数の owner を設定でき、常に1人以上の owner を維持する。member はメンバー一覧を閲覧し、自身を組織から脱退できる。owner も複数いる場合は自身を member へ変更または脱退できる。全メンバーは表示名とロールを確認でき、owner はメールアドレスも確認できる。

## Approach

組織コンテキスト配下にメンバー管理と設定画面を配置し、organization-foundation が提供する独自の組織認可を各操作で利用する。UIの表示制御は補助として扱い、操作の最終認可は必ずサーバーで実施する。

## Scope

- **In**: メンバー管理画面、owner による招待/削除/ロール変更/組織削除、メンバーの自己脱退、owner の最低1人維持、権限不足時のUIとエラー処理。
- **Out**: `owner`/`member` 以外のロール、招待の作成・承認・有効期限などの状態遷移、実業務データの可視性、監査ログ、課金/サブスクリプション。

## Boundary Candidates

- ロール別に許可される組織メンバー操作
- owner の最低1人維持と組織削除

## Out of Boundary

- 組織/招待/所属の基礎スキーマ
- 組織コンテキストのルーティングと所属ガード
- 招待の作成・承認・有効期限などの状態遷移

## Upstream / Downstream

- **Upstream**: organization-foundation、organization-lifecycle、organization-context
- **Downstream**: 将来の業務データ管理とテナント別可視性仕様

## Existing Spec Touchpoints

- **Extends**: organization-foundation、organization-lifecycle、organization-context
- **Adjacent**: `src/components/ui/`、`src/app/(protected)/org/[orgSlug]/members`、`src/app/(protected)/org/[orgSlug]/settings`

## Constraints

組織削除とロール変更は `owner` のみが実行できる。複数 owner を許可する一方、常に1人以上の owner を維持する。唯一の owner は自身を member へ変更または組織から脱退できない。組織削除時には、組織、全メンバーシップ、全未受諾招待を削除する。画面で操作を隠すだけでなく、すべての変更操作で組織コンテキスト、所属、ロールをサーバー側で検証する。
