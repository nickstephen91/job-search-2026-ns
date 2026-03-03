// Nick Stephen Job Search Agent - send-email.js
// Renders ATS-scored jobs with tier system, score breakdown, and apply priority
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

function tierStyle(score) {
  if (score >= 85) return { bg: '#e8f5e9', border: '#00c853', text: '#1b5e20', emoji: '🔥', label: 'APPLY IMMEDIATELY' };
  if (score >= 70) return { bg: '#f1f8e9', border: '#64dd17', text: '#33691e', emoji: '⭐', label: 'APPLY — STRONG FIT' };
  if (score >= 55) return { bg: '#fff8e1', border: '#ffc400', text: '#e65100', emoji: '🤝', label: 'NETWORK / WARM INTRO' };
  return   { bg: '#fce4ec', border: '#ff5252', text: '#b71c1c', emoji: '❌', label: 'SKIP' };
}

function workTypePill(workType) {
  const map = {
    Remote: 'background:#e8f5e9;color:#1b5e20;border:1px solid #a5d6a7;',
    Hybrid: 'background:#e3f2fd;color:#0d47a1;border:1px solid #90caf9;',
    Onsite: 'background:#f3e5f5;color:#4a148c;border:1px solid #ce93d8;'
  };
  const s = map[workType] || map['Remote'];
  return `<span style="${s}padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;">${workType || 'Remote'}</span>`;
}

function scoreBar(score) {
  const pct = Math.min(score, 100);
  const color = score >= 85 ? '#00c853' : score >= 70 ? '#64dd17' : score >= 55 ? '#ffc400' : '#ff5252';
  return `
  <div style="margin:10px 0 6px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:700;color:#555;">ATS FIT SCORE</span>
      <span style="font-size:13px;font-weight:900;color:${color};">${score} / 100</span>
    </div>
    <div style="background:#e0e0e0;border-radius:4px;height:8px;overflow:hidden;">
      <div style="background:${color};width:${pct}%;height:100%;border-radius:4px;"></div>
    </div>
  </div>`;
}

function breakdownTable(breakdown) {
  if (!breakdown) return '';
  const cats = [
    { key: 'roleScope', label: 'Role + Scope', icon: '🎯' },
    { key: 'domainMatch', label: 'Domain Match', icon: '🏢' },
    { key: 'revenueReality', label: 'Revenue Reality', icon: '💰' },
    { key: 'companyMotion', label: 'Company + Motion', icon: '🚀' },
    { key: 'logistics', label: 'Logistics', icon: '📍' }
  ];

  const rows = cats.map(({ key, label, icon }) => {
    const cat = breakdown[key];
    if (!cat) return '';
    const pct = Math.round((cat.earned / cat.max) * 100);
    const color = pct >= 80 ? '#00c853' : pct >= 50 ? '#ffc400' : '#ff5252';
    return `
    <tr>
      <td style="padding:4px 8px;font-size:11px;color:#555;">${icon} ${label}</td>
      <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;color:${color};">${cat.earned}/${cat.max}</td>
      <td style="padding:4px 8px;font-size:10px;color:#888;">${(cat.items || []).join('; ') || '—'}</td>
    </tr>`;
  }).join('');

  return `
  <div style="margin-top:10px;background:#f9f9f9;border-radius:6px;overflow:hidden;border:1px solid #eee;">
    <div style="padding:6px 10px;background:#f0f0f0;font-size:10px;font-weight:800;color:#666;letter-spacing:1px;">
      SCORE BREAKDOWN
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </div>`;
}

