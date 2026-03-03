// Nick Stephen Job Search Agent - SIMPLE EMAIL
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

function buildHTML(data) {
  const { date, count, jobs, error } = data;

  if (error) {
    return `<div style="font-family:Arial,sans-serif;padding:20px;">
      <h2>⚠️ Error: ${date}</h2><p>${error}</p></div>`;
  }

  const cards = (jobs || []).map(job => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff;">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">${job.title}</div>
      <div style="font-size:13px;color:#555;margin-bottom:8px;">${job.company} · ${job.location}</div>
      <div style="font-size:12px;color:#888;margin-bottom:10px;">
        ${job.workType || 'Remote'} · ${job.industry || ''} · ${job.salary || 'Salary not listed'} · ${job.posted || ''}
      </div>
      <a href="${job.url}" style="background:#1a73e8;color:#fff;padding:8px 16px;border-radius:6px;
         text-decoration:none;font-size:13px;font-weight:700;">View Job →</a>
    </div>`).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:20px;">

  <div style="background:#0d47a1;color:white;border-radius:10px;padding:24px;margin-bottom:20px;">
    <div style="font-size:12px;color:#90caf9;margin-bottom:6px;">NICK STEPHEN · 2026 JOB SEARCH</div>
    <div style="font-size:24px;font-weight:800;">Daily Job Digest</div>
    <div style="font-size:13px;color:#90caf9;margin-top:4px;">${date}</div>
  </div>

  <div style="background:#fff;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;border:1px solid #ddd;">
    <span style="font-size:32px;font-weight:800;color:#1a73e8;">${count}</span>
    <span style="font-size:14px;color:#888;margin-left:8px;">New Jobs Found Today</span>
  </div>

  ${count === 0
    ? `<div style="background:#fff;border-radius:10px;padding:32px;text-align:center;border:1px solid #ddd;">
        <div style="font-size:32px;">😴</div>
        <div style="font-size:16px;color:#555;margin-top:8px;">No new listings today</div>
       </div>`
    : cards
  }

  <div style="text-align:center;padding:16px;color:#aaa;font-size:11px;">
    Nick Stephen Job Search Agent · Runs daily 6AM ET
  </div>
</div>
</body></html>`;
}

async function main() {
  if (!fs.existsSync(TODAY_PATH)) {
    console.log('No results file found');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_PATH, 'utf8'));
  const subject = data.count > 0
    ? `🎯 ${data.count} New Jobs Found · ${data.date}`
    : `📋 No New Listings · ${data.date}`;

  console.log(`Sending: ${subject}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"Nick's Job Search" <${process.env.GMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject,
    html: buildHTML(data)
  });

  console.log(`✅ Email sent to ${process.env.RECIPIENT_EMAIL}`);
}

main().catch(err => {
  console.error('Email failed:', err.message);
  process.exit(1);
});
