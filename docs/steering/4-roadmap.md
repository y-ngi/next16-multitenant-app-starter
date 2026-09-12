# Roadmap

## Overview

一般ユーザが組織を作成し、メール招待を通じて他のユーザを組織へ所属させられるようにする。組織内の操作とメンバー情報の表示は、アプリケーションが独自に管理する組織・メンバーシップ・ロールに基づいて保護する。

既存の Better Auth 認証基盤と分離して、独自の組織・メンバーシップ・ロールの基盤を導入し、組織・招待・所属・組織コンテキストを段階的に実装する。今回の対象は組織管理と認可基盤であり、実業務データの組織単位の可視性・分離は後続仕様で扱う。

## Approach Decision

- **Chosen**: Better Auth は認証とセッション管理に限定し、組織・メンバーシップ・ロールをアプリケーションの独自モデルと認可判定で管理する。
- **Why**: 組織とロールに関する業務ロジックを認証ライブラリの organization プラグインの仕様変更から分離し、将来の機能拡張時にもアプリケーションの認可ルールを安定して維持できる。
- **Rejected alternatives**: Better Auth organization プラグインへ組織・招待・ロールを委譲する案は、認証との初期統合は容易だが、プラグインの仕様変更が将来の業務ロジックへ影響するため採用しない。

## Scope

- **In**: 組織作成、メール招待と受諾、独自の組織・メンバーシップ、`owner`/`member` ロール、組織コンテキスト、メンバー管理、組織管理操作の認可。
- **Out**: 実業務データテーブルの追加、業務データのテナント分離・ロール別可視性、課金、外部IdP連携、組織検索による自己参加。

## Constraints

Next.js 16、TypeScript strict mode、PostgreSQL 16、Drizzle ORM、Better Auth を使用する。組織・メンバーシップ・ロールの永続化は独自の Drizzle スキーマとマイグレーションで管理する。初期段階のロールは `owner` と `member` に限定する。Better Auth v1.7.3 のHostヘッダー検証のReDoS懸念に対し、固定 `baseURL` を設定し、配備時にリバースプロキシが転送ヘッダーを上書きまたは制限する。上流修正が利用可能になったら Better Auth を更新する。

## Boundary Strategy

- **Why this split**: 永続化/認可基盤を先に確立し、その上で招待ライフサイクル、リクエストごとの組織コンテキスト、権限を要する管理画面を順に積み上げる。各仕様を独立してテスト可能にし、後続の業務データ仕様が再利用できる認可境界を残す。
- **Shared seams to watch**: 独自の組織・メンバーシップ・ロールモデル、Drizzleスキーマ、組織ID/slugの正規化、サーバー側のセッション/組織所属検証、ロール変更時のUIと操作の整合。

## Specs (dependency order)

- [ ] 5-organization-foundation -- 独自の組織・メンバーシップモデル、`owner`/`member` ロールと安全な認可基盤を導入する。Dependencies: none
- [ ] 6-organization-lifecycle -- 組織作成、メール招待、受諾、所属一覧を提供する。Dependencies: 5-organization-foundation
- [ ] 7-organization-context -- 組織選択と `/org/[orgSlug]` の所属者限定コンテキストを提供する。Dependencies: 5-organization-foundation, 6-organization-lifecycle
- [ ] 8-organization-member-management -- ロールに応じたメンバー/組織管理操作を提供する。Dependencies: 5-organization-foundation, 6-organization-lifecycle, 7-organization-context
