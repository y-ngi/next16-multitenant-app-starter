'use server';

import { headers } from 'next/headers';
import {
  createOrganization as createOrganizationService,
  getUserOrganizations as getUserOrganizationsService,
  createInvitation as createInvitationService,
  getInvitations as getInvitationsService,
  type CreateOrganizationInput,
  type GetUserOrganizationsInput,
  type CreateInvitationInput,
  type GetInvitationsInput,
} from '@/lib/organization-lifecycle';

/**
 * Server action to create a new organization
 */
export async function createOrganizationAction(
  name: string,
  slug: string
) {
  const headersData = await headers();
  return createOrganizationService({
    headers: headersData,
    name,
    slug,
  } as CreateOrganizationInput);
}

/**
 * Server action to get all organizations for the authenticated user
 */
export async function getUserOrganizationsAction() {
  const headersData = await headers();
  return getUserOrganizationsService({
    headers: headersData,
  } as GetUserOrganizationsInput);
}

/**
 * Server action to create an invitation for a user to join an organization
 */
export async function createInvitationAction(
  organizationId: string,
  email: string
) {
  const headersData = await headers();
  
  // Get the base URL from the origin header
  const origin = headersData.get('origin') || headersData.get('referer');
  let baseURL = 'https://localhost:3000'; // Default fallback
  if (origin) {
    try {
      const url = new URL(origin);
      baseURL = url.origin;
    } catch {
      // If Origin parsing fails, use default
    }
  }

  return createInvitationService({
    headers: headersData,
    organizationId,
    email,
    baseURL,
  } as CreateInvitationInput);
}

/**
 * Server action to get all invitations for an organization
 */
export async function getInvitationsAction(
  organizationId: string
) {
  const headersData = await headers();
  return getInvitationsService({
    headers: headersData,
    organizationId,
  } as GetInvitationsInput);
}
