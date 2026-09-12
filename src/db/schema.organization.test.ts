import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { membership, organization, user } from './schema';

const dialect = new PgDialect();

function hasUniqueConstraint(table: ReturnType<typeof getTableConfig>, columnNames: readonly string[]): boolean {
  return table.uniqueConstraints.some(
    (constraint) =>
      constraint.columns.length === columnNames.length &&
      constraint.columns.every((column, index) => column.name === columnNames[index]),
  );
}

describe('organization schema contract', () => {
  it('defines an organization with an identifier, name, and unique slug', () => {
    const config = getTableConfig(organization);

    expect(config.name).toBe('organization');
    expect(organization.id.primary).toBe(true);
    expect(organization.id.notNull).toBe(true);
    expect(organization.name.notNull).toBe(true);
    expect(organization.slug.notNull).toBe(true);
    expect(hasUniqueConstraint(config, ['slug'])).toBe(true);
  });

  it('defines memberships between users and organizations without orphaning on deletion', () => {
    const config = getTableConfig(membership);
    const foreignKeys = config.foreignKeys.map((foreignKey) => ({
      ...foreignKey.reference(),
      onDelete: foreignKey.onDelete,
    }));

    expect(config.name).toBe('membership');
    expect(membership.id.primary).toBe(true);
    expect(membership.organizationId.notNull).toBe(true);
    expect(membership.userId.notNull).toBe(true);
    expect(membership.displayName).toBeDefined();
    expect(membership.role.notNull).toBe(true);
    expect(membership.createdAt.notNull).toBe(true);
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: [membership.organizationId],
          foreignColumns: [organization.id],
          foreignTable: organization,
          onDelete: 'cascade',
        }),
        expect.objectContaining({
          columns: [membership.userId],
          foreignColumns: [user.id],
          foreignTable: user,
          onDelete: 'cascade',
        }),
      ]),
    );
  });

  it('restricts membership roles to owner and member', () => {
    const config = getTableConfig(membership);
    const hasOnlyRoleEnumValues =
      membership.role.enumValues?.length === 2 &&
      membership.role.enumValues.includes('owner') &&
      membership.role.enumValues.includes('member') &&
      membership.role.getSQLType() !== 'text';
    const hasRoleCheck = config.checks.some((constraint) =>
      /role"\s+in\s+\('owner',\s*'member'\)/i.test(dialect.sqlToQuery(constraint.value).sql),
    );

    expect(hasOnlyRoleEnumValues || hasRoleCheck).toBe(true);
  });

  it('prevents duplicate membership for the same user and organization', () => {
    const config = getTableConfig(membership);

    expect(hasUniqueConstraint(config, ['organization_id', 'user_id'])).toBe(true);
  });
});
