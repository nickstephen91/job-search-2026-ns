// Nick Stephen Job Search Agent - send-email.js REFINED
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

const D = {
  bg:          '#090b12',
  surface:     '#0f1219',
  card:        '#13161f',
  card2:       '#191d29',
  cardBorder:  '#1e2235',
  divider:     '#252a3a',
  headerBg:    'linear-gradient(135deg, #0d0f18 0%, #131829 50%, #0f1520 100%)',
  accent:      '#4f6ef7',
  accentLight: '#1e2d6b',
  accentBorder:'#2d3f8a',
  green:       '#00c97a',
  amber:       '#f59e0b',
  blue:        '#3b82f6',
  red:         '#ef4444',
  textPrimary: '#f0f2ff',
  textSecondary:'#8b90a7',
  textMuted:   '#4a4f66',
};

function workPill(workType) {
  if (workType === 'Remote') {
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.greenBg};border:1px solid ${D.greenBorder};color:#00c97a;">Remote</span>`;
  } else if (workType === 'Hybrid') {
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.accentLight};border:1px solid ${D.accentBorder};color:#4f6ef7;">Hybrid</span>`;
  }
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.3px;background:${D.pillBg};border:1px solid ${D.pillBorder};color:${D.pillText};">Onsite</span>`;
}

function sourcePill(source) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${D.pillBg};border:1px solid ${D.pillBorder};color:#4a4f66;">via ${source || 'Job Board'}</span>`;
}

function industryPill(industry) {
  if (!industry) return '';
  return `&nbsp;<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${D.accentLight};border:1px solid ${D.accentBorder};color:#4f6ef7;">${industry}</span>`;
}

