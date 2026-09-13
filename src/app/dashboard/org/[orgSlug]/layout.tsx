import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveOrgContext } from '@/lib/organization-context';

interface OrganizationLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{
    orgSlug: string;
  }>;
}

export default async function OrganizationLayout({ children, params }: OrganizationLayoutProps) {
  const { orgSlug } = await params;
  const orgContext = await resolveOrgContext(await headers(), orgSlug);

  if (!orgContext.ok) {
    switch (orgContext.reason) {
      case 'unauthenticated':
        redirect('/login');
      case 'organization-not-found':
      case 'not-member':
      case 'insufficient-role':
        notFound();
    }
  }

  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <p className="text-muted-foreground text-sm">現在の組織</p>
          <h1 className="text-xl font-semibold">{orgContext.organizationName}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
