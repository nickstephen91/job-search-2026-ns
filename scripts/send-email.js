// Nick Stephen Job Search Agent - send-email.js REFINED
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

const D = {
  bg:           '#f4f5f7',
  surface:      '#ffffff',
  card:         '#ffffff',
  cardBorder:   '#e5e7ef',
  headerBg:     '#0f1117',
  headerText:   '#ffffff',
  accent:       '#1a56db',
  accentLight:  '#eff4ff',
  accentBorder: '#c7d7fa',
  textPrimary:  '#111827',
  textSecondary:'#4b5563',
  textMuted:    '#9ca3af',
  divider:      '#f0f1f5',
  green:        '#059669',
  greenBg:      '#ecfdf5',
  greenBorder:  '#a7f3d0',
  amber:        '#d97706',
  amberBg:      '#fffbeb',
  amberBorder:  '#fde68a',
  pillBg:       '#f3f4f6',
  pillBorder:   '#e5e7eb',
  pillText:     '#374151',
};

function workPill(workType) {
  if (workType === 'Remote') {
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.greenBg};border:1px solid ${D.greenBorder};color:${D.green};">Remote</span>`;
  } else if (workType === 'Hybrid') {
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.accentLight};border:1px solid ${D.accentBorder};color:${D.accent};">Hybrid</span>`;
  }
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.pillBg};border:1px solid ${D.pillBorder};color:${D.pillText};">Onsite</span>`;
}

function sourcePill(source) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${D.pillBg};border:1px solid ${D.pillBorder};color:${D.textMuted};">via ${source || 'Job Board'}</span>`;
}

function industryPill(industry) {
  if (!industry) return '';
  return `&nbsp;<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${D.accentLight};border:1px solid ${D.accentBorder};color:${D.accent};">${industry}</span>`;
}

function jobCard(job) {
  const salary = job.salary && job.salary !== 'Not Listed'
    ? `<div style="font-size:12px;color:${D.green};font-weight:700;margin-top:6px;">💰 ${job.salary}</div>` : '';

  return `
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:10px;
              margin-bottom:8px;overflow:hidden;">
    <div style="height:3px;background:${D.accent};"></div>
    <div style="padding:18px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:15px;font-weight:800;color:${D.textPrimary};
                      margin-bottom:4px;letter-spacing:-0.2px;line-height:1.3;">${job.title}</div>
          <div style="font-size:13px;color:${D.textSecondary};margin-bottom:10px;">
            <strong>${job.company}</strong>
            <span style="color:${D.textMuted};margin:0 5px;">·</span>
            ${job.location}
          </div>
          <div style="line-height:2.3;">
            ${workPill(job.workType)}
            &nbsp;${sourcePill(job.source)}
            ${industryPill(job.industry)}
          </div>
          ${salary}
          <div style="font-size:11px;color:${D.textMuted};margin-top:8px;">
            Posted ${job.posted || 'Recently'}
          </div>
        </td>
        <td style="vertical-align:middle;padding-left:20px;text-align:right;white-space:nowrap;width:110px;">
          <a href="${job.url}" style="display:inline-block;background:${D.accent};
             color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;
             font-size:12px;font-weight:800;letter-spacing:0.3px;">
            View →
          </a>
        </td>
      </tr></table>
    </div>
  </div>`;
}

function topPicksCard(picks) {
  if (!picks || picks.length === 0) return '';

  const rows = picks.map(job => {
    const salary = job.salary && job.salary !== 'Not Listed'
      ? `<div style="font-size:11px;color:${D.green};font-weight:700;margin-top:2px;">💰 ${job.salary}</div>` : '';
    return `
    <tr>
      <td style="padding:14px 20px;border-bottom:1px solid ${D.divider};vertical-align:middle;">
        <div style="font-size:13px;font-weight:700;color:${D.textPrimary};margin-bottom:2px;">${job.title}</div>
        <div style="font-size:12px;color:${D.textSecondary};">${job.company} · ${job.location}</div>
        ${salary}
      </td>
      <td style="padding:14px 20px;border-bottom:1px solid ${D.divider};vertical-align:middle;
                 text-align:right;white-space:nowrap;width:90px;">
        <a href="${job.url}" style="display:inline-block;background:${D.accentLight};
           border:1px solid ${D.accentBorder};color:${D.accent};padding:7px 14px;
           border-radius:7px;text-decoration:none;font-size:11px;font-weight:800;">
          View →
        </a>
      </td>
    </tr>`;
  }).join('');

  return `
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:10px;
              margin-bottom:16px;overflow:hidden;">
    <div style="padding:16px 20px;background:${D.headerBg};border-bottom:1px solid #1e2235;">
      <div style="font-size:9px;letter-spacing:2px;color:#6b7280;font-weight:700;
                  text-transform:uppercase;margin-bottom:4px;">Revisit From Last Digest</div>
      <div style="font-size:15px;font-weight:800;color:#ffffff;">⭐ Your Top 5 Previous Picks</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <div style="padding:10px 20px;background:${D.bg};font-size:10px;
                color:${D.textMuted};text-align:center;">
      Strongest matches from your last digest · Click to revisit before they expire
    </div>
  </div>`;
}

