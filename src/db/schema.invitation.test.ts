import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { invitation, invitationStatusEnum, organization, user } from './schema';

const dialect = new PgDialect();

describe('invitation schema contract', () => {
  it('defines an invitation status enum with all required statuses', () => {
    expect(invitationStatusEnum.enumValues).toEqual(['pending', 'accepted', 'rejected', 'expired', 'canceled']);
  });

  it('defines an invitation with id, organizationId, email, role, token, status, inviterId, expiresAt, createdAt, and updatedAt', () => {
    const config = getTableConfig(invitation);

    expect(config.name).toBe('invitation');
    expect(invitation.id.primary).toBe(true);
    expect(invitation.id.notNull).toBe(true);
    expect(invitation.organizationId.notNull).toBe(true);
    expect(invitation.email.notNull).toBe(true);
    expect(invitation.role.notNull).toBe(true);
    expect(invitation.token.notNull).toBe(true);
    expect(invitation.status.notNull).toBe(true);
    expect(invitation.inviterId.notNull).toBe(true);
    expect(invitation.expiresAt.notNull).toBe(true);
    expect(invitation.createdAt.notNull).toBe(true);
    expect(invitation.updatedAt.notNull).toBe(true);
  });

  it('enforces unique token constraint', () => {
    const config = getTableConfig(invitation);
    
    // Check if token has isUnique property set to true or check uniqueConstraints
    const hasColumnUnique = invitation.token.isUnique === true;
    const hasConstraint = config.uniqueConstraints.some(
      (constraint) =>
        constraint.columns.length === 1 &&
        constraint.columns[0].name === 'token',
    );

    expect(hasColumnUnique || hasConstraint).toBe(true);
  });

  it('sets default status to pending', () => {
    expect(invitation.status.default).toBe('pending');
  });

  it('sets default role to member', () => {
    expect(invitation.role.default).toBe('member');
  });

  it('references organization with cascade delete', () => {
    const config = getTableConfig(invitation);
    const foreignKeys = config.foreignKeys.map((foreignKey) => ({
      ...foreignKey.reference(),
      onDelete: foreignKey.onDelete,
    }));

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: [invitation.organizationId],
          foreignColumns: [organization.id],
          foreignTable: organization,
          onDelete: 'cascade',
        }),
      ]),
    );
  });

  it('references inviter user with cascade delete', () => {
    const config = getTableConfig(invitation);
    const foreignKeys = config.foreignKeys.map((foreignKey) => ({
      ...foreignKey.reference(),
      onDelete: foreignKey.onDelete,
    }));

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: [invitation.inviterId],
          foreignColumns: [user.id],
          foreignTable: user,
          onDelete: 'cascade',
        }),
      ]),
    );
  });

  it('creates indexes on organizationId, email, and token', () => {
    const config = getTableConfig(invitation);

    // Check if indexes exist by name
    const hasOrgIdIndex = config.indexes.some((idx: any) => idx.config?.name === 'invitation_organization_id_idx');
    const hasEmailIndex = config.indexes.some((idx: any) => idx.config?.name === 'invitation_email_idx');
    const hasTokenIndex = config.indexes.some((idx: any) => idx.config?.name === 'invitation_token_idx');

    expect(hasOrgIdIndex).toBe(true);
    expect(hasEmailIndex).toBe(true);
    expect(hasTokenIndex).toBe(true);
  });

  it('restricts status to valid invitation statuses', () => {
    const config = getTableConfig(invitation);
    const hasOnlyStatusEnumValues =
      invitation.status.enumValues?.length === 5 &&
      invitation.status.enumValues.includes('pending') &&
      invitation.status.enumValues.includes('accepted') &&
      invitation.status.enumValues.includes('rejected') &&
      invitation.status.enumValues.includes('expired') &&
      invitation.status.enumValues.includes('canceled') &&
      invitation.status.getSQLType() !== 'text';
    const hasStatusCheck = config.checks.some((constraint) =>
      /status"\s+in\s+\('pending',\s*'accepted',\s*'rejected',\s*'expired',\s*'canceled'\)/i.test(
        dialect.sqlToQuery(constraint.value).sql,
      ),
    );

    expect(hasOnlyStatusEnumValues || hasStatusCheck).toBe(true);
  });
});
