# Brief: organization-foundation

## Problem

認証済みユーザを組織へ関連付ける永続モデルと、組織単位で操作を認可する基盤が存在しない。そのため組織作成、メンバー管理、組織内の安全な操作を実装できない。

## Current State

Better Auth はメール/パスワード、メール検証、二段階認証のみを設定している。Drizzleスキーマにも組織、メンバー、招待テーブルはなく、認可はログイン済みかどうかだけを確認している。

## Desired Outcome

Better Auth が提供する既存の認証と分離して、独自の組織およびメンバーシップのモデルを導入する。`owner` と `member` の2ロールを安全に扱い、後続の画面や業務データが再利用できるサーバー側の組織所属・権限検証境界を持つ。

## Approach

組織とメンバーシップを独自の永続モデルとして導入し、既存の認証セッションと組み合わせてアプリケーションが組織所属と権限をサーバーで検証する。組織とロールに関する業務ロジックは Better Auth の organization プラグインに依存しない。

## Scope

- **In**: 独自の組織・メンバーシップモデル、`owner`/`member` ロール、組織所属/権限のサーバー側検証、既存認証との継続性、固定 `baseURL` の設定。
- **Out**: 組織作成・メンバー追加・招待の画面と利用フロー、組織ルーティング、実業務データ、`owner`/`member` 以外のロール。

## Boundary Candidates

- 独自の組織・メンバーシップ永続化と既存認証
- アプリケーション共通の組織認可ヘルパー

## Out of Boundary

- 招待の送信/受諾フローおよび招待情報の管理
- 組織メンバーを操作するUI

## Upstream / Downstream

- **Upstream**: 既存の Better Auth による認証、Drizzle、PostgreSQL
- **Downstream**: organization-lifecycle、organization-context、organization-member-management、および将来の組織データ仕様

## Existing Spec Touchpoints

- **Extends**: なし
- **Adjacent**: `src/lib/auth.ts`、`src/lib/auth-client.ts`、`src/db/schema.ts`

## Constraints

Better Auth v1.7.3 のHostヘッダー検証のReDoS懸念を軽減するため、固定 `baseURL` とプロキシでの転送ヘッダー制御を前提とする。上流修正の提供後は依存関係を更新する。組織・ロールの業務ロジックは Better Auth の organization プラグインへ依存させない。
