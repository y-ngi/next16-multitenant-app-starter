'use server';

import { headers } from 'next/headers';
import {
  listMembersForViewer as listMembersForViewerService,
  removeMember as removeMemberService,
  changeMemberRole as changeMemberRoleService,
  cancelInvitation as cancelInvitationService,
  leaveOrganization as leaveOrganizationService,
  deleteOrganization as deleteOrganizationService,
  type MemberManagementActionInput,
  type OrganizationRole,
} from '@/lib/organization-member-management';

type RemoveMemberInput = MemberManagementActionInput & {
  readonly targetUserId: string;
};

type ChangeMemberRoleInput = MemberManagementActionInput & {
  readonly targetUserId: string;
  readonly newRole: OrganizationRole;
};

type CancelInvitationInput = MemberManagementActionInput & {
  readonly invitationId: string;
};

/**
 * Server action to list members for the current viewer
 */
export async function listMembersForViewerAction(slug: string) {
  const headersData = await headers();
  return listMembersForViewerService({
    headers: headersData,
    slug,
  } as MemberManagementActionInput);
}

/**
 * Server action to remove a member from an organization
 */
export async function removeMemberAction(
  slug: string,
  targetUserId: string
) {
  const headersData = await headers();
  return removeMemberService({
    headers: headersData,
    slug,
    targetUserId,
  } as RemoveMemberInput);
}

/**
 * Server action to change a member role in an organization
 */
export async function changeMemberRoleAction(
  slug: string,
  targetUserId: string,
  newRole: OrganizationRole
) {
  const headersData = await headers();
  return changeMemberRoleService({
    headers: headersData,
    slug,
    targetUserId,
    newRole,
  } as ChangeMemberRoleInput);
}

/**
 * Server action to cancel an invitation for an organization
 */
export async function cancelInvitationAction(
  slug: string,
  invitationId: string
) {
  const headersData = await headers();
  return cancelInvitationService({
    headers: headersData,
    slug,
    invitationId,
  } as CancelInvitationInput);
}

/**
 * Server action to leave an organization
 */
export async function leaveOrganizationAction(slug: string) {
  const headersData = await headers();
  return leaveOrganizationService({
    headers: headersData,
    slug,
  } as MemberManagementActionInput);
}

/**
 * Server action to delete an organization
 */
export async function deleteOrganizationAction(slug: string) {
  const headersData = await headers();
  return deleteOrganizationService({
    headers: headersData,
    slug,
  } as MemberManagementActionInput);
}
