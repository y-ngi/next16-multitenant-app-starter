import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('InvitationAcceptPage source', () => {
  const pageSource = readFileSync(path.resolve(process.cwd(), 'src/app/invitations/accept/page.tsx'), 'utf8');

  it('戻り先リンクが /dashboard/personal を使うこと', () => {
    expect(pageSource).toContain('<Link href="/dashboard/personal">');
  });

  it('旧 /dashboard への戻り先リンクを残さないこと', () => {
    expect(pageSource).not.toContain('<Link href="/dashboard">');
  });
});
