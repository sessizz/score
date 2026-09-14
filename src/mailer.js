// Email service using Resend API (Native fetch, zero npm dependencies)

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Voleybol Skorboard <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Send email using Resend REST API
 */
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`\n=======================================================`);
    console.log(`⚠️ RESEND_API_KEY tanımlanmamış. Konsol Modu Aktif:`);
    console.log(`✉️ Kime: ${to}`);
    console.log(`📋 Konu: ${subject}`);
    console.log(`=======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend API Hatası:', data);
      return { success: false, error: data.message || 'E-posta gönderilemedi.' };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('Resend e-posta gönderme istisnası:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send verification email with 6-digit code and direct link
 */
async function sendVerificationEmail(email, code) {
  const verifyLink = `${APP_URL}/verify?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;

  console.log(`\n=======================================================`);
  console.log(`✉️ [E-POSTA DOĞRULAMA KODU]`);
  console.log(`👤 Alıcı: ${email}`);
  console.log(`🔑 Kod: ${code}`);
  console.log(`🔗 Link: ${verifyLink}`);
  console.log(`=======================================================\n`);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b1120; color: #f8fafc; margin: 0; padding: 24px; }
        .container { max-width: 540px; margin: 0 auto; background: #131d35; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #002d72 0%, #00173d 100%); padding: 28px 24px; text-align: center; border-bottom: 3px solid #ffed00; }
        .title { color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; }
        .subtitle { color: #94a3b8; font-size: 13px; margin-top: 6px; }
        .content { padding: 32px 28px; text-align: center; }
        .code-box { background: #0b1120; border: 2px dashed #ffed00; border-radius: 8px; padding: 18px 24px; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #ffed00; margin: 24px 0; display: inline-block; }
        .btn { display: inline-block; background: #ffed00; color: #002d72; padding: 14px 28px; font-weight: 800; text-decoration: none; border-radius: 8px; margin: 12px 0 20px; font-size: 15px; }
        .footer { padding: 20px 24px; background: #0b1120; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="title">🏐 Voleybol Skorboard Sistemi</div>
          <div class="subtitle">E-posta Doğrulama Kodu</div>
        </div>
        <div class="content">
          <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-top: 0;">
            Merhaba,<br>
            Voleybol Skorboard hesabınızı aktif hale getirmek için aşağıdaki 6 haneli doğrulama kodunu kullanın veya butona tıklayın:
          </p>

          <div class="code-box">${code}</div>

          <div>
            <a href="${verifyLink}" class="btn">Hesabımı Doğrula</a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">
            Bu kod 15 dakika boyunca geçerlidir. Bu talebi siz yapmadıysanız bu mesajı görmezden gelebilirsiniz.
          </p>
        </div>
        <div class="footer">
          Voleybol Skorboard & Canlı OBS Yayın Sistemi
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `🏐 ${code} - Voleybol Skorboard E-posta Doğrulama Kodu`,
    html
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail
};
