import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  changeMemberRoleAction,
  deleteOrganizationAction,
  leaveOrganizationAction,
} from '@/app/actions/organization-member-management';
import { LeaveOrganizationButton } from '@/components/organization/leave-organization-button';
import { OrganizationDangerZone } from '@/components/organization/organization-danger-zone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveOrgContext } from '@/lib/organization-context';

interface SettingsPageProps {
  readonly params: Promise<{
    orgSlug: string;
  }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { orgSlug } = await params;
  const requestHeaders = await headers();
  const orgContext = await resolveOrgContext(requestHeaders, orgSlug);

  if (!orgContext.ok) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>組織設定</CardTitle>
          <CardDescription>
            組織からの脱退や、owner の場合は権限変更と組織削除を行えます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveOrganizationButton
            organizationSlug={orgContext.organizationSlug}
            onLeaveOrganization={leaveOrganizationAction}
          />
        </CardContent>
      </Card>

      {orgContext.role === 'owner' ? (
        <OrganizationDangerZone
          organizationSlug={orgContext.organizationSlug}
          currentUserId={orgContext.userId}
          onChangeOwnRole={changeMemberRoleAction}
          onDeleteOrganization={deleteOrganizationAction}
        />
      ) : null}
    </div>
  );
}