function statCell(value, label, color) {
  return `
  <td style="text-align:center;padding:20px 16px;">
    <div style="font-size:28px;font-weight:900;color:${color};letter-spacing:-1px;">${value}</div>
    <div style="font-size:10px;color:${D.textMuted};margin-top:3px;font-weight:600;
                letter-spacing:0.5px;text-transform:uppercase;">${label}</div>
  </td>`;
}

function buildHTML(data) {
  const { date, count, jobs = [], topPicks = [], error } = data;
  const remote = jobs.filter(j => j.workType === 'Remote').length;
  const hybrid = jobs.filter(j => j.workType !== 'Remote').length;

  if (error) {
    return `<div style="font-family:Arial,sans-serif;background:#f4f5f7;padding:30px;max-width:660px;margin:0 auto;">
      <h2 style="color:#dc2626;">⚠️ Error — ${date}</h2>
      <pre style="background:#fff;padding:16px;border-radius:8px;color:#dc2626;font-size:12px;border:1px solid #fecaca;">${error}</pre>
      </div>`;
  }

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing:border-box; -webkit-font-smoothing:antialiased; }
</style>
</head>
<body style="margin:0;padding:0;background:${D.bg};font-family:'Inter',Arial,sans-serif;">
<div style="max-width:660px;margin:0 auto;padding:24px 16px;">

  <!-- HEADER -->
  <div style="background:${D.headerBg};border-radius:12px;padding:32px;margin-bottom:12px;">
    <div style="font-size:9px;letter-spacing:3px;color:#6b7280;font-weight:700;
                text-transform:uppercase;margin-bottom:12px;">
      Nick Stephen · 2026 Job Search
    </div>
    <div style="font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-1px;
                line-height:1.1;margin-bottom:8px;">
      ${count > 0 ? `${count} New Role${count !== 1 ? 's' : ''}` : 'All Caught Up'}
    </div>
    <div style="font-size:13px;color:#6b7280;">${date}</div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1e2235;
                font-size:11px;color:#4b5563;">
      📍 Remote (USA) + ≤60mi Stuart FL &nbsp;·&nbsp; 💼 Director / VP &nbsp;·&nbsp; 💰 $100K–$400K
    </div>
  </div>

  <!-- STATS -->
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:10px;
              margin-bottom:12px;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${statCell(count, 'New Today', D.accent)}
      <td style="width:1px;"><div style="width:1px;background:${D.divider};height:50px;margin:0 auto;"></div></td>
      ${statCell(remote, 'Remote', D.green)}
      <td style="width:1px;"><div style="width:1px;background:${D.divider};height:50px;margin:0 auto;"></div></td>
      ${statCell(hybrid, 'Hybrid/Local', D.accent)}
      <td style="width:1px;"><div style="width:1px;background:${D.divider};height:50px;margin:0 auto;"></div></td>
      ${statCell(topPicks.length, 'Top Picks', D.amber)}
    </tr></table>
  </div>

  <!-- TOP PICKS -->
  ${topPicksCard(topPicks)}

  <!-- NEW LISTINGS -->
  ${count === 0 ? `
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:10px;
              padding:48px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:12px;">✅</div>
    <div style="font-size:16px;font-weight:800;color:${D.textPrimary};margin-bottom:6px;">No new listings today</div>
    <div style="font-size:13px;color:${D.textSecondary};line-height:1.7;">
      All matching roles have already been sent.<br>Check back tomorrow.
    </div>
  </div>` : `
  <div style="font-size:9px;letter-spacing:2px;color:${D.textMuted};font-weight:700;
              text-transform:uppercase;margin-bottom:8px;padding-left:2px;">
    New Listings
  </div>
  ${jobs.map(j => jobCard(j)).join('')}
  `}

  <!-- FOOTER -->
  <div style="text-align:center;padding:28px 16px 8px;">
    <div style="font-size:10px;color:${D.textMuted};line-height:2.2;">
      <strong style="color:${D.textSecondary};">Nick Stephen Job Search Agent</strong><br>
      Runs daily at 6:00 AM ET · Never repeats a listing<br>
      Indeed · Remotive · The Muse · Arbeitnow · Greenhouse · Lever
    </div>
  </div>

</div>
</body></html>`;
}

async function main() {
  if (!fs.existsSync(TODAY_PATH)) { console.log('No results file'); process.exit(0); }

  const data = JSON.parse(fs.readFileSync(TODAY_PATH, 'utf8'));
  const subject = data.count > 0
    ? `🎯 ${data.count} New Job${data.count !== 1 ? 's' : ''} · ${data.date}`
    : `📋 No New Listings · ${data.date}`;

  console.log(`📧 ${subject}`);

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

  console.log(`✅ Delivered to ${process.env.RECIPIENT_EMAIL}`);
}

main().catch(err => { console.error('Email error:', err.message); process.exit(1); });
