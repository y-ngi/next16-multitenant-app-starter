# Brief: organization-context

## Problem

組織へ所属した後も、現在操作している組織を選択・URLから解決・所属検証する仕組みがない。そのため組織単位の画面と将来のテナントデータを安全に提供できない。

## Current State

保護ページは `/dashboard` のみで、ログイン済みかだけを確認している。`/org/[orgSlug]` のルート、組織切替、所属者限定のガードは存在しない。

## Desired Outcome

ユーザは `/dashboard` と `/personal/organizations` で所属組織を選択し、`/org/[orgSlug]` 以下でその組織のコンテキストを利用できる。`owner` と `member` の両方が利用できる。組織コンテキストは URL の slug を唯一の情報源とし、共通ヘッダーには現在アクセス中の組織名を常時表示する。サーバーは slug から組織を解決して現在ユーザの所属を必ず検証する。非所属ユーザと存在しない組織には、組織情報を到達させず、同じ404画面を表示する。

## Approach

organization-foundation の認可ヘルパーと organization-lifecycle の所属情報を利用し、App Routerのサーバーコンポーネントで組織コンテキストを解決する。所属組織一覧を組織切替UIとして提供し、未所属/非所属/不正slugの導線を明確にする。

## Scope

- **In**: 組織選択、`/org/[orgSlug]` のルート構造、slug解決、サーバー側の所属ガード、未所属/非所属時のUX。
- **Out**: メンバー管理の詳細操作、実業務データのクエリと可視性、組織作成と招待の状態遷移。

## Boundary Candidates

- URLとアクティブ組織の解決
- サーバーコンポーネントのメンバーシップガード

## Out of Boundary

- 組織ロールを変更する操作
- 組織に紐づく業務データモデル

## Upstream / Downstream

- **Upstream**: organization-foundation、organization-lifecycle
- **Downstream**: organization-member-management、および将来のテナントデータ仕様

## Existing Spec Touchpoints

- **Extends**: organization-foundation、organization-lifecycle
- **Adjacent**: `src/app/dashboard/page.tsx`、`docs/sitemap.md`

## Constraints

組織コンテキストは URL の slug を唯一の情報源とし、直近の選択状態などの補助情報で組織を確定しない。`/org/[orgSlug]` 配下の共通ヘッダーには、slug ではなく利用者が識別できる現在の組織名を常時表示する。組織IDをクライアント入力だけから信頼しない。組織情報・操作の読み込み前に、リクエストセッションとルートから解決した組織の所属をサーバーで検証する。所属組織がない場合は、組織作成への導線と招待待ち案内を表示する。
