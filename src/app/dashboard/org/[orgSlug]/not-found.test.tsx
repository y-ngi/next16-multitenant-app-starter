import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrganizationNotFoundPage from './not-found';

describe('OrganizationNotFoundPage', () => {
  it('組織情報を含まない案内とマイページへの導線を表示すること', () => {
    const { container } = render(<OrganizationNotFoundPage />);

    expect(container.textContent).toContain('組織が見つからないか、所属していません。');
    expect(container.textContent).not.toContain('Acme Inc.');
    expect(container.textContent).not.toContain('acme');
    expect(container.textContent).not.toContain('missing-org');

    expect(
      screen.getByRole('link', {
        name: 'マイページへ戻る',
      })
    ).toHaveAttribute('href', '/dashboard/personal');
  });
});
