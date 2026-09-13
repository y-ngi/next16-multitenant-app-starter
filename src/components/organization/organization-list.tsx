'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserOrganizationsAction } from '@/app/actions/organization';
import { toast } from 'sonner';

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  joinedAt: Date;
}

export interface OrganizationListProps {
  refreshKey?: number;
}

export function OrganizationList({ refreshKey }: OrganizationListProps) {
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    const fetchOrganizations = async () => {
      // Increment request ID to track the latest request
      const currentRequestId = ++requestIdRef.current;
      
      setIsLoading(true);
      setError(null);

      try {
        const result = await getUserOrganizationsAction();

        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          if (result.ok && result.organizations) {
            setOrganizations(result.organizations as UserOrganization[]);
          } else {
            setError(result.error || '組織の取得に失敗しました');
            toast.error(result.error || '組織の取得に失敗しました');
          }
        }
      } catch (err) {
        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          const message = err instanceof Error ? err.message : '予期しないエラーが発生しました';
          setError(message);
          toast.error(message);
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchOrganizations();
  }, [refreshKey]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-sm text-red-700">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            所属している組織がありません。新しい組織を作成してください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {organizations.map((org) => (
        <Card key={org.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{org.name}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {org.slug}
                </CardDescription>
              </div>
              <Badge variant={org.role === 'owner' ? 'default' : 'secondary'}>
                {org.role === 'owner' ? 'オーナー' : 'メンバー'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {new Date(org.joinedAt).toLocaleDateString('ja-JP')} に参加
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
