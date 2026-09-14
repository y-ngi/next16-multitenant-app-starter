import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OrganizationNotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            組織が見つからないか、所属していません。
          </p>
          <Link href="/dashboard/personal">
            <Button className="w-full">マイページへ戻る</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
