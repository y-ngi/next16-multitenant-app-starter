import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OrganizationSection } from '@/components/organization/organization-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';

export default async function PersonalOrganizationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return (
    <main className="bg-muted/40 min-h-screen p-4">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>所属組織</CardTitle>
            <CardDescription>あなたが所属している組織を選択できます。</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationSection />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
