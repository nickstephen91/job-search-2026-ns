// Nick Stephen Job Search Agent - send-email.js PREMIUM
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const D = {
  bg: '#0d0f14',
  surface: '#13161e',
  card: '#1a1e2a',
  cardBorder: '#252938',
  accent: '#6c63ff',
  accentGlow: '#6c63ff33',
  green: '#00e5a0',
  greenBg: '#00e5a015',
  amber: '#ffb020',
  amberBg: '#ffb02015',
  blue: '#4da6ff',
  blueBg: '#4da6ff15',
  textPrimary: '#f0f2ff',
  textSecondary: '#8b90a7',
  textMuted: '#4a4f66',
  divider: '#1e2235',
  remote: { bg: '#00e5a015', border: '#00e5a040', text: '#00e5a0' },
  hybrid: { bg: '#4da6ff15', border: '#4da6ff40', text: '#4da6ff' },
  onsite: { bg: '#ffb02015', border: '#ffb02040', text: '#ffb020' },
};

function pill(text, style) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.5px;border:1px solid ${style.border};background:${style.bg};color:${style.text};">${text}</span>`;
}

function workPill(workType) {
  const t = workType === 'Remote' ? D.remote : workType === 'Hybrid' ? D.hybrid : D.onsite;
  const icon = workType === 'Remote' ? '🌎' : workType === 'Hybrid' ? '🏢' : '📍';
  return pill(`${icon} ${workType || 'Remote'}`, t);
}

function sourcePill(source) {
  return pill(source || 'Job Board', { bg: '#ffffff08', border: '#ffffff15', text: D.textSecondary });
}

function industryPill(industry) {
  if (!industry) return '';
  return ' &nbsp;' + pill(industry, { bg: '#6c63ff15', border: '#6c63ff40', text: '#a89aff' });
}

// ── JOB CARD ──────────────────────────────────────────────────────────────────
function jobCard(job, index) {
  const salaryLine = job.salary && job.salary !== 'Not Listed'
    ? `<div style="font-size:12px;color:${D.green};font-weight:700;margin-bottom:8px;">💰 ${job.salary}</div>` : '';

  const accentColors = [D.accent, D.green, D.blue, D.amber, '#ff6b9d', '#00c9ff'];
  const accent = accentColors[index % accentColors.length];

  return `
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:12px;
              margin-bottom:10px;overflow:hidden;border-left:3px solid ${accent};">
    <div style="padding:18px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:15px;font-weight:800;color:${D.textPrimary};margin-bottom:5px;
                      letter-spacing:-0.2px;line-height:1.3;">${job.title}</div>
          <div style="font-size:13px;color:${D.textSecondary};margin-bottom:10px;font-weight:500;">
            ${job.company}
            <span style="color:${D.textMuted};margin:0 6px;">·</span>
            <span style="color:${D.textMuted};">${job.location}</span>
          </div>
          <div style="margin-bottom:10px;line-height:2.2;">
            ${workPill(job.workType)}
            &nbsp;${sourcePill(job.source)}
            ${industryPill(job.industry)}
          </div>
          ${salaryLine}
          <div style="font-size:11px;color:${D.textMuted};">📅 ${job.posted || 'Recent'}</div>
        </td>
        <td style="vertical-align:middle;text-align:right;padding-left:16px;white-space:nowrap;">
          <a href="${job.url}" style="display:inline-block;background:${accent}18;border:1px solid ${accent}50;
             color:${accent};padding:9px 18px;border-radius:8px;text-decoration:none;
             font-size:12px;font-weight:800;letter-spacing:0.3px;white-space:nowrap;">
            View →
          </a>
        </td>
      </tr></table>
    </div>
  </div>`;
}