function buildJobCard(job) {
  const t = tierStyle(job.atsScore);
  const salaryLine = job.salary && job.salary !== 'Not Listed'
    ? `<span style="color:#2e7d32;font-weight:700;">💰 ${job.salary}</span> &nbsp;·&nbsp; ` : '';
  const recruiterBadge = job.recruiterListing
    ? `<span style="background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;margin-left:4px;">🤝 Recruiter</span>` : '';

  return `
  <div style="border:2px solid ${t.border};border-radius:10px;margin-bottom:18px;overflow:hidden;">

    <!-- Tier Banner -->
    <div style="background:${t.bg};padding:8px 16px;border-bottom:1px solid ${t.border};">
      <span style="font-size:12px;font-weight:800;color:${t.text};letter-spacing:0.5px;">
        ${t.emoji} ${t.label} &nbsp;·&nbsp; ATS Score: ${job.atsScore}/100
      </span>
    </div>

    <div style="padding:18px;background:#fff;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="padding-right:12px;">

          <div style="font-size:17px;font-weight:800;color:#111;margin-bottom:3px;">${job.title}</div>
          <div style="font-size:13px;color:#555;margin-bottom:8px;font-weight:500;">${job.company} &nbsp;·&nbsp; ${job.location}</div>

          <div style="margin-bottom:10px;line-height:2.2;">
            ${workTypePill(job.workType)}
            <span style="background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;margin-left:4px;">${job.industry}</span>
            <span style="background:#f5f5f5;color:#616161;border:1px solid #e0e0e0;padding:2px 9px;border-radius:20px;font-size:11px;margin-left:4px;">${job.companyStage || 'Unknown Stage'}</span>
            ${recruiterBadge}
          </div>

          <div style="font-size:12px;color:#666;margin-bottom:8px;">
            ${salaryLine}📅 ${job.posted} &nbsp;·&nbsp; 🔍 ${job.source}
          </div>

          ${scoreBar(job.atsScore)}
          ${breakdownTable(job.atsBreakdown)}

          <div style="margin-top:14px;">
            <a href="${job.url}" style="background:${t.border === '#00c853' ? '#1b5e20' : t.border === '#64dd17' ? '#33691e' : '#1a73e8'};
               color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;
               font-size:13px;font-weight:800;display:inline-block;letter-spacing:0.3px;">
              ${t.emoji} View & Apply →
            </a>
          </div>

        </td>
        <!-- Score Circle -->
        <td valign="top" align="center" width="70">
          <div style="width:60px;height:60px;border-radius:50%;border:3px solid ${t.border};
               background:${t.bg};text-align:center;line-height:54px;
               font-size:18px;font-weight:900;color:${t.text};">${job.atsScore}</div>
          <div style="font-size:9px;color:#999;margin-top:3px;text-align:center;">/ 100</div>
        </td>
      </tr></table>
    </div>
  </div>`;
}

