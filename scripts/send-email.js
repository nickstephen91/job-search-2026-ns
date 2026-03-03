// Nick Stephen Job Search Agent - send-email.js FULL VERSION
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

function workTypePill(workType) {
  const map = {
    Remote:  'background:#e8f5e9;color:#1b5e20;border:1px solid #a5d6a7;',
    Hybrid:  'background:#e3f2fd;color:#0d47a1;border:1px solid #90caf9;',
    Onsite:  'background:#f3e5f5;color:#4a148c;border:1px solid #ce93d8;'
  };
  const s = map[workType] || map['Remote'];
  return `<span style="${s}padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${workType || 'Remote'}</span>`;
}

function buildJobCard(job, index) {
  const salary = job.salary && job.salary !== 'Not Listed' 
    ? `<span style="color:#2e7d32;font-weight:700;">💰 ${job.salary}</span> &nbsp;·&nbsp; ` : '';
  
  return `
  <div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid #1a73e8;
              border-radius:0 10px 10px 0;padding:20px;margin-bottom:12px;">
    <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:4px;">${job.title}</div>
    <div style="font-size:13px;color:#555;margin-bottom:8px;font-weight:500;">
      ${job.company} &nbsp;·&nbsp; ${job.location}
    </div>
    <div style="margin-bottom:10px;line-height:2.4;">
      ${workTypePill(job.workType)}
      ${job.industry ? `<span style="background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-left:6px;">${job.industry}</span>` : ''}
      <span style="background:#f5f5f5;color:#666;border:1px solid #e0e0e0;padding:2px 10px;border-radius:20px;font-size:11px;margin-left:6px;">via ${job.source || 'Job Board'}</span>
    </div>
    <div style="font-size:12px;color:#888;margin-bottom:14px;">
      ${salary}📅 ${job.posted || 'Recent'}
    </div>
    <a href="${job.url}" style="background:#1a73e8;color:#fff;padding:10px 22px;border-radius:6px;
       text-decoration:none;font-size:13px;font-weight:800;display:inline-block;">
      View Job Posting →
    </a>
  </div>`;
}

function buildHTML(data) {
  const { date, count, jobs, error } = data;

  if (error) {
    return `<div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;padding:30px;">
      <h2 style="color:#d32f2f;">⚠️ Search Error — ${date}</h2>
      <p style="background:#fff3f3;padding:12px;border-radius:6px;color:#c62828;font-family:monospace;">${error}</p>
      <p style="color:#888;">Retrying tomorrow at 6:00 AM ET.</p></div>`;
  }

  const remoteCount = (jobs || []).filter(j => j.workType === 'Remote').length;
  const jobCards = (jobs || []).map((job, i) => buildJobCard(job, i)).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0a0f1e 0%,#1a237e 60%,#0d47a1 100%);
              border-radius:14px;padding:32px;margin-bottom:20px;color:white;">
    <div style="font-size:10px;letter-spacing:3px;color:#69f0ae;margin-bottom:10px;font-weight:800;">
      NICK STEPHEN · 2026 JOB SEARCH AGENT
    </div>
    <div style="font-size:28px;font-weight:800;margin-bottom:6px;">
      Daily Job Digest 
      ${count > 0 ? `<span style="color:#69f0ae;">(${count} New)</span>` : ''}
    </div>
    <div style="color:#90caf9;font-size:14px;margin-bottom:4px;">${date} · 6:00 AM ET</div>
    <div style="color:#80cbc4;font-size:12px;">
      📍 Remote (USA) + Within 60mi of Stuart FL · $130K–$400K · Director / VP Level
    </div>
  </div>

  <!-- Stats -->
  <div style="background:white;border-radius:12px;padding:20px 24px;margin-bottom:20px;border:1px solid #e8e8e8;">
    <div style="font-size:10px;letter-spacing:2px;color:#9e9e9e;font-weight:700;margin-bottom:14px;">TODAY'S RESULTS</div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr style="text-align:center;">
      <td>
        <div style="font-size:28px;font-weight:800;color:#1a73e8;">${count}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">New Today</div>
      </td>
      <td>
        <div style="font-size:28px;font-weight:800;color:#00c853;">${remoteCount}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">Remote 🌎</div>
      </td>
      <td>
        <div style="font-size:28px;font-weight:800;color:#ff9100;">${count - remoteCount}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">Hybrid/Local 📍</div>
      </td>
    </tr></table>
  </div>

  ${count === 0 ? `
  <div style="background:white;border-radius:12px;padding:40px;text-align:center;border:1px solid #e8e8e8;">
    <div style="font-size:40px;margin-bottom:12px;">✅</div>
    <div style="font-size:16px;font-weight:700;color:#555;">You're all caught up!</div>
    <div style="font-size:13px;color:#888;margin-top:6px;line-height:1.7;">
      No new qualifying roles today. Check back tomorrow.
    </div>
  </div>` : `
  <div style="font-size:11px;font-weight:800;color:#9e9e9e;letter-spacing:2px;margin-bottom:12px;padding-left:4px;">
    NEW LISTINGS — SORTED BY DATE FOUND
  </div>
  ${jobCards}
  `}

  <!-- Footer -->
  <div style="text-align:center;padding:24px 20px 10px;color:#bdbdbd;font-size:11px;line-height:2;">
    <div style="font-weight:700;color:#9e9e9e;margin-bottom:4px;">Nick Stephen Job Search Agent</div>
    Runs daily at 6:00 AM ET · Never repeats a listing<br>
    Sources: Indeed RSS · Remotive · The Muse · Arbeitnow · Direct ATS Search<br>
    Remote (USA) + Within 60mi of Stuart FL · $130K–$400K · Director+ / VP+
  </div>

</div></body></html>`;
}

async function main() {
  if (!fs.existsSync(TODAY_PATH)) {
    console.log('No results file found');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_PATH, 'utf8'));
  const subject = data.count > 0
    ? `🎯 ${data.count} New Job${data.count !== 1 ? 's' : ''} Found · ${data.date}`
    : `📋 No New Listings · ${data.date}`;

  console.log(`📧 Subject: "${subject}"`);
  console.log(`   To: ${process.env.RECIPIENT_EMAIL}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"Nick's Job Search Agent 🤖" <${process.env.GMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject,
    html: buildHTML(data)
  });

  console.log(`✅ Email delivered to ${process.env.RECIPIENT_EMAIL}`);
}

main().catch(err => {
  console.error('❌ Email failed:', err.message);
  process.exit(1);
});
