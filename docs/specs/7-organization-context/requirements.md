# Requirements Document

## Introduction

組織メンバーが所属組織を選択し、URL で示された組織のコンテキストを安全に利用できるようにする。組織コンテキストは URL の slug を唯一の情報源とし、`/org/[orgSlug]` 配下の共通ヘッダーへ現在の組織名を常時表示する。認証済み状態だけでなく対象組織への所属を確認したユーザにだけ提供する。

## Boundary Context

- **In scope**: `/dashboard` と `/personal/organizations` における所属組織の選択、`/org/[orgSlug]` の組織コンテキスト、URL の slug による組織解決、`owner`／`member` の所属確認、未所属・非所属・不正 slug 時の導線。
- **Out of scope**: 組織作成と招待の状態遷移、組織メンバーの権限変更、組織削除、組織に紐づく業務データの取得または表示。
- **Adjacent expectations**: organization-foundation の組織・所属・2ロール・認可判定を利用し、organization-lifecycle が作成する承認済みの所属だけを組織コンテキストの対象とする。organization-member-management はこのコンテキスト上で高度なメンバー操作を提供する。

## Requirements

### Requirement 1: 所属組織の選択

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織メンバー |
| 目的 | I want | 所属組織を選択できる |
| 価値 | so that | 操作したい組織のコンテキストへ移動できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When 組織メンバーが `/dashboard` または `/personal/organizations` で所属組織の選択を要求する | the 組織コンテキスト機能 | shall そのユーザが所属する組織だけを選択肢として表示する。 |
| 2 | Event-Driven | When 組織メンバーが所属組織を選択する | the 組織コンテキスト機能 | shall 選択した組織の slug を含む `/org/[orgSlug]` へ移動させる。 |
| 3 | Unwanted Behavior | If 認証済みユーザに所属組織がない | the 組織コンテキスト機能 | shall 組織作成への導線と招待を待つ案内を表示する。 |

### Requirement 2: URL による組織コンテキストの解決

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織メンバー |
| 目的 | I want | URL で示した組織のコンテキストを利用できる |
| 価値 | so that | 組織ごとの画面を確実に識別できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Ubiquitous | - | The 組織コンテキスト機能 | shall `/org/[orgSlug]` の slug をアクティブな組織を確定する唯一の情報源として扱う。 |
| 2 | Event-Driven | When 組織メンバーが `/org/[orgSlug]` を開く | the 組織コンテキスト機能 | shall slug に対応する組織を解決し、その組織のコンテキストを表示する。 |
| 3 | Unwanted Behavior | If URL の slug に対応する組織が存在しない | the 組織コンテキスト機能 | shall 組織情報を表示せず、404画面を表示する。 |
| 4 | State-Driven | While 組織メンバーが `/org/[orgSlug]` 配下の画面を利用している | the 組織コンテキスト機能 | shall 共通ヘッダーに現在アクセス中の組織名を表示する。 |

### Requirement 3: 所属者限定の組織アクセス

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織メンバー |
| 目的 | I want | 自分が所属する組織だけにアクセスできる |
| 価値 | so that | 他の組織の情報へ誤って到達しない |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When `owner` または `member` が `/org/[orgSlug]` またはその配下の画面を開く | the 組織コンテキスト機能 | shall 対象組織への所属を確認してから組織コンテキストを表示する。 |
| 2 | Unwanted Behavior | If 認証済み状態を確認できない | the 組織コンテキスト機能 | shall 組織情報を表示せず、ログイン画面へ移動させる。 |
| 3 | Unwanted Behavior | If ユーザが slug に対応する組織へ所属していない | the 組織コンテキスト機能 | shall 組織情報を表示せず、組織不存在時と同じ404画面を表示する。 |
| 4 | Unwanted Behavior | If 承認前、拒否済み、期限切れ、または無効な招待だけが存在する | the 組織コンテキスト機能 | shall 組織コンテキストを表示しない。 |
