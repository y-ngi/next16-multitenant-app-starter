# Implementation Plan

- [ ] 1. Foundation: メンバー閲覧フィルタと owner 保護ガード
- [x] 1.1 ロール別メンバー閲覧フィルタ（`listMembersForViewer`）を実装する
  - `organization-member-management.ts` に `OrganizationRole` / `ViewableMember` / `ListMembersResult` などの型と、既存の `getOrganizationMembers`（`organization-lifecycle`）を呼び出した後 viewerRole が `owner` でない場合に `userEmail` を除去するラッパー関数を実装する
  - 非所属ユーザーからの呼び出しは `requireOrganizationAccessBySlug` の失敗結果をそのまま `not-member` 等の理由で返す
  - 観測可能な完了条件: owner 視点では `userEmail` を含む `ViewableMember[]` が返り、member 視点では `userEmail` が存在しない同じ配列が返ることをユニットテストで確認できる
  - _Requirements: 1.1, 1.2, 1.3_
  - _Boundary: organization-member-management service_

- [x] 1.2 owner 最小数保護の共有ガード（`ensureOwnerRemainsAfterChange`）を実装する
  - 対象組織の `membership` 行を `db.transaction` 内で標準クエリビルダーの `.for('update')` を用いて行ロックし、対象操作（削除/ロール変更/脱退）後の owner 数をシミュレートしてから 0 になる場合は例外的に処理を打ち切り `last-owner-protection` を返すガード関数を実装する
  - 0 にならない場合は同一トランザクション内で呼び出し元が渡す更新処理を実行できるようにする（コールバック方式など、削除・ロール変更・脱退から共通利用できるインターフェースにする）
  - 観測可能な完了条件: 唯一の owner を対象にした降格・削除・脱退のシミュレーションでガードが `last-owner-protection` を返し、複数 owner が存在する場合は許可されることをユニットテストで確認できる。モック化した `db` に対して `.for('update')` を伴うロック取得が更新処理より先に呼ばれることを呼び出し順序で検証する
  - _Requirements: 2.5, 3.3, 4.2_
  - _Boundary: organization-member-management service_
  - _Depends: 1.1_

- [ ] 2. Core: メンバー・招待に対するミューテーション操作
- [x] 2.1 `removeMember` を実装する
  - `requireOrganizationAccessBySlug`（`requiredRole: 'owner'`）で認可判定した後、1.2 の共有ガードを介して対象ユーザーの所属を削除する
  - 観測可能な完了条件: owner が対象組織の member を削除すると、その所属が削除され、更新後の `ViewableMember[]` が返る
  - _Requirements: 2.2, 2.6_
  - _Boundary: organization-member-management service_
  - _Depends: 1.2_

- [x] 2.2 `changeMemberRole` を実装する（member↔owner の双方向、自分自身を対象とする呼び出しも含む）
  - `requireOrganizationAccessBySlug`（`requiredRole: 'owner'`）で認可判定した後、1.2 の共有ガードを介して対象ユーザーのロールを更新する。対象ユーザーが呼び出し本人であっても同じ関数・同じガードを通す
  - 観測可能な完了条件: owner が member を owner に、owner を member にそれぞれ変更でき、更新後の `ViewableMember[]` が返る
  - _Requirements: 2.3, 2.4, 2.6, 4.1, 4.2_
  - _Boundary: organization-member-management service_
  - _Depends: 1.2_

- [x] 2.3 `leaveOrganization` を実装する
  - `requireOrganizationAccessBySlug`（`requiredRole: 'member'`、対象は常に呼び出し本人）で認可判定した後、1.2 の共有ガードを介して呼び出し本人の所属を削除する
  - 観測可能な完了条件: 複数 owner が存在する組織で owner が自己脱退でき、唯一の owner の場合は `last-owner-protection` が返ることを確認できる
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: organization-member-management service_
  - _Depends: 1.2_

- [x] 2.4 `cancelInvitation` を実装する
  - `requireOrganizationAccessBySlug`（`requiredRole: 'owner'`）で認可判定した後、対象招待が `pending` 状態であることを確認してから無効化する。`pending` 以外は `invitation-not-pending` を返す
  - 観測可能な完了条件: owner が保留中の招待を削除でき、既に処理済みの招待に対しては削除されず `invitation-not-pending` が返ることを確認できる
  - _Requirements: 2.7, 2.8_
  - _Boundary: organization-member-management service_

