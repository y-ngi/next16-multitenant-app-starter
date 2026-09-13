'use server';

import { headers } from 'next/headers';
import {
  createOrganization as createOrganizationService,
  getUserOrganizations as getUserOrganizationsService,
  type CreateOrganizationInput,
  type GetUserOrganizationsInput,
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
