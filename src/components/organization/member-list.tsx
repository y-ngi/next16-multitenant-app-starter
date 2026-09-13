'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getOrganizationMembersAction } from '@/app/actions/organization';
import { toast } from 'sonner';

export interface OrganizationMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  displayName?: string | null;
  role: 'owner' | 'member';
  joinedAt: Date;
}

export interface MemberListProps {
  organizationId: string;
  refreshKey?: number;
}

export function MemberList({ organizationId, refreshKey }: MemberListProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    const fetchMembers = async () => {
      // Increment request ID to track the latest request
      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const result = await getOrganizationMembersAction(organizationId);

        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          if (result.ok && result.members) {
            setMembers(result.members as OrganizationMember[]);
          } else {
            setError(result.error || 'メンバーの取得に失敗しました');
            toast.error(result.error || 'メンバーの取得に失敗しました');
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

    fetchMembers();
  }, [organizationId, refreshKey]);

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

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            メンバーがいません。メンバーを招待してください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {members.map((member) => (
        <Card key={member.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">
                  {member.displayName || member.userName}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {member.userEmail}
                </CardDescription>
              </div>
              <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                {member.role === 'owner' ? 'オーナー' : 'メンバー'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {new Date(member.joinedAt).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })} に参加
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