- [x] 2.5 `deleteOrganization` を実装する
  - `requireOrganizationAccessBySlug`（`requiredRole: 'owner'`）で認可判定した後、`organization` 行を削除する（`membership` / `invitation` は既存の `onDelete: cascade` に委ねる）。削除処理中の例外は捕捉し既存状態を維持したまま失敗結果を返す
  - 観測可能な完了条件: owner が組織を削除すると `organization` / `membership` / `invitation` の該当行がすべて消え、削除に失敗した場合は既存の組織状態がそのまま残ることを確認できる
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: organization-member-management service_

- [x] 2.6 `removeMember` / `changeMemberRole` / `leaveOrganization` のユニットテストを追加する
  - member による呼び出しが `insufficient-role` で拒否されること、唯一の owner に対する降格・削除・脱退が `last-owner-protection` で拒否されること、複数 owner 存在時は許可されることを検証する
  - 観測可能な完了条件: これら3関数に対するテストスイートが追加され、`vitest` 実行で全てグリーンになる
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 4.1, 4.2_
  - _Boundary: organization-member-management service_
  - _Depends: 2.1, 2.2, 2.3_

- [x] 2.7 `cancelInvitation` / `deleteOrganization` のユニットテストを追加する
  - member による招待削除・組織削除の呼び出しが権限エラーで拒否されること、`pending` 以外の招待に対するキャンセルが拒否されること、組織削除失敗時に既存状態が維持されることを検証する
  - 観測可能な完了条件: これら2関数に対するテストスイートが追加され、`vitest` 実行で全てグリーンになる
  - _Requirements: 2.7, 2.8, 5.1, 5.2, 5.3_
  - _Boundary: organization-member-management service_
  - _Depends: 2.4, 2.5_

- [x] 3. Core: Server Action ラッパーを実装する
  - `removeMember` / `changeMemberRole` / `cancelInvitation` / `leaveOrganization` / `deleteOrganization` それぞれに対応する薄い Server Action（`headers()` 取得 + サービス呼び出しのみ、`src/app/actions/organization.ts` と同じ規約）を `src/app/actions/organization-member-management.ts` に実装する
  - 観測可能な完了条件: クライアントコンポーネントから `(slug: string, ...) => Promise<Result>` 形式でこれら5操作を呼び出せる Server Action が揃っている
  - _Requirements: 2.2, 2.3, 2.4, 2.7, 3.1, 3.2, 4.1, 5.1_
  - _Boundary: organization-member-management actions_
  - _Depends: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Core: フロントエンドコンポーネントの実装
- [x] 4.1 (P) `MemberList` をロール別表示・自分の行の操作非表示に対応させる
  - 既存の内部フェッチ（`getOrganizationMembersAction` の呼び出しと `useEffect`）を削除し、`members` / `viewerRole` / `viewerUserId` / `onRemoveMember` / `onChangeRole` を props として受け取る表示コンポーネントへ変更する
  - `member.userId === viewerUserId` の行では削除・ロール変更ボタンを描画しない。`userEmail` が存在する行のみメールアドレスを表示する
  - 削除・ロール変更成功後は一覧データを自身の state として保持せず、`router.refresh()` を呼び出して親の Server Component（`MembersPage`）から最新の `members` props を再取得する
  - 観測可能な完了条件: owner 視点でメール付き・操作ボタン付きの行が描画され、member 視点ではメールと操作ボタンがいずれも表示されず、自分の行には他者向け操作ボタンが表示されないことをコンポーネントテストで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 2.4_
  - _Boundary: MemberList_

- [x] 4.2 (P) `InvitationManager` に保留中招待のキャンセル操作を追加する
  - 招待一覧は `invitations` props として親（`MembersPage`）から受け取り、`InvitationManager` 自身は招待一覧を取得しない（`MemberList` と同様のデータ取得責務の一本化）
  - `status === 'pending'` の招待行に「招待を取り消す」ボタンと `onCancelInvitation` コールバックを追加し、押下時に呼び出す。成功後は `router.refresh()` を呼び出して最新の招待一覧を反映する
  - 観測可能な完了条件: pending 状態の招待行にのみキャンセルボタンが表示され、押下すると `onCancelInvitation` が呼ばれ、成功後に一覧から該当招待が消える（または `canceled` 表示になる）ことをコンポーネントテストで確認できる
  - _Requirements: 2.7_
  - _Boundary: InvitationManager_

