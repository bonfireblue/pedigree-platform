import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified domain email, or onboarding@resend.dev for testing
const FROM_EMAIL = process.env.EMAIL_FROM || 'Pedigree Platform <onboarding@resend.dev>';

export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  personName: string;
  inviteUrl: string;
}) {
  const { to, inviterName, personName, inviteUrl } = params;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `${inviterName} invited you to join the family tree / ${inviterName} mời bạn tham gia cây gia đình`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited! / Bạn được mời!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              <strong>${inviterName}</strong> has invited you to claim your profile as <strong>${personName}</strong> in their family tree.
            </p>
            <p style="font-size: 16px; margin-bottom: 20px; color: #6b7280;">
              <strong>${inviterName}</strong> đã mời bạn nhận hồ sơ của mình với tên <strong>${personName}</strong> trong cây gia đình của họ.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Accept Invitation / Chấp nhận lời mời
              </a>
            </div>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
              If you didn't expect this invitation, you can safely ignore this email.<br>
              Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email này.
            </p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}) {
  const { to, resetUrl } = params;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: 'Reset your password / Đặt lại mật khẩu',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1f2937; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset / Đặt lại mật khẩu</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              We received a request to reset your password.<br>
              <span style="color: #6b7280;">Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu của bạn.</span>
            </p>
            <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
              Click the button below to create a new password. This link will expire in 1 hour.<br>
              Nhấn vào nút bên dưới để tạo mật khẩu mới. Liên kết này sẽ hết hạn sau 1 giờ.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #1f2937; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Reset Password / Đặt lại mật khẩu
              </a>
            </div>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; text-align: center;">
              If you didn't request this password reset, you can safely ignore this email.<br>
              Nếu bạn không yêu cầu đặt lại mật khẩu này, bạn có thể bỏ qua email này.
            </p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
