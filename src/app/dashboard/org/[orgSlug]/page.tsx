import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveOrgContext } from '@/lib/organization-context';

interface OrganizationContextPageProps {
  readonly params: Promise<{
    orgSlug: string;
  }>;
}

const roleLabels = {
  owner: 'オーナー',
  member: 'メンバー',
} as const;

export default async function OrganizationContextPage({
  params,
}: OrganizationContextPageProps) {
  const { orgSlug } = await params;
  const orgContext = await resolveOrgContext(await headers(), orgSlug);

  if (!orgContext.ok) {
    notFound();
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{orgContext.organizationName}</CardTitle>
            <CardDescription>組織コンテキストを確認できます。</CardDescription>
          </div>
          <Badge variant={orgContext.role === 'owner' ? 'default' : 'secondary'}>
            {roleLabels[orgContext.role]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted-foreground">組織名</dt>
            <dd className="font-medium">{orgContext.organizationName}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">slug</dt>
            <dd className="font-medium">{orgContext.organizationSlug}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">あなたのロール</dt>
            <dd className="font-medium">{roleLabels[orgContext.role]}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
