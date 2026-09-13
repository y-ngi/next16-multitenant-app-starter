import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateOrganizationDialog } from './create-organization-dialog';

// Mock the server actions
vi.mock('@/app/actions/organization', () => ({
  createOrganizationAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { createOrganizationAction } from '@/app/actions/organization';
import { toast } from 'sonner';

describe('CreateOrganizationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ボタンをクリックするとフォームが表示されること', () => {
    render(<CreateOrganizationDialog />);

    const button = screen.getByText('組織を作成');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    const titleElement = screen.getByText('新しい組織を作成');
    expect(titleElement).toBeInTheDocument();
  });

  it('正しいフォームフィールドが表示されること', () => {
    render(<CreateOrganizationDialog />);

    fireEvent.click(screen.getByText('組織を作成'));

    expect(screen.getByLabelText('組織名')).toBeInTheDocument();
    expect(screen.getByLabelText('スラッグ')).toBeInTheDocument();
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
    expect(screen.getByText('作成')).toBeInTheDocument();
  });

  it('フォーム入力が機能すること', async () => {
    render(<CreateOrganizationDialog />);

    fireEvent.click(screen.getByText('組織を作成'));

    const nameInput = screen.getByLabelText('組織名') as HTMLInputElement;
    const slugInput = screen.getByLabelText('スラッグ') as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Test Org' } });
    fireEvent.change(slugInput, { target: { value: 'test-org' } });

    expect(nameInput.value).toBe('Test Org');
    expect(slugInput.value).toBe('test-org');
  });

  it('成功時に成功メッセージを表示すること', async () => {
    vi.mocked(createOrganizationAction).mockResolvedValueOnce({
      ok: true,
      organization: {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
      },
    });

    const onSuccess = vi.fn();
    render(<CreateOrganizationDialog onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText('組織を作成'));

    const nameInput = screen.getByLabelText('組織名');
    const slugInput = screen.getByLabelText('スラッグ');

    fireEvent.change(nameInput, { target: { value: 'Test Org' } });
    fireEvent.change(slugInput, { target: { value: 'test-org' } });

    const submitButton = screen.getByText('作成');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('組織を作成しました');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('エラー時にエラーメッセージを表示すること', async () => {
    vi.mocked(createOrganizationAction).mockResolvedValueOnce({
      ok: false,
      error: 'Organization slug already exists',
    });

    render(<CreateOrganizationDialog />);

    fireEvent.click(screen.getByText('組織を作成'));

    const nameInput = screen.getByLabelText('組織名');
    const slugInput = screen.getByLabelText('スラッグ');

    fireEvent.change(nameInput, { target: { value: 'Test Org' } });
    fireEvent.change(slugInput, { target: { value: 'test-org' } });

    const submitButton = screen.getByText('作成');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Organization slug already exists');
    });
  });

  it('キャンセルボタンをクリックするとフォームが閉じられること', () => {
    render(<CreateOrganizationDialog />);

    fireEvent.click(screen.getByText('組織を作成'));
    expect(screen.getByText('新しい組織を作成')).toBeInTheDocument();

    fireEvent.click(screen.getByText('キャンセル'));
    expect(screen.queryByText('新しい組織を作成')).not.toBeInTheDocument();
  });
});