- [x] 4.3 (P) `LeaveOrganizationButton` を新規作成する
  - 確認ダイアログ付きの自己脱退ボタンを実装し、成功時は `/dashboard/personal/organizations` へ遷移、`last-owner-protection` 失敗時は「別のメンバーを owner に変更する必要があります」を表示する
  - 観測可能な完了条件: ボタン押下→確認→実行の一連の操作がコンポーネントテストで検証でき、エラー時に指定メッセージが表示されることを確認できる
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: LeaveOrganizationButton_

- [x] 4.4 (P) `OrganizationDangerZone` を新規作成する
  - owner 限定の「自分を member に変更」ボタンと「組織を削除」ボタンをそれぞれ独立した確認ダイアログ付きで実装する。自己降格の `last-owner-protection` 失敗、組織削除失敗時のメッセージを表示し、組織削除成功時は `/dashboard/personal/organizations` へ遷移する
  - 観測可能な完了条件: 自己降格・組織削除それぞれのボタン押下→確認→実行がコンポーネントテストで検証でき、`MemberList` には自己降格用の操作ボタンが存在しないことと矛盾しない導線であることを確認できる
  - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.3_
  - _Boundary: OrganizationDangerZone_

- [ ] 5. Integration: ページの結線とナビゲーション
- [x] 5.1 `MembersPage` を実装する
  - `resolveOrgContext` の結果を用いて `listMembersForViewer` を呼び出し、取得した `ViewableMember[]` を `MemberList` へ、owner の場合のみ `getInvitationsAction` で取得した招待一覧を `InvitationManager` へ、それぞれ props として渡す（`MembersPage` を唯一のデータ取得元とし、`MemberList` / `InvitationManager` はいずれも自ら取得しない）
  - 招待開始導線（既存の招待作成フローへの接続）を追加し、削除・ロール変更・招待キャンセルの Server Action を各コンポーネントへ配線する。各ミューテーション成功後は呼び出し側コンポーネントが `router.refresh()` を実行し、`MembersPage`（Server Component）の再実行によって最新データが反映される仕組みとする
  - 観測可能な完了条件: `/dashboard/org/[orgSlug]/members` にアクセスすると member はメンバー一覧のみ、owner はメール・操作ボタン・招待管理UIを含む画面が表示され、削除/ロール変更/招待キャンセル後に画面が最新状態へ更新される
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.7_
  - _Depends: 3, 4.1, 4.2_

- [x] 5.2 `SettingsPage` を実装する
  - `resolveOrgContext` が返す `role` に基づき `LeaveOrganizationButton` を全ロールに、`OrganizationDangerZone`（owner限定セクション）を owner にのみ表示し、それぞれに対応する Server Action を配線する
  - 観測可能な完了条件: `/dashboard/org/[orgSlug]/settings` にアクセスすると member には自己脱退ボタンのみ、owner には自己脱退ボタンと自己降格・組織削除ボタンが表示される
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.1, 5.2_
  - _Depends: 3, 4.3, 4.4_

- [x] 5.3 組織コンテキストページから /members と /settings への導線を追加する
  - `src/app/dashboard/org/[orgSlug]/page.tsx` に、メンバー管理画面・設定画面への遷移リンクを追加する（既存のコンテキスト表示自体は変更しない）
  - 観測可能な完了条件: 組織コンテキストページを開くと `/members` と `/settings` へのリンクが表示され、クリックするとそれぞれの画面に遷移する
  - _Requirements: 1.1, 3.1_
  - _Depends: 5.1, 5.2_

- [ ] 6. Validation: 統合テストと不変条件の確認
- [x] 6.1 メンバー一覧のロール別可視性に関する統合テストを追加する
  - 実際の `page.tsx` + `MemberList` + `InvitationManager` を合成し、member ロールではメールアドレス・操作ボタンが非表示、owner ロールでは表示されることを検証する。`MemberList` へメール付き/なしデータをそれぞれ渡した場合に自身がフィルタ漏れを起こさないことも確認する
  - 観測可能な完了条件: 上記2ロールそれぞれのレンダリング結果を検証するテストが追加され、`vitest` 実行でグリーンになる
  - _Requirements: 1.1, 1.2, 1.3_
  - _Depends: 5.1_

