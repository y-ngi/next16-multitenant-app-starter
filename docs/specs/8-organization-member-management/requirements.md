# Requirements Document

## Introduction

組織の owner がメンバーを安全に管理し、組織メンバーが所属情報を確認または自身を脱退できるようにする。認証システムはユーザアカウントを認証して特定し、組織管理はそのユーザアカウントと組織の所属およびロールを管理する。組織・メンバーシップ・ロールの管理ロジックは認証システムの組織機能に依存せず、認証済みのユーザアカウントを基盤として扱う。ロールは `owner` と `member` の2種類とする。

## Boundary Context

- **In scope**: `/org/[orgSlug]` 配下のメンバー管理と設定、メンバー一覧、owner による招待の開始・削除・ロール変更・組織削除、メンバーの自己脱退、最低1人の owner の維持、権限不足時の表示。
- **Out of scope**: 招待の作成・承認・拒否・有効期限・通知送信などの状態遷移、組織コンテキストの解決、実業務データ、監査ログ、課金、`owner` と `member` 以外のロール。
- **Adjacent expectations**: organization-context が解決した所属済み組織コンテキストだけで利用する。招待の状態遷移は organization-lifecycle が担い、本機能は owner が招待を開始する導線を提供する。organization-foundation のサーバー側認可判定をすべての変更操作で利用する。

## Requirements

### Requirement 1: メンバー情報の閲覧

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織メンバー |
| 目的 | I want | 所属組織のメンバー情報を確認できる |
| 価値 | so that | チームの構成と各メンバーのロールを把握できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When 組織メンバーが所属組織のメンバー一覧を開く | the 組織メンバー管理機能 | shall 各メンバーの表示名とロールを表示する。 |
| 2 | Event-Driven | When owner が所属組織のメンバー一覧を開く | the 組織メンバー管理機能 | shall 各メンバーのメールアドレスも表示する。 |
| 3 | Unwanted Behavior | If ユーザが対象組織へ所属していない | the 組織メンバー管理機能 | shall メンバー情報を表示しない。 |

### Requirement 2: owner によるメンバー管理

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織の owner |
| 目的 | I want | メンバーを招待、削除、ロール変更できる |
| 価値 | so that | 組織の利用者と管理権限を適切に維持できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When owner がメンバー管理画面で招待を開始する | the 組織メンバー管理機能 | shall organization-lifecycle の招待フローへ進める。 |
| 2 | Event-Driven | When owner が対象組織の member を削除する | the 組織メンバー管理機能 | shall 対象ユーザの所属を削除し、更新後のメンバー一覧を表示する。 |
| 3 | Event-Driven | When owner が対象組織の member を owner に変更する | the 組織メンバー管理機能 | shall 対象ユーザのロールを owner に変更する。 |
| 4 | Event-Driven | When owner が対象組織の owner を member に変更する | the 組織メンバー管理機能 | shall 対象ユーザのロールを member に変更する。 |
| 5 | Unwanted Behavior | If ロール変更またはメンバー削除によって対象組織の owner が0人になる | the 組織メンバー管理機能 | shall 操作を実行せず、少なくとも1人の owner を維持する必要があることを表示する。 |
| 6 | Unwanted Behavior | If member が招待、削除、ロール変更を要求する | the 組織メンバー管理機能 | shall 操作を実行せず、権限がないことを表示する。 |

### Requirement 3: メンバーの自己脱退

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織メンバー |
| 目的 | I want | 自身を組織から脱退できる |
| 価値 | so that | 不要になった組織への所属を自分で解消できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When member が自身の組織からの脱退を確認する | the 組織メンバー管理機能 | shall その member の所属を削除し、組織コンテキストから移動させる。 |
| 2 | Event-Driven | When 複数の owner が存在する組織で owner が自身の組織からの脱退を確認する | the 組織メンバー管理機能 | shall その owner の所属を削除し、組織コンテキストから移動させる。 |
| 3 | Unwanted Behavior | If 唯一の owner が自身の組織からの脱退を要求する | the 組織メンバー管理機能 | shall 脱退を実行せず、別のメンバーを owner に変更する必要があることを表示する。 |

### Requirement 4: owner の自己ロール変更

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織の owner |
| 目的 | I want | 条件を満たす場合に自身を member へ変更できる |
| 価値 | so that | 他の owner へ管理責任を引き継げる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When 複数の owner が存在する組織で owner が自身を member に変更する | the 組織メンバー管理機能 | shall そのユーザのロールを member に変更する。 |
| 2 | Unwanted Behavior | If 唯一の owner が自身を member に変更しようとする | the 組織メンバー管理機能 | shall ロール変更を実行せず、別のメンバーを owner に変更する必要があることを表示する。 |

### Requirement 5: owner による組織削除

#### Objective

| 項目 | 英語表現 | 内容 |
| --- | --- | --- |
| 利用者 | As a | 組織の owner |
| 目的 | I want | 不要になった組織を削除できる |
| 価値 | so that | 利用しない組織とその所属情報を適切に整理できる |

#### Acceptance Criteria

| # | EARS パターン | 条件またはトリガー | システム | 応答 |
| --- | --- | --- | --- | --- |
| 1 | Event-Driven | When owner が組織削除を明示的に確認する | the 組織メンバー管理機能 | shall 対象組織、全メンバーシップ、および全未受諾招待を削除し、組織コンテキストから移動させる。 |
| 2 | Unwanted Behavior | If member が組織削除を要求する | the 組織メンバー管理機能 | shall 組織を削除せず、権限がないことを表示する。 |
| 3 | Unwanted Behavior | If 組織削除が完了しない | the 組織メンバー管理機能 | shall 既存の組織と所属状態を維持し、削除できなかったことを表示する。 |
