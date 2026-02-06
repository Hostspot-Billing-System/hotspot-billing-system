import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requireEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export async function sendLoginVerificationCodeEmail({ to, code, expiresMinutes }) {
  const from = requireEnv('EMAIL_FROM');
  // Validate key presence even though the client is reusable.
  requireEnv('RESEND_API_KEY');
  const recipient = String(to);

  const safeCode = escapeHtml(code);
  const safeExpiresMinutes = escapeHtml(expiresMinutes);

  const subject = 'Login Verification Code – Omega WiFi';

  const text = `Your Omega WiFi verification code is:\n\n${code}\n\nThis code expires in ${expiresMinutes} minutes.\nDo not share it with anyone.`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Omega WiFi Verification Code</title>
    <style>
      /* Web font (best effort). Some email clients may ignore this and fall back. */
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    </style>
  </head>
  <body style="margin:0; padding:0; background:#f3f5f9; font-family:'Nunito', Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      Your verification code is ${safeCode}.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f5f9;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:100%; max-width:520px;">
            <tr>
              <td style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(17,24,39,0.12); font-family:'Nunito', Arial, Helvetica, sans-serif;">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding:44px 24px; background:linear-gradient(180deg,#1f5eff 0%, #0b43d6 100%);">
                      <div style="font-family:'Nunito', Arial, Helvetica, sans-serif; font-size:32px; font-weight:900; letter-spacing:2.5px; color:#ffffff; text-transform:uppercase; line-height:1.1;">
                        OMEGA HOTSPOT
                      </div>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="background:#ffffff; padding:26px 22px;">
                      <div style="font-family:'Nunito', Arial, Helvetica, sans-serif; text-align:center;">
                        <div style="font-size:22px; font-weight:800; color:#111827; margin:0 0 10px;">Your Verification Code</div>
                        <div style="font-size:14px; font-weight:500; color:#6b7280; margin:0 0 18px;">Use the code below to verify your access</div>

                        <div style="margin:0 auto 18px; padding:18px 14px; width:100%; max-width:380px; background:#eaf2ff; border-radius:10px;">
                          <div style="font-size:34px; letter-spacing:6px; font-weight:900; color:#1f5eff;">${safeCode}</div>
                        </div>

                        <div style="font-size:13px; color:#6b7280; margin:0 0 6px;">Please enter this code to continue accessing Omega WiFi</div>
                        <div style="font-size:12px; color:#9ca3af; margin:0;">This code expires in <strong>${safeExpiresMinutes} minutes</strong>.</div>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#ffffff; padding:0 22px 22px;">
                      <div style="height:1px; background:#eef2f7; width:100%;"></div>
                      <div style="font-family:'Nunito', Arial, Helvetica, sans-serif; text-align:center; font-size:12px; color:#9ca3af; margin-top:14px;">
                        If you didn't request this code, you can safely ignore this email.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const { data, error } = await resend.emails.send({
    from,
    to: recipient,
    subject,
    text,
    html,
  });

  if (error) {
    // Avoid leaking sensitive data (OTP). Resend error is safe to show.
    throw new Error(error.message || 'Failed to send OTP email');
  }

  if (!data?.id) {
    throw new Error('Failed to send OTP email');
  }
}
