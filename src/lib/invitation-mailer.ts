import nodemailer from 'nodemailer';

// Create Nodemailer transporter for sending invitation emails
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
});

export interface SendInvitationEmailParams {
  readonly toEmail: string;
  readonly organizationName: string;
  readonly inviterName: string;
  readonly inviteLink: string;
}

export interface SendAcceptanceNotificationParams {
  readonly toEmail: string;
  readonly organizationName: string;
  readonly newMemberName: string;
  readonly newMemberEmail: string;
}

/**
 * Send an invitation email to a new member with the invitation link.
 * Returns true if the email was sent successfully, false otherwise.
 * Catches any errors and does not throw.
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<boolean> {
  const { toEmail, organizationName, inviterName, inviteLink } = params;

  try {
    const info = await transporter.sendMail({
      from: '"組織招待" <noreply@example.com>',
      to: toEmail,
      subject: `【組織への招待】${organizationName}へのご招待`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>${organizationName}へのご招待</h2>
          <p>${toEmail} 様</p>
          <p><strong>${inviterName}</strong> さんが、あなたを <strong>${organizationName}</strong> へ招待しました。</p>
          <p>以下のリンクをクリックして、招待を承認または拒否してください。</p>
          <p style="margin: 20px 0;">
            <a href="${inviteLink}" style="padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px; display: inline-block;">
              招待を確認する
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">
            このリンクは招待先メールアドレス（${toEmail}）のアカウントでのみ使用できます。<br>
            他のアカウントで開いた場合は、このメールアドレスで再度ログインしてください。
          </p>
        </div>
      `,
    });

    console.log('[Invitation Email] 送信成功:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Invitation Email] メール送信失敗:', error);
    return false;
  }
}

/**
 * Send an acceptance notification email to the inviter.
 * Notifies them that the invited member has accepted the invitation and joined the organization.
 * Returns true if the email was sent successfully, false otherwise.
 * Catches any errors and does not throw.
 */
export async function sendAcceptanceNotificationEmail(
  params: SendAcceptanceNotificationParams
): Promise<boolean> {
  const { toEmail, organizationName, newMemberName, newMemberEmail } = params;

  try {
    const info = await transporter.sendMail({
      from: '"組織通知" <noreply@example.com>',
      to: toEmail,
      subject: `【メンバー所属完了】${organizationName}へ${newMemberName}さんが参加しました`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>${organizationName}へのメンバー所属完了</h2>
          <p>お疲れ様です。</p>
          <p>あなたが招待した <strong>${newMemberName}</strong> さん（<strong>${newMemberEmail}</strong>）が <strong>${organizationName}</strong> への所属を承認しました。</p>
          <p>これでメンバーはチームの一員として組織内のリソースにアクセスできるようになります。</p>
        </div>
      `,
    });

    console.log('[Acceptance Notification Email] 送信成功:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Acceptance Notification Email] メール送信失敗:', error);
    return false;
  }
}