function buildEmailHTML(data) {
  const { date, count, jobs, error, hardRejects, belowThreshold, tierBreakdown } = data;
  const tb = tierBreakdown || {};

  if (error) {
    return `<div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;padding:30px;">
      <h2 style="color:#d32f2f;">⚠️ Search Error — ${date}</h2>
      <p style="background:#fff3f3;padding:12px;border-radius:6px;color:#c62828;font-family:monospace;">${error}</p>
      <p style="color:#888;">Retrying tomorrow at 6:00 AM ET.</p></div>`;
  }

  // Group jobs by tier for rendering
  const applyNow = (jobs || []).filter(j => j.atsScore >= 85);
  const applyStrong = (jobs || []).filter(j => j.atsScore >= 70 && j.atsScore < 85);
  const network = (jobs || []).filter(j => j.atsScore >= 55 && j.atsScore < 70);

  function tierSection(tierJobs, emoji, label, color) {
    if (!tierJobs.length) return '';
    return `
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:800;color:#9e9e9e;letter-spacing:2px;margin-bottom:12px;padding-left:4px;">
        ${emoji} ${label} (${tierJobs.length})
      </div>
      ${tierJobs.map(buildJobCard).join('')}
    </div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0a0f1e 0%,#1a237e 60%,#0d47a1 100%);border-radius:14px;padding:32px;margin-bottom:20px;color:white;">
    <div style="font-size:10px;letter-spacing:3px;color:#69f0ae;margin-bottom:10px;font-weight:800;">NICK STEPHEN · 2026 JOB SEARCH AGENT · 3-LAYER ATS</div>
    <div style="font-size:28px;font-weight:800;margin-bottom:6px;">Daily Job Digest ${count > 0 ? `<span style="color:#69f0ae;">(${count} New)</span>` : ''}</div>
    <div style="color:#90caf9;font-size:14px;margin-bottom:4px;">${date} · 6:00 AM ET</div>
    <div style="color:#80cbc4;font-size:12px;">📍 Remote (USA) + ≤60mi of Stuart FL · Hard Filters + 100-pt Fit Score · $130K–$400K</div>
  </div>

  <!-- ATS Stats -->
  <div style="background:white;border-radius:12px;padding:20px 24px;margin-bottom:20px;border:1px solid #e8e8e8;">
    <div style="font-size:10px;letter-spacing:2px;color:#9e9e9e;font-weight:700;margin-bottom:16px;">TODAY'S ATS PIPELINE</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="text-align:center;">
        <td><div style="font-size:22px;font-weight:800;color:#00c853;">${tb.applyNow||0}</div><div style="font-size:10px;color:#888;margin-top:2px;">🔥 Apply Now<br><span style="color:#bbb;">85-100pts</span></div></td>
        <td><div style="font-size:22px;font-weight:800;color:#64dd17;">${tb.applyStrong||0}</div><div style="font-size:10px;color:#888;margin-top:2px;">⭐ Apply Strong<br><span style="color:#bbb;">70-84pts</span></div></td>
        <td><div style="font-size:22px;font-weight:800;color:#ffc400;">${tb.network||0}</div><div style="font-size:10px;color:#888;margin-top:2px;">🤝 Network<br><span style="color:#bbb;">55-69pts</span></div></td>
        <td style="border-left:1px solid #eee;padding-left:16px;">
          <div style="font-size:22px;font-weight:800;color:#ef5350;">${hardRejects||0}</div><div style="font-size:10px;color:#888;margin-top:2px;">🚫 Hard Reject<br><span style="color:#bbb;">Auto-filtered</span></div>
        </td>
        <td><div style="font-size:22px;font-weight:800;color:#bdbdbd;">${belowThreshold||0}</div><div style="font-size:10px;color:#888;margin-top:2px;">⬇️ Below 55<br><span style="color:#bbb;">Low fit</span></div></td>
      </tr>
    </table>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f0f0f0;font-size:11px;color:#aaa;text-align:center;">
      Hard Filters: Location ✓ · Salary Floor ✓ · Director+ Level ✓ · Target Function ✓ · B2B Industry ✓ · Travel Max ✓ · Full-Time ✓
    </div>
  </div>

  ${count === 0 ? `
  <div style="background:white;border-radius:12px;padding:40px;text-align:center;border:1px solid #e8e8e8;">
    <div style="font-size:40px;margin-bottom:12px;">✅</div>
    <div style="font-size:16px;font-weight:700;color:#555;">You're all caught up!</div>
    <div style="font-size:13px;color:#888;margin-top:6px;line-height:1.7;">No new qualifying roles today. All found listings were already sent.<br>New postings will appear as soon as they go live.</div>
  </div>` : `
  ${tierSection(applyNow, '🔥', 'APPLY IMMEDIATELY', '#00c853')}
  ${tierSection(applyStrong, '⭐', 'APPLY — STRONG FIT', '#64dd17')}
  ${tierSection(network, '🤝', 'NETWORK / WARM INTRO', '#ffc400')}
  `}

  <!-- Footer -->
  <div style="text-align:center;padding:24px 20px 10px;color:#bdbdbd;font-size:11px;line-height:2;">
    <div style="font-weight:700;color:#9e9e9e;margin-bottom:4px;">Nick Stephen Job Search Agent · 3-Layer ATS</div>
    6:00 AM ET Daily · Hard Filters + 100-pt Fit Score · Never repeats a listing<br>
    Remote (USA) + ≤60mi Stuart FL · $130K–$400K · Director+ / VP+<br>
    LinkedIn · Indeed · ZipRecruiter · Glassdoor · Greenhouse · Lever · Remotive · Recruiter Firms<br>
    <span style="color:#e0e0e0;">Master spreadsheet auto-updated daily · Filled roles removed automatically</span>
  </div>

</div></body></html>`;
}

async function sendEmail() {
  if (!fs.existsSync(TODAY_PATH)) {
    console.log('⚠️  No results file — skipping email');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(TODAY_PATH, 'utf8'));
  const tb = data.tierBreakdown || {};
  const topScore = data.jobs && data.jobs.length > 0 ? data.jobs[0].atsScore : 0;

  let subject;
  if (data.count > 0) {
    const parts = [];
    if (tb.applyNow)    parts.push(`🔥 ${tb.applyNow} Apply Now`);
    if (tb.applyStrong) parts.push(`⭐ ${tb.applyStrong} Apply`);
    if (tb.network)     parts.push(`🤝 ${tb.network} Network`);
    subject = `${parts.join(' · ')} — ${data.date}`;
  } else {
    subject = `📋 No New Listings Today · ${data.date}`;
  }

  console.log(`📧 Subject: "${subject}"`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"Nick's Job Search Agent 🤖" <${process.env.GMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject,
    html: buildEmailHTML(data)
  });

  console.log(`✅ Email delivered to ${process.env.RECIPIENT_EMAIL}`);
}

sendEmail().catch(err => {
  console.error('❌ Email failed:', err.message);
  process.exit(1);
});
