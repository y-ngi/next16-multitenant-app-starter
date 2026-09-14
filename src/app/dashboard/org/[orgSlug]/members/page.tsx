import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getInvitationsAction } from '@/app/actions/organization';
import {
  cancelInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
} from '@/app/actions/organization-member-management';
import {
  InvitationManager,
  type InvitationRecord,
} from '@/components/organization/invitation-manager';
import { MemberList } from '@/components/organization/member-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveOrgContext } from '@/lib/organization-context';
import { listMembersForViewer } from '@/lib/organization-member-management';

interface MembersPageProps {
  readonly params: Promise<{
    orgSlug: string;
  }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { orgSlug } = await params;
  const requestHeaders = await headers();
  const orgContext = await resolveOrgContext(requestHeaders, orgSlug);

  if (!orgContext.ok) {
    notFound();
  }

  const { organizationId, organizationSlug, role, userId } = orgContext;

  const membersResult = await listMembersForViewer({
    headers: requestHeaders,
    slug: organizationSlug,
  });

  if (!membersResult.ok) {
    if (membersResult.reason === 'not-found' || membersResult.reason === 'system-failure') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>メンバー管理</CardTitle>
            <CardDescription>組織メンバーの情報を読み込めませんでした。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              メンバー一覧を取得できませんでした。時間をおいて再読み込みしてください。
            </p>
          </CardContent>
        </Card>
      );
    }

    notFound();
  }

  let invitations: readonly InvitationRecord[] = [];
  let invitationsFetchFailed = false;

  if (role === 'owner') {
    const invitationsResult = await getInvitationsAction(organizationId);

    if (invitationsResult.ok) {
      invitations = invitationsResult.invitations ?? [];
    } else {
      invitationsFetchFailed = true;
      console.error(
        `[MembersPage] Failed to fetch invitations for organization ${organizationId}:`,
        invitationsResult.error
      );
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>メンバー管理</CardTitle>
          <CardDescription>
            組織メンバーの一覧を確認し、owner は招待とロール管理を行えます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={membersResult.members}
            viewerRole={role}
            viewerUserId={userId}
            onRemoveMember={removeMemberAction.bind(null, organizationSlug)}
            onChangeRole={changeMemberRoleAction.bind(null, organizationSlug)}
          />
        </CardContent>
      </Card>

      {role === 'owner' ? (
        invitationsFetchFailed ? (
          <Card>
            <CardHeader>
              <CardTitle>招待管理</CardTitle>
              <CardDescription>招待一覧を読み込めませんでした。</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive">
                招待一覧を取得できませんでした。時間をおいて再読み込みしてください。
              </p>
            </CardContent>
          </Card>
        ) : (
          <InvitationManager
            organizationId={organizationId}
            invitations={invitations}
            onCancelInvitation={cancelInvitationAction.bind(null, organizationSlug)}
          />
        )
      ) : null}
    </div>
  );
}
