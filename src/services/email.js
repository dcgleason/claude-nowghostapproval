const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Danny Gleason <noreply@' + (process.env.EMAIL_DOMAIN || 'yourdomain.com') + '>';
const DANNY_EMAIL = process.env.DANNY_EMAIL || 'danny.c.gleason@gmail.com';

function truncate(text, max = 300) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function sendApprovalEmail({ clientEmail, clientName, postContent, approvalToken }) {
  const approvalUrl = `${process.env.APP_URL}/review/${approvalToken}`;
  const preview = truncate(postContent);

  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: 'Your LinkedIn post is ready for review',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#0a66c2;padding:28px 32px">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:600">Your LinkedIn Post</h1>
      <p style="color:#cce4ff;margin:6px 0 0;font-size:14px">Ready for your review</p>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin:0 0 8px">Hi ${clientName},</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px">Your post is ready. Please review it below and let me know if you'd like to publish it or request changes.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:28px">
        <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap">${preview}</p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${approvalUrl}" style="display:inline-block;background:#0a66c2;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600">Review &amp; Approve Post →</a>
      </div>
      <p style="color:#6b7280;font-size:13px;text-align:center;margin:0">This link expires in 7 days.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

async function sendDannyApprovedEmail({ clientName, postId, comment }) {
  await resend.emails.send({
    from: FROM,
    to: DANNY_EMAIL,
    subject: `✅ ${clientName} approved a post`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#16a34a;margin:0 0 16px">Post Approved ✅</h2>
    <p style="color:#374151;font-size:15px"><strong>${clientName}</strong> approved post #${postId}.</p>
    ${comment ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0;color:#166534;font-size:14px"><strong>Comment:</strong> ${comment}</p></div>` : ''}
    <a href="${process.env.APP_URL}/dashboard/index.html" style="display:inline-block;margin-top:16px;background:#0a66c2;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">Post to LinkedIn →</a>
  </div>
</body>
</html>`,
  });
}

async function sendDannyRejectedEmail({ clientName, postId, comment }) {
  await resend.emails.send({
    from: FROM,
    to: DANNY_EMAIL,
    subject: `❌ ${clientName} requested changes on a post`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#dc2626;margin:0 0 16px">Changes Requested ❌</h2>
    <p style="color:#374151;font-size:15px"><strong>${clientName}</strong> requested changes on post #${postId}.</p>
    ${comment ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0;color:#991b1b;font-size:14px"><strong>Comment:</strong> ${comment}</p></div>` : ''}
    <a href="${process.env.APP_URL}/dashboard/index.html" style="display:inline-block;margin-top:16px;background:#0a66c2;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">View Dashboard →</a>
  </div>
</body>
</html>`,
  });
}

async function sendLinkedInExpiryWarning({ clientName, clientEmail, daysLeft }) {
  await resend.emails.send({
    from: FROM,
    to: DANNY_EMAIL,
    subject: `⚠️ ${clientName}'s LinkedIn token expires in ${daysLeft} days`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#d97706;margin:0 0 16px">LinkedIn Token Expiring ⚠️</h2>
    <p style="color:#374151;font-size:15px"><strong>${clientName}</strong> (${clientEmail}) has a LinkedIn token that expires in <strong>${daysLeft} days</strong>.</p>
    <p style="color:#374151;font-size:15px">Ask them to reconnect their LinkedIn account before posting.</p>
    <a href="${process.env.APP_URL}/dashboard/clients.html" style="display:inline-block;margin-top:16px;background:#0a66c2;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">Manage Clients →</a>
  </div>
</body>
</html>`,
  });
}

module.exports = {
  sendApprovalEmail,
  sendDannyApprovedEmail,
  sendDannyRejectedEmail,
  sendLinkedInExpiryWarning,
};