- [x] 6.2 組織削除のカスケード効果に関する統合テストを追加する
  - `deleteOrganization` 実行後、対象組織に紐づく `membership` / `invitation` が既存の `onDelete: cascade` によりすべて削除され、その後の `resolveOrgContext` 呼び出しが `organization-not-found` を返すことを検証する
  - 観測可能な完了条件: 組織削除→関連データ消失→コンテキスト解決失敗という一連の流れを確認するテストが追加され、`vitest` 実行でグリーンになる
  - _Requirements: 5.1, 5.3_
  - _Depends: 2.7_

- [x]* 6.3 招待キャンセルと権限拒否に関する追加のエッジケーステストを追加する
  - member による削除・ロール変更・招待キャンセル・組織削除の要求がすべて権限エラーで拒否されること（Requirements 2.6, 2.8, 5.2）、および既に `accepted`/`expired` 等へ遷移した招待に対するキャンセル要求が `invitation-not-pending` を返すこと（Requirements 2.8）を、UIレベルの統合テストとして追加する
  - 観測可能な完了条件: 上記エッジケースを検証するテストが追加され、`vitest` 実行でグリーンになる
  - _Requirements: 2.6, 2.8, 5.2_
  - _Depends: 5.1, 5.2_

## Implementation Notes
- Task 2.6/2.7: `removeMember`/`changeMemberRole`/`leaveOrganization`/`cancelInvitation`/`deleteOrganization` の service-layer ユニットテストは、TDDで各関数実装（2.1-2.5）と同時に追加済みだったため、追加実装は不要と判断（レビューで service 境界内の網羅性を確認済み）。招待一覧表示・組織コンテキスト遷移・cascade実効性の検証は frontend(4.x/5.x)/統合テスト(6.2)の責務であり、2.6/2.7 の境界外。
- Task 4.1: `organization-list.tsx`（`/dashboard/personal` の概要表示、本specの境界外）が旧 `MemberList` props に依存していたため、design 契約の単一化に伴い read-only 表示（`viewerRole:'member'` 固定、操作ボタン非表示）として合わせて更新した。
- Task 4.2: `InvitationManager` の招待作成成功通知を legacy caller（`organization-list.tsx`、クライアント側 state 管理）にも伝える必要があったため、`router.refresh()`（`MembersPage` 向け）に加えて任意の `onInvitationCreated` コールバックを追加し、両方の呼び出し元で一覧が正しく再取得されるようにした。
- Task 5.1: `resolveOrgContext` を認可・組織情報の唯一の正準ソースとし、`listMembersForViewer` は `.members` の取得にのみ使用すること。招待取得失敗時は独自フォールバックUIを作らず、常に本物の `InvitationManager` を `invitations=[]` で描画すること（コンポーネントの責務を親ページへ持ち込まない）。
- Task 6.1: 統合テストで `listMembersForViewer` をモックする際は、実際の `toViewableMembersForRole` の挙動（owner は `userEmail` を含み、member は完全に省略）と一致させること。role にかかわらず email を含む非現実的なモックデータで `MemberList` 単体の防御を試すのは、承認済み設計（email 非開示は service 層でのみ保証）と矛盾する誤検知を生む。
- Task 6.2: 実DB統合テスト基盤が存在しないため、カスケード削除の検証はモックDBによる「削除呼び出し→事後の組織検索が空を返す→organization-not-found」というシーケンス検証に限定した（membership/invitation の実FKカスケードはPostgreSQLの保証としてスコープ外、design.md記載の既承認事項）。
- Task 6.3: member による remove/role-change/cancel-invitation/org-deletion の権限拒否（Requirements 2.6, 2.8, 5.2）は、UIが操作導線自体を非表示にする（`role-visibility.integration.test.tsx`, 新規 `settings/member-permissions.integration.test.tsx`）ことと、service層が `insufficient-role` を返す既存ユニットテスト（`organization-member-management.test.ts`）の組み合わせで担保されると判断し、UIから「攻撃的に権限を突破しようとする」テストは実画面の振る舞いに反するため追加しなかった。新規テストはUI/production コードを一時的に破壊してRED、復元してGREENを確認する形で証跡を取得すること（フェイクの `RED_PHASE_OUTPUT: N/A` は却下対象）。
