import { requireOrganizationAccessBySlug, type OrganizationRole } from '@/lib/organization-authz';
import { getOrganizationMembers } from '@/lib/organization-lifecycle';

export type { OrganizationRole };

export interface MemberManagementActionInput {
  readonly headers: Headers;
  readonly slug: string;
}

export type MemberManagementFailureReason =
  | 'unauthenticated'
  | 'organization-not-found'
  | 'not-member'
  | 'insufficient-role'
  | 'last-owner-protection'
  | 'invitation-not-pending'
  | 'not-found';

export interface ViewableMember {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail?: string;
  readonly displayName?: string | null;
  readonly role: OrganizationRole;
  readonly joinedAt: Date;
}

export type ListMembersResult =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly viewerRole: OrganizationRole;
      readonly members: readonly ViewableMember[];
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

export async function listMembersForViewer(input: MemberManagementActionInput): Promise<ListMembersResult> {
  const accessResult = await requireOrganizationAccessBySlug({
    headers: input.headers,
    slug: input.slug,
  });

  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason,
    };
  }

  const membersResult = await getOrganizationMembers({
    headers: input.headers,
    organizationId: accessResult.organizationId,
  });

  if (!membersResult.ok) {
    console.error('[listMembersForViewer] Failed to fetch organization members:', membersResult.error);
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  if (!membersResult.members) {
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  const members: readonly ViewableMember[] =
    accessResult.role === 'owner'
      ? membersResult.members
      : membersResult.members.map((member) => ({
          id: member.id,
          userId: member.userId,
          userName: member.userName,
          displayName: member.displayName,
          role: member.role,
          joinedAt: member.joinedAt,
        }));

  return {
    ok: true,
    organizationId: accessResult.organizationId,
    viewerRole: accessResult.role,
    members,
  };
}