// ── TOP PICKS CARD ─────────────────────────────────────────────────────────────
function topPicksSection(picks) {
  if (!picks || picks.length === 0) return '';

  const rows = picks.map((job, i) => {
    const accent = [D.accent, D.green, D.blue, D.amber, '#ff6b9d'][i % 5];
    const salary = job.salary && job.salary !== 'Not Listed'
      ? `<span style="color:${D.green};font-size:11px;font-weight:700;">💰 ${job.salary}</span>` : '';
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid ${D.divider};vertical-align:middle;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:3px;height:36px;border-radius:2px;background:${accent};flex-shrink:0;"></div>
          <div>
            <div style="font-size:13px;font-weight:700;color:${D.textPrimary};margin-bottom:2px;">${job.title}</div>
            <div style="font-size:11px;color:${D.textSecondary};">${job.company} · ${job.location}</div>
          </div>
        </div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${D.divider};vertical-align:middle;text-align:right;">
        <div style="margin-bottom:4px;">${salary}</div>
        <a href="${job.url}" style="display:inline-block;background:${D.accent}18;border:1px solid ${D.accent}40;
           color:${D.accent};padding:5px 12px;border-radius:6px;text-decoration:none;
           font-size:11px;font-weight:700;">View →</a>
      </td>
    </tr>`;
  }).join('');

  return `
  <!-- TOP PICKS REVISIT -->
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:12px;
              margin-bottom:24px;overflow:hidden;">
    <div style="padding:14px 18px;background:linear-gradient(90deg,${D.accent}22,${D.accentGlow});
                border-bottom:1px solid ${D.cardBorder};">
      <div style="font-size:10px;letter-spacing:2px;color:${D.accent};font-weight:800;margin-bottom:2px;">
        DON'T MISS THESE
      </div>
      <div style="font-size:14px;font-weight:800;color:${D.textPrimary};">
        ⭐ Top Picks From Your Last Digest
      </div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <div style="padding:10px 18px;font-size:10px;color:${D.textMuted};text-align:center;
                background:${D.surface};">
      These were your strongest matches from yesterday · Revisit before they expire
    </div>
  </div>`;
}

// ── STAT BOX ──────────────────────────────────────────────────────────────────
function statBox(value, label, color) {
  return `
  <td style="text-align:center;padding:16px;">
    <div style="font-size:30px;font-weight:900;color:${color};letter-spacing:-1px;">${value}</div>
    <div style="font-size:10px;color:${D.textSecondary};margin-top:3px;letter-spacing:0.5px;">${label}</div>
  </td>`;
}

// ── MAIN HTML ─────────────────────────────────────────────────────────────────
function buildHTML(data) {
  const { date, count, jobs = [], topPicks = [], error } = data;
  const remote = jobs.filter(j => j.workType === 'Remote').length;
  const hybrid = jobs.filter(j => j.workType !== 'Remote').length;

  if (error) {
    return `<div style="font-family:monospace;background:#0d0f14;color:#f0f2ff;padding:30px;max-width:660px;margin:0 auto;">
      <h2 style="color:#ff4757;">⚠️ Error — ${date}</h2>
      <pre style="background:#1a1e2a;padding:16px;border-radius:8px;color:#ff6b6b;font-size:12px;overflow:auto;">${error}</pre>
      <p style="color:#8b90a7;">Retrying at 6AM ET tomorrow.</p></div>`;
  }

  const jobCards = jobs.map((job, i) => jobCard(job, i)).join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body style="margin:0;padding:0;background:${D.bg};font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:20px 16px;">

  <!-- HEADER -->
  <div style="border-radius:16px;overflow:hidden;margin-bottom:16px;
              background:linear-gradient(135deg,#0d0f14 0%,#131829 40%,#1a1535 100%);
              border:1px solid #252938;position:relative;">
    <div style="padding:32px 32px 28px;">
      <div style="font-size:9px;letter-spacing:3px;color:${D.accent};font-weight:800;
                  text-transform:uppercase;margin-bottom:12px;font-family:'DM Mono',monospace;">
        Nick Stephen · 2026 Job Search · Daily Digest
      </div>
      <div style="font-size:32px;font-weight:900;color:${D.textPrimary};letter-spacing:-1px;
                  line-height:1.1;margin-bottom:8px;">
        ${count > 0
          ? `${count} New <span style="color:${D.accent};">Role${count !== 1 ? 's' : ''}</span> Found`
          : `All Caught <span style="color:${D.accent};">Up</span>`
        }
      </div>
      <div style="font-size:13px;color:${D.textSecondary};">${date}</div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid ${D.divider};">
        <span style="font-size:11px;color:${D.textMuted};">
          📍 Remote (USA) + ≤60mi Stuart FL &nbsp;·&nbsp; 💼 Director / VP Level &nbsp;·&nbsp; 💰 $100K–$400K
        </span>
      </div>
    </div>
  </div>

  <!-- STATS -->
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:12px;
              margin-bottom:16px;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${statBox(count, 'NEW TODAY', D.accent)}
        <td style="width:1px;padding:12px 0;"><div style="width:1px;background:${D.divider};height:40px;"></div></td>
        ${statBox(remote, 'REMOTE 🌎', D.green)}
        <td style="width:1px;padding:12px 0;"><div style="width:1px;background:${D.divider};height:40px;"></div></td>
        ${statBox(hybrid, 'HYBRID/LOCAL 🏢', D.blue)}
        <td style="width:1px;padding:12px 0;"><div style="width:1px;background:${D.divider};height:40px;"></div></td>
        ${statBox(topPicks.length, 'TOP PICKS ⭐', D.amber)}
      </tr>
    </table>
  </div>

  ${topPicksSection(topPicks)}

  <!-- JOB LISTINGS -->
  ${count === 0 ? `
  <div style="background:${D.card};border:1px solid ${D.cardBorder};border-radius:12px;
              padding:48px 32px;text-align:center;">
    <div style="font-size:36px;margin-bottom:12px;">✅</div>
    <div style="font-size:16px;font-weight:800;color:${D.textPrimary};margin-bottom:6px;">
      No new listings today
    </div>
    <div style="font-size:13px;color:${D.textSecondary};line-height:1.7;">
      All matching roles have already been sent.<br>New postings will appear as they go live.
    </div>
  </div>` : `
  <div style="font-size:9px;letter-spacing:2px;color:${D.textMuted};font-weight:700;
              text-transform:uppercase;margin-bottom:10px;padding-left:2px;">
    New Listings · ${date}
  </div>
  ${jobCards}
  `}

  <!-- FOOTER -->
  <div style="text-align:center;padding:28px 16px 12px;font-family:'DM Mono',monospace;">
    <div style="font-size:10px;color:${D.textMuted};line-height:2.2;">
      <span style="color:${D.accent};font-weight:700;">Nick Stephen Job Search Agent</span><br>
      Runs daily · 6:00 AM ET · Never repeats a listing<br>
      Indeed · Remotive · The Muse · Arbeitnow · Greenhouse · Lever<br>
      Remote (USA) + ≤60mi of Stuart FL · $100K–$400K · Director+ / VP+
    </div>
  </div>

</div>
</body></html>`;
}

// ── SEND ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(TODAY_PATH)) {
    console.log('No results file — skipping');
    process.exit(0);
  }

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

main().catch(err => {
  console.error('Email error:', err.message);
  process.exit(1);
});