function jobCard(job) {
  const rank = job.rank || {};
  const total = rank.total || 0;
  const bd = rank.breakdown || {};
  const kw = bd.keywords || {};
  const matchRate = kw.matchRate || 0;

  // Colors by score tier
  const scoreColor = total >= 80 ? '#a3b8a0' : total >= 65 ? '#8899cc' : total >= 50 ? '#b8a070' : '#3a3f55';
  const scoreBg    = total >= 80 ? 'rgba(163,184,160,0.08)' : total >= 65 ? 'rgba(136,153,204,0.08)' : total >= 50 ? 'rgba(184,160,112,0.08)' : 'rgba(255,255,255,0.03)';
  const scoreBorder= total >= 80 ? 'rgba(163,184,160,0.2)' : total >= 65 ? 'rgba(136,153,204,0.2)' : total >= 50 ? 'rgba(184,160,112,0.2)' : 'rgba(255,255,255,0.07)';
  const tierLabel  = total >= 80 ? '🔥 MUST APPLY' : total >= 65 ? '⭐ STRONG MATCH' : total >= 50 ? '👀 WORTH REVIEWING' : '📋 LOW MATCH';
  const matchColor = matchRate >= 60 ? '#8aab87' : matchRate >= 35 ? '#7a8fbb' : matchRate >= 20 ? '#a89060' : '#3a3f55';

  const salary = job.salary && job.salary !== 'Not Listed' ? job.salary : null;
  const wtIcon = job.workType === 'Remote' ? '🌎' : job.workType === 'Hybrid' ? '🏢' : '📍';

  // Fix source — never show generic
  let sourceLabel = (job.source || '').trim();
  if (!sourceLabel || sourceLabel.toLowerCase() === 'via job board' || sourceLabel.toLowerCase() === 'job board') {
    const url = (job.url || '').toLowerCase();
    if (url.includes('greenhouse')) sourceLabel = 'Greenhouse';
    else if (url.includes('lever')) sourceLabel = 'Lever';
    else if (url.includes('indeed')) sourceLabel = 'Indeed';
    else if (url.includes('remotive')) sourceLabel = 'Remotive';
    else if (url.includes('linkedin')) sourceLabel = 'LinkedIn';
    else if (url.includes('workday')) sourceLabel = 'Workday';
    else if (url.includes('themuse')) sourceLabel = 'The Muse';
    else sourceLabel = 'Job Board';
  }

  const kwTagsHtml = (kw.topMatches || []).slice(0, 6).map(k =>
    `<span style="background:rgba(255,255,255,0.05);color:#7a7f9a;border:1px solid rgba(255,255,255,0.08);padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;margin-right:4px;margin-bottom:3px;display:inline-block;">${k}</span>`
  ).join('');

  const bdRows = [
    { l: 'Industry', k: 'industry', m: 30 },
    { l: 'Title',    k: 'title',    m: 25 },
    { l: 'Keywords', k: 'keywords', m: 20 },
    { l: 'Comp',     k: 'comp',     m: 12 },
  ].map(r => {
    const pts = (bd[r.k] || {}).score || 0;
    const pct = Math.round((pts / r.m) * 100);
    const c = pct >= 75 ? '#6a9e80' : pct >= 45 ? '#5a70a8' : '#2e3348';
    return `<tr>
      <td style="padding:3px 0;width:60px;font-size:10px;color:#8b90a7;white-space:nowrap;">${r.l}</td>
      <td style="padding:3px 8px;">
        <div style="background:#1e2235;border-radius:3px;height:4px;overflow:hidden;">
          <div style="background:${c};width:${Math.max(pct,2)}%;height:4px;border-radius:3px;"></div>
        </div>
      </td>
      <td style="padding:3px 0;width:36px;font-size:10px;color:${c};text-align:right;font-weight:700;">${pts}/${r.m}</td>
    </tr>`;
  }).join('');

  return `
  <div style="background:#13161f;border:1px solid #1e2235;border-radius:12px;margin-bottom:10px;overflow:hidden;font-family:'DM Sans',Arial,sans-serif;">

    <!-- Tier banner -->
    <div style="background:${scoreBg};border-bottom:1px solid ${scoreBorder};padding:7px 18px;display:table;width:100%;box-sizing:border-box;">
      <span style="font-size:9px;font-weight:800;color:${scoreColor};letter-spacing:1.5px;">${tierLabel}</span>
      <span style="font-size:10px;color:${scoreColor};font-weight:700;float:right;font-family:'Courier New',monospace;">${total}/100</span>
    </div>

    <div style="padding:16px 18px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">

          <!-- Job title -->
          <div style="font-size:16px;font-weight:800;color:#f0f2ff;letter-spacing:-0.3px;line-height:1.3;margin-bottom:5px;">${job.title}</div>

          <!-- Company — accent color, prominent -->
          <div style="font-size:14px;font-weight:700;color:#c8cce8;margin-bottom:5px;">${job.company}</div>

          <!-- Location row -->
          <div style="font-size:12px;color:#8b90a7;margin-bottom:10px;">
            ${wtIcon} <span style="color:#9098b8;font-weight:500;">${job.workType}</span>
            <span style="color:#2a2f45;margin:0 6px;">·</span>
            ${job.location || 'United States'}
            ${salary ? `<span style="color:#2a2f45;margin:0 6px;">·</span><span style="color:#7a9e8a;font-weight:600;">💰 ${salary}</span>` : ''}
          </div>

          <!-- Pills -->
          <div style="margin-bottom:12px;line-height:2.4;">
            <span style="background:rgba(255,255,255,0.05);color:#6b7090;border:1px solid rgba(255,255,255,0.08);padding:2px 9px;border-radius:4px;font-size:10px;font-weight:600;">via ${sourceLabel}</span>
            ${job.industry ? `&nbsp;<span style="background:rgba(255,255,255,0.04);color:#6b7090;border:1px solid rgba(255,255,255,0.07);padding:2px 9px;border-radius:4px;font-size:10px;font-weight:700;">${job.industry}</span>` : ''}
            ${job.posted ? `&nbsp;<span style="background:rgba(255,255,255,0.04);color:#4a4f66;border:1px solid #1e2235;padding:2px 9px;border-radius:4px;font-size:10px;">📅 ${job.posted}</span>` : ''}
          </div>

          <!-- Keyword match block -->
          <div style="background:#0f1219;border:1px solid #1e2235;border-radius:8px;padding:10px 12px;margin-bottom:10px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;">
                <div style="font-size:9px;font-weight:700;color:#4a4f66;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">🔑 Resume Keyword Match</div>
                <div style="background:#1e2235;border-radius:3px;height:5px;overflow:hidden;margin-bottom:5px;">
                  <div style="background:${matchColor};width:${Math.max(matchRate,2)}%;height:5px;border-radius:3px;"></div>
                </div>
                <div style="font-size:10px;color:#4a4f66;">${kw.totalHits||0}/${kw.totalKeywords||0} resume keywords · ${kw.usedFullDesc ? '<span style="color:#00c97a;font-weight:600;">full description</span>' : 'snippet only'}</div>
                ${kwTagsHtml ? `<div style="margin-top:7px;line-height:2;">${kwTagsHtml}</div>` : ''}
              </td>
              <td style="vertical-align:middle;text-align:right;padding-left:12px;width:52px;white-space:nowrap;">
                <div style="font-size:24px;font-weight:800;color:${matchColor};line-height:1;">${matchRate}%</div>
                <div style="font-size:9px;color:#4a4f66;text-align:center;">match</div>
              </td>
            </tr></table>
          </div>

          <!-- Score breakdown bars -->
          <table width="100%" cellpadding="0" cellspacing="1">${bdRows}</table>

        </td>

        <!-- Score ring + CTA -->
        <td style="vertical-align:top;text-align:center;padding-left:14px;width:74px;">
          <div style="width:58px;height:58px;border-radius:50%;border:2px solid ${scoreColor};background:${scoreBg};display:inline-table;text-align:center;margin-bottom:10px;padding-top:10px;">
            <div style="font-size:18px;font-weight:900;color:${scoreColor};line-height:1.1;">${total}</div>
            <div style="font-size:9px;color:#4a4f66;">/100</div>
          </div>
          <a href="${job.url}" style="display:block;background:#1c2340;color:#8899bb;text-decoration:none;padding:8px 0;border-radius:7px;font-size:11px;font-weight:600;text-align:center;border:1px solid #252d4a;">
            View Job →
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
      ? `<div style="font-size:11px;color:#00c97a;font-weight:700;margin-top:2px;">💰 ${job.salary}</div>` : '';
    return `
    <tr>
      <td style="padding:14px 20px;border-bottom:1px solid #1e2235;vertical-align:middle;">
        <div style="font-size:13px;font-weight:700;color:#f0f2ff;margin-bottom:2px;">${job.title}</div>
        <div style="font-size:12px;color:#8b90a7;">${job.company} · ${job.location}</div>
        ${salary}
      </td>
      <td style="padding:14px 20px;border-bottom:1px solid #1e2235;vertical-align:middle;
                 text-align:right;white-space:nowrap;width:90px;">
        <a href="${job.url}" style="display:inline-block;background:${D.accentLight};
           border:1px solid ${D.accentBorder};color:#4f6ef7;padding:7px 14px;
           border-radius:7px;text-decoration:none;font-size:11px;font-weight:800;">
          View →
        </a>
      </td>
    </tr>`;
  }).join('');

  return `
  <div style="background:#13161f;border:1px solid #1e2235;border-radius:10px;
              margin-bottom:16px;overflow:hidden;">
    <div style="padding:16px 20px;background:${D.headerBg};border-bottom:1px solid #1e2235;">
      <div style="font-size:9px;letter-spacing:2px;color:#6b7280;font-weight:700;
                  text-transform:uppercase;margin-bottom:4px;">Revisit From Last Digest</div>
      <div style="font-size:15px;font-weight:800;color:#ffffff;">⭐ Your Top 5 Previous Picks</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <div style="padding:10px 20px;background:#090b12;font-size:10px;
                color:#4a4f66;text-align:center;">
      Strongest matches from your last digest · Click to revisit before they expire
    </div>
  </div>`;
}

function statCell(value, label, color) {
  return `
  <td style="text-align:center;padding:20px 16px;background:#0f1219;">
    <div style="font-size:28px;font-weight:900;color:${color};letter-spacing:-1px;line-height:1;">${value}</div>
    <div style="font-size:10px;color:#4a4f66;margin-top:4px;font-weight:600;
                letter-spacing:0.8px;text-transform:uppercase;">${label}</div>
  </td>`;
}

function buildHTML(data) {
  const { date, count, jobs = [], topPicks = [], error } = data;
  const remote = jobs.filter(j => j.workType === 'Remote').length;
  const hybrid = jobs.filter(j => j.workType !== 'Remote').length;

  if (error) {
    return `<div style="font-family:Arial,sans-serif;background:#090b12;padding:30px;max-width:660px;margin:0 auto;">
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
<body style="margin:0;padding:0;background:#090b12;font-family:'Inter',Arial,sans-serif;">
<div style="max-width:660px;margin:0 auto;padding:24px 16px;">

  <!-- HEADER -->
  <div style="background:${D.headerBg};border-radius:12px;padding:32px;margin-bottom:12px;">
    <div style="font-size:9px;letter-spacing:3px;color:#6b7280;font-weight:700;
                text-transform:uppercase;margin-bottom:12px;">
      Nick Stephen · 2026 Job Search
    </div>
    <div style="font-size:30px;font-weight:900;color:#e8eaf5;letter-spacing:-1px;
                line-height:1.1;margin-bottom:8px;">
      ${count > 0 ? `${count} New Role${count !== 1 ? 's' : ''}` : 'All Caught Up'}
    </div>
    <div style="font-size:13px;color:#4a4f66;">${date}</div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1e2235;
                font-size:11px;color:#4b5563;">
      📍 Remote (USA) + ≤60mi Stuart FL &nbsp;·&nbsp; 💼 Director / VP &nbsp;·&nbsp; 💰 $100K–$400K
    </div>
  </div>

  <!-- STATS -->
  <div style="background:#0f1219;border:1px solid #1e2235;border-radius:10px;
              margin-bottom:12px;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${statCell(count, 'New Today', '#8899cc')}
      <td style="width:1px;"><div style="width:1px;background:#1e2235;height:50px;margin:0 auto;"></div></td>
      ${statCell(remote, 'Remote', '#7a9e8a')}
      <td style="width:1px;"><div style="width:1px;background:#1e2235;height:50px;margin:0 auto;"></div></td>
      ${statCell(hybrid, 'Hybrid/Local', '#8899cc')}
      <td style="width:1px;"><div style="width:1px;background:#1e2235;height:50px;margin:0 auto;"></div></td>
      ${statCell(topPicks.length, 'Top Picks', '#a89060')}
    </tr></table>
  </div>

  <!-- TOP PICKS -->
  ${topPicksCard(topPicks)}

  <!-- NEW LISTINGS -->
  ${count === 0 ? `
  <div style="background:#13161f;border:1px solid #1e2235;border-radius:10px;
              padding:48px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:12px;">✅</div>
    <div style="font-size:16px;font-weight:800;color:#f0f2ff;margin-bottom:6px;">No new listings today</div>
    <div style="font-size:13px;color:#8b90a7;line-height:1.7;">
      All matching roles have already been sent.<br>Check back tomorrow.
    </div>
  </div>` : `
  <div style="font-size:9px;letter-spacing:2px;color:#4a4f66;font-weight:700;
              text-transform:uppercase;margin-bottom:8px;padding-left:2px;">
    New Listings
  </div>
  ${jobs.map(j => jobCard(j)).join('')}
  `}

  <!-- FOOTER -->
  <div style="text-align:center;padding:28px 16px 8px;">
    <div style="font-size:10px;color:#4a4f66;line-height:2.2;">
      <strong style="color:#8b90a7;">Nick Stephen Job Search Agent</strong><br>
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
