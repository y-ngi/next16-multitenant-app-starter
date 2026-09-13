import { cache } from 'react';

import { requireOrganizationAccessBySlug } from '@/lib/organization-authz';

export const resolveOrgContext = cache(async (headers: Headers, slug: string) =>
  requireOrganizationAccessBySlug({ headers, slug })
);
