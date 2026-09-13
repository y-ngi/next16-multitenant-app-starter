import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthForm } from './auth-form';

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock the auth client
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: vi.fn(),
    },
    signIn: {
      email: vi.fn(),
    },
    signOut: vi.fn().mockImplementation(({ fetchOptions }: any = {}) => {
      return Promise.resolve().then(() => {
        fetchOptions?.onSuccess?.();
      });
    }),
    sendVerificationEmail: vi.fn(),
  },
  twoFactor: {
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('defaultEmail prop', () => {
    it('should display provided defaultEmail in email field', () => {
      render(<AuthForm defaultEmail="test@example.com" />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.value).toBe('test@example.com');
    });

    it('should allow email editing when isEmailLocked is false', async () => {
      render(<AuthForm defaultEmail="test@example.com" isEmailLocked={false} />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(false);
      expect(emailInput.disabled).toBe(false);

      // Should be able to change the value
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
      expect(emailInput.value).toBe('new@example.com');
    });
  });

  describe('isEmailLocked prop', () => {
    it('should make email field readOnly when isEmailLocked is true in signup mode', () => {
      render(<AuthForm defaultEmail="test@example.com" isEmailLocked={true} defaultIsSignUp={true} />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(true);
    });

    it('should prevent email editing when locked in signup mode', () => {
      render(<AuthForm defaultEmail="test@example.com" isEmailLocked={true} defaultIsSignUp={true} />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;

      // The readOnly attribute prevents user interaction
      expect(emailInput.readOnly).toBe(true);

      // Verify that the email is displayed
      expect(emailInput.value).toBe('test@example.com');

      // User cannot interact with the input due to readOnly
      // The readonly attribute is what matters for UX
      expect(emailInput).toHaveAttribute('readonly');
    });

    it('should display email in a visually locked state', () => {
      render(<AuthForm defaultEmail="test@example.com" isEmailLocked={true} defaultIsSignUp={true} />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(true);
      expect(emailInput).toHaveAttribute('readonly');
    });

    it('should allow email editing when mode is switched from signup to login even if isEmailLocked is true', async () => {
      render(<AuthForm defaultEmail="test@example.com" isEmailLocked={true} defaultIsSignUp={true} />);

      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(true);

      // Switch to login mode
      const switchButton = screen.getByText('すでにアカウントをお持ちの方（ログイン）');
      fireEvent.click(switchButton);

      // In login mode, email should be editable for normal login
      expect(emailInput.readOnly).toBe(false);
      expect(emailInput).not.toHaveAttribute('readonly');
    });
  });

  describe('defaultIsSignUp prop', () => {
    it('should show sign-up form when defaultIsSignUp is true', () => {
      render(<AuthForm defaultIsSignUp={true} />);

      expect(screen.getByLabelText('表示名')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('山田 太郎')).toBeInTheDocument();
    });

    it('should show login form when defaultIsSignUp is false', () => {
      render(<AuthForm defaultIsSignUp={false} />);

      // Display name should not be visible in login mode
      expect(screen.queryByLabelText('表示名')).not.toBeInTheDocument();
    });

    it('should default to login form when defaultIsSignUp is not provided', () => {
      render(<AuthForm />);

      expect(screen.queryByLabelText('表示名')).not.toBeInTheDocument();
    });
  });

  describe('callbackURL prop', () => {
    it('should use callbackURL when provided to signUp', async () => {
      const { authClient } = await import('@/lib/auth-client');

      const mockSignUp = vi.fn().mockResolvedValue({ error: null });
      (authClient.signUp.email as any) = mockSignUp;

      render(
        <AuthForm
          defaultIsSignUp={true}
          callbackURL="/invitations/accept?token=test-token"
        />
      );

      const displayNameInput = screen.getByPlaceholderText('山田 太郎');
      const emailInput = screen.getByPlaceholderText('user@example.com');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /アカウント作成/ });

      fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith(
          expect.objectContaining({
            callbackURL: '/invitations/accept?token=test-token',
          })
        );
      });
    });

    it('should redirect to callbackURL on successful login when callbackURL is provided', async () => {
      const { authClient } = await import('@/lib/auth-client');

      const mockSignIn = vi.fn().mockResolvedValue({
        error: null,
        data: {
          user: { id: '123', email: 'test@example.com' },
          // No twoFactorRedirect, so it should redirect immediately
        },
      });
      (authClient.signIn.email as any) = mockSignIn;

      render(
        <AuthForm
          callbackURL="/invitations/accept?token=test-token"
        />
      );

      const emailInput = screen.getByPlaceholderText('user@example.com');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /ログイン/ });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/invitations/accept?token=test-token');
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should redirect to callbackURL after 2FA verification when callbackURL is provided', async () => {
      const { authClient, twoFactor } = await import('@/lib/auth-client');

      const mockSignIn = vi.fn().mockResolvedValue({
        error: null,
        data: {
          user: { id: '123', email: 'test@example.com' },
          twoFactorRedirect: true,
        },
      });
      const mockSendOtp = vi.fn().mockResolvedValue({ error: null });
      const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });

      (authClient.signIn.email as any) = mockSignIn;
      (twoFactor.sendOtp as any) = mockSendOtp;
      (twoFactor.verifyOtp as any) = mockVerifyOtp;

      render(
        <AuthForm
          callbackURL="/invitations/accept?token=test-token"
        />
      );

      // Step 1: Login
      const emailInput = screen.getByPlaceholderText('user@example.com');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /ログイン/ });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSendOtp).toHaveBeenCalled();
      });

      // Step 2: Verify 2FA
      const otpInput = screen.getByPlaceholderText('123456');
      const otpSubmitButton = screen.getByRole('button', { name: /認証してログイン/ });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(otpSubmitButton);

      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith({ code: '123456' });
        expect(mockPush).toHaveBeenCalledWith('/invitations/accept?token=test-token');
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should redirect to /dashboard when callbackURL is not provided on successful login', async () => {
      const { authClient } = await import('@/lib/auth-client');

      const mockSignIn = vi.fn().mockResolvedValue({
        error: null,
        data: {
          user: { id: '123', email: 'test@example.com' },
        },
      });
      (authClient.signIn.email as any) = mockSignIn;

      render(<AuthForm />);

      const emailInput = screen.getByPlaceholderText('user@example.com');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /ログイン/ });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should redirect to /dashboard after 2FA verification when callbackURL is not provided', async () => {
      const { authClient, twoFactor } = await import('@/lib/auth-client');

      const mockSignIn = vi.fn().mockResolvedValue({
        error: null,
        data: {
          user: { id: '123', email: 'test@example.com' },
          twoFactorRedirect: true,
        },
      });
      const mockSendOtp = vi.fn().mockResolvedValue({ error: null });
      const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });

      (authClient.signIn.email as any) = mockSignIn;
      (twoFactor.sendOtp as any) = mockSendOtp;
      (twoFactor.verifyOtp as any) = mockVerifyOtp;

      render(<AuthForm />);

      // Step 1: Login
      const emailInput = screen.getByPlaceholderText('user@example.com');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /ログイン/ });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSendOtp).toHaveBeenCalled();
      });

      // Step 2: Verify 2FA
      const otpInput = screen.getByPlaceholderText('123456');
      const otpSubmitButton = screen.getByRole('button', { name: /認証してログイン/ });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(otpSubmitButton);

      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith({ code: '123456' });
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should preserve defaultEmail and callbackURL when returning from email sent step', async () => {
      const { authClient } = await import('@/lib/auth-client');

      const mockSignUp = vi.fn().mockResolvedValue({ error: null });
      const mockSendEmail = vi.fn().mockResolvedValue({ error: null });
      (authClient.signUp.email as any) = mockSignUp;
      (authClient.sendVerificationEmail as any) = mockSendEmail;

      render(
        <AuthForm
          defaultEmail="test@example.com"
          defaultIsSignUp={true}
          callbackURL="/invitations/accept?token=test-token"
        />
      );

      // Trigger signup to show email sent step
      const displayNameInput = screen.getByPlaceholderText('山田 太郎');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /アカウント作成/ });

      fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalled();
      });

      // Click "ログイン画面へ移動" button
      const backToLoginButton = screen.getByRole('button', { name: /ログイン画面へ移動/ });
      fireEvent.click(backToLoginButton);

      // After clicking, should return to login screen with email and callbackURL preserved
      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
        expect(emailInput.value).toBe('test@example.com');
      });

      // The callbackURL is preserved in component state, so when user logs in,
      // it should still use the preserved callbackURL
    });
  });

  describe('combined props', () => {
    it('should work with all props together (locked email, signup mode, callback)', () => {
      render(
        <AuthForm
          defaultEmail="invited@example.com"
          isEmailLocked={true}
          defaultIsSignUp={true}
          callbackURL="/invitations/accept?token=xyz"
        />
      );

      // Check email is locked
      const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
      expect(emailInput.value).toBe('invited@example.com');
      expect(emailInput.readOnly).toBe(true);

      // Check signup form is shown
      expect(screen.getByLabelText('表示名')).toBeInTheDocument();

      // Check button text is "アカウント作成" (check the submit button)
      const submitButtons = screen.getAllByRole('button');
      const accountCreateButton = submitButtons.find((btn) => btn.textContent?.includes('アカウント作成'));
      expect(accountCreateButton).toBeInTheDocument();
    });
  });

  describe('integration with invitation flow', () => {
    it('should handle invitation signup with locked email and callback', async () => {
      const { authClient } = await import('@/lib/auth-client');

      const mockSignUp = vi.fn().mockResolvedValue({ error: null });
      const mockSendEmail = vi.fn().mockResolvedValue({ error: null });
      (authClient.signUp.email as any) = mockSignUp;
      (authClient.sendVerificationEmail as any) = mockSendEmail;

      render(
        <AuthForm
          defaultEmail="newuser@example.com"
          isEmailLocked={true}
          defaultIsSignUp={true}
          callbackURL="/invitations/accept?token=invite123"
        />
      );

      const displayNameInput = screen.getByPlaceholderText('山田 太郎');
      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordInput = passwordInputs.find(
        (input) => (input as HTMLInputElement).type === 'password'
      ) as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /アカウント作成/ });

      fireEvent.change(displayNameInput, { target: { value: 'New User' } });
      fireEvent.change(passwordInput, { target: { value: 'securepass123' } });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'newuser@example.com',
          password: 'securepass123',
          name: 'New User',
          callbackURL: '/invitations/accept?token=invite123',
        });
      });
    });
  });

  describe('hasExistingSession prop', () => {
    it('should sign out and show a signing-out state instead of the form when hasExistingSession is true', () => {
      render(<AuthForm defaultEmail="test@example.com" hasExistingSession={true} />);

      expect(authClient.signOut).toHaveBeenCalled();
      expect(screen.getByText('ログアウトしています...')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('user@example.com')).not.toBeInTheDocument();

      // Allow the pending signOut microtask to flush inside act() before the test ends.
      return waitFor(() => {
        expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
      });
    });

    it('should show the form immediately when hasExistingSession is false', () => {
      render(<AuthForm defaultEmail="test@example.com" hasExistingSession={false} />);

      expect(authClient.signOut).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
    });

    it('should reveal the form after sign-out completes', async () => {
      render(<AuthForm defaultEmail="test@example.com" hasExistingSession={true} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
      });
      expect(screen.queryByText('ログアウトしています...')).not.toBeInTheDocument();
    });
  });
});
