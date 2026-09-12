import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { organization, membership, type OrganizationRole } from '@/db/schema';

export type { OrganizationRole };

export type OrganizationAccess =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly userId: string;
      readonly role: OrganizationRole;
    }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'organization-not-found' | 'not-member' | 'insufficient-role';
    };

export interface RequireOrganizationAccessInput {
  readonly headers: Headers;
  readonly organizationId: string;
  readonly requiredRole?: OrganizationRole;
}

/**
 * サーバー専用の組織アクセス認可関数。
 * 既存 Better Auth セッション、組織存在、所属メンバーシップ、必要ロールを順次検証し、
 * 成功時のみ organizationId, userId, role を返す。
 */
export async function requireOrganizationAccess(input: RequireOrganizationAccessInput): Promise<OrganizationAccess> {
  const { headers, organizationId, requiredRole } = input;

  // 1. 認証セッション確認
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user) {
    return { ok: false, reason: 'unauthenticated' };
  }

  const userId = session.user.id;

  // 2. 組織存在確認
  const orgRecord = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  if (!orgRecord) {
    return { ok: false, reason: 'organization-not-found' };
  }

  // 3. メンバーシップ確認
  const memberRecord = await db.query.membership.findFirst({
    where: and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)),
  });

  if (!memberRecord) {
    return { ok: false, reason: 'not-member' };
  }

  // 4. ロール権限確認
  if (requiredRole && requiredRole === 'owner' && memberRecord.role !== 'owner') {
    return { ok: false, reason: 'insufficient-role' };
  }

  return {
    ok: true,
    organizationId,
    userId,
    role: memberRecord.role as OrganizationRole,
  };
}
