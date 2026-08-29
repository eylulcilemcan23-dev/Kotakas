import { config } from './config.js';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

export function buildPasswordResetUrl(token) {
  if (!config.appPublicBaseUrl) throw new Error('APP_PUBLIC_BASE_URL missing');
  const url = new URL('/reset-password.html', `${config.appPublicBaseUrl}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

export function passwordResetEmailContent(resetUrl) {
  const safeUrl = esc(resetUrl);
  return {
    subject: 'KOTAKAS şifre sıfırlama bağlantın',
    text: `KOTAKAS hesabının şifresini sıfırlamak için bu bağlantıyı kullan: ${resetUrl}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>KOTAKAS şifre sıfırlama</h2><p>Şifreni yenilemek için aşağıdaki güvenli bağlantıyı kullan.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none">Şifremi Sıfırla</a></p><p style="color:#6b7280;font-size:13px">Bu isteği sen yapmadıysan e-postayı yok sayabilirsin. Bağlantı kısa süre içinde geçersiz olur ve yalnız bir kez kullanılabilir.</p></div>`,
  };
}

export async function sendPasswordResetEmail({ to, token }) {
  if (!config.emailDeliveryReady) throw new Error('email delivery not ready');
  if (config.emailProvider !== 'resend') throw new Error('unsupported email provider');
  const resetUrl = buildPasswordResetUrl(token);
  const content = passwordResetEmailContent(resetUrl);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.emailApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [String(to).trim().toLowerCase()],
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`email provider rejected request:${response.status}`);
  return { id: body?.id || null, provider: 'resend' };
}
