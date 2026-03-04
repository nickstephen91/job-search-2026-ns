// Nick Stephen Job Search Agent - send-email.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TODAY_PATH = path.join(__dirname, '..', 'results', 'today.json');

// ── PALETTE ── near-monochrome dark, color only for signal
const C = {
  bg:        '#08090e',
  surface:   '#0d0f16',
  elevated:  '#11141d',
  border:    '#1a1d2e',
  border2:   '#232638',
  dim:       '#2e3248',
  muted:     '#52566e',
  body:      '#9196b0',
  soft:      '#c4c8e0',
  heading:   '#e8eaf5',
  bright:    '#f2f4ff',
  greenDim:  '#4a7a5e',
  greenMid:  '#5e8c6e',
  greenText: '#8ab898',
  blueDim:   '#3a4a7a',
  blueMid:   '#4a5e8e',
  blueText:  '#8899c8',
  amberText: '#a08050',
};

function tierInfo(s) {
  if (s >= 80) return { label:'MUST APPLY',      c:'#5dba7d', bg:'rgba(93,186,125,0.12)',  bd:'rgba(93,186,125,0.35)', ring:'#5dba7d' };
  if (s >= 25) return { label: s>=65?'STRONG MATCH':'WORTH REVIEWING', c:'#c8a44a', bg:'rgba(200,164,74,0.1)', bd:'rgba(200,164,74,0.3)', ring:'#c8a44a' };
  return              { label:'LOW MATCH',       c:C.muted,     bg:'rgba(255,255,255,0.02)', bd:C.border, ring:C.dim };
}

function resolveSource(job) {
  const s = (job.source||'').toLowerCase(), u = (job.url||'').toLowerCase();
  const m = {greenhouse:'Greenhouse',lever:'Lever',indeed:'Indeed',remotive:'Remotive',
             linkedin:'LinkedIn',workday:'Workday',themuse:'The Muse',ashby:'Ashby'};
  for (const [k,v] of Object.entries(m)) if (s.includes(k)||u.includes(k)) return v;
  return 'Job Board';
}

function pill(text, col, bg, bd) {
  col = col||C.muted; bg = bg||'rgba(255,255,255,0.04)'; bd = bd||'rgba(255,255,255,0.07)';
  return `<span style="display:inline-block;background:${bg};color:${col};border:1px solid ${bd};`+
    `padding:2px 9px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.3px;">${text}</span>`;
}

function jobCard(job) {
  const rank=job.rank||{}, total=rank.total||0, bd=rank.breakdown||{}, kw=bd.keywords||{};
  const mr=kw.matchRate||0, tier=tierInfo(total), src=resolveSource(job);
  const sal=job.salary&&job.salary!=='Not Listed'?job.salary:null;
  const wtIcon=job.workType==='Remote'?'🌎':job.workType==='Hybrid'?'🏢':'📍';
  const mrc=mr>=60?C.greenMid:mr>=35?C.blueMid:mr>=20?C.amberText:C.dim;

  const kwTags=(kw.topMatches||[]).slice(0,6).map(k=>
    `<span style="display:inline-block;background:rgba(255,255,255,0.04);color:${C.muted};`+
    `border:1px solid rgba(255,255,255,0.07);padding:1px 7px;border-radius:3px;`+
    `font-size:9px;font-weight:600;margin:2px 3px 2px 0;">${k}</span>`
  ).join('');

  const bdRows=[
    {l:'Industry',k:'industry',m:30},{l:'Title',k:'title',m:25},
    {l:'Keywords',k:'keywords',m:20},{l:'Comp',k:'comp',m:12},
  ].map(r=>{
    const pts=(bd[r.k]||{}).score||0, pct=Math.round(pts/r.m*100);
    const bc=pct>=75?C.greenDim:pct>=45?C.blueDim:C.border2;
    const tc=pct>=75?C.greenMid:pct>=45?C.blueMid:C.dim;
    return `<tr>
      <td style="padding:3px 0;width:62px;font-size:10px;color:${C.muted};white-space:nowrap;">${r.l}</td>
      <td style="padding:3px 10px;">
        <div style="background:${C.border};border-radius:2px;height:3px;overflow:hidden;">
          <div style="background:${bc};width:${Math.max(pct,2)}%;height:3px;"></div>
        </div>
      </td>
      <td style="padding:3px 0;width:30px;font-size:10px;color:${tc};text-align:right;font-weight:700;font-family:'Courier New',monospace;">${pts}</td>
    </tr>`;
  }).join('');

  return `
<div style="background:${C.surface};border:1px solid ${C.border};border-radius:10px;margin-bottom:8px;overflow:hidden;font-family:'Inter',Arial,sans-serif;">
  <div style="background:${tier.bg};border-bottom:1px solid ${tier.bd};padding:6px 16px;display:table;width:100%;box-sizing:border-box;">
    <span style="font-size:8px;font-weight:800;color:${tier.c};letter-spacing:2px;">${tier.label}</span>
    <span style="float:right;font-size:12px;font-weight:800;color:${tier.c};font-family:'Courier New',monospace;">${total}<span style="font-size:9px;font-weight:400;color:${C.dim};">/100</span></span>
  </div>
  <div style="padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;">
        <div style="font-size:15px;font-weight:700;color:${C.bright};letter-spacing:-0.3px;line-height:1.35;margin-bottom:3px;">${job.title}</div>
        <div style="font-size:12px;font-weight:600;color:${C.soft};margin-bottom:6px;">${job.company}</div>
        <div style="font-size:11px;color:${C.body};margin-bottom:10px;">
          ${wtIcon}&nbsp;${job.workType}<span style="color:${C.dim};margin:0 5px;">·</span>${job.location||'United States'}${sal?`<span style="color:${C.dim};margin:0 5px;">·</span><span style="color:${C.greenText};font-weight:600;">${sal}</span>`:''}
        </div>
        <div style="margin-bottom:12px;line-height:2.2;">
          ${pill('via '+src)}${job.industry?'&nbsp;'+pill(job.industry):''}${job.posted?'&nbsp;'+pill(job.posted,C.dim):''}
        </div>
        <div style="background:${C.bg};border:1px solid ${C.border};border-radius:7px;padding:10px 12px;margin-bottom:10px;">
          <div style="font-size:8px;font-weight:700;color:${C.dim};text-transform:uppercase;letter-spacing:2px;margin-bottom:7px;">Resume Match</div>
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <div style="background:${C.border};border-radius:2px;height:3px;overflow:hidden;margin-bottom:6px;">
                <div style="background:${mrc};width:${Math.max(mr,2)}%;height:3px;"></div>
              </div>
              <div style="font-size:10px;color:${C.muted};">${kw.totalHits||0} of ${kw.totalKeywords||0} keywords · ${kw.usedFullDesc?`<span style="color:${C.greenText};">full post</span>`:'preview only'}</div>
              ${kwTags?`<div style="margin-top:6px;">${kwTags}</div>`:''}
            </td>
            <td style="vertical-align:top;text-align:right;padding-left:10px;width:42px;white-space:nowrap;">
              <div style="font-size:19px;font-weight:800;color:${mrc===C.dim?C.muted:mrc};font-family:'Courier New',monospace;line-height:1;">${mr}%</div>
            </td>
          </tr></table>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0">${bdRows}</table>
      </td>
      <td style="vertical-align:top;text-align:center;padding-left:12px;width:64px;">
        <div style="width:50px;height:50px;border-radius:50%;border:1px solid ${tier.bd};background:${tier.bg};margin:0 auto 10px;line-height:50px;text-align:center;">
          <span style="font-size:15px;font-weight:800;color:${tier.c};font-family:'Courier New',monospace;">${total}</span>
        </div>
        <a href="${job.url}" style="display:block;background:${C.elevated};color:${C.body};text-decoration:none;padding:7px 0;border-radius:6px;font-size:10px;font-weight:600;text-align:center;border:1px solid ${C.border2};letter-spacing:0.5px;">View →</a>
      </td>
    </tr></table>
  </div>
</div>`;
}

function topPicksCard(picks) {
  if (!picks||!picks.length) return '';

  const rows = picks.map(job => {
    const s   = job.rank?.total || 0;
    const kw  = job.rank?.breakdown?.keywords || {};
    const mr  = kw.matchRate || 0;
    const tier = tierInfo(s);
    const sal  = job.salary && job.salary !== 'Not Listed' ? job.salary : null;
    const wtIcon = job.workType === 'Remote' ? '🌎' : job.workType === 'Hybrid' ? '🏢' : '📍';
    const mrColor = mr >= 60 ? C.greenMid : mr >= 35 ? C.blueMid : C.muted;

    const kwTags = (kw.topMatches || []).slice(0, 4).map(k =>
      `<span style="display:inline-block;background:rgba(255,255,255,0.04);color:${C.muted};` +
      `border:1px solid rgba(255,255,255,0.07);padding:1px 6px;border-radius:3px;` +
      `font-size:9px;font-weight:600;margin:2px 3px 0 0;">${k}</span>`
    ).join('');

    return `
    <tr style="border-bottom:1px solid ${C.border};">
      <td style="padding:11px 16px;vertical-align:middle;">

        <table width="100%" cellpadding="0" cellspacing="0"><tr>

          <!-- left: all text data -->
          <td style="vertical-align:middle;">
            <div style="font-size:8px;font-weight:800;color:${tier.c};letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px;">${tier.label}</div>
            <div style="font-size:13px;font-weight:700;color:${C.heading};line-height:1.3;margin-bottom:2px;">${job.title}</div>
            <div style="font-size:11px;color:${C.body};margin-bottom:6px;">
              ${job.company}
              <span style="color:${C.dim};margin:0 4px;">·</span>
              ${wtIcon} ${job.location || 'United States'}
              ${sal ? `<span style="color:${C.dim};margin:0 4px;">·</span><span style="color:${C.greenText};font-weight:600;">💰 ${sal}</span>` : ''}
            </div>
            <!-- match bar -->
            <div style="display:table;width:100%;margin-bottom:2px;">
              <div style="display:table-cell;vertical-align:middle;font-size:9px;color:${C.dim};width:70px;white-space:nowrap;">🔑 ${mr}% match</div>
              <div style="display:table-cell;vertical-align:middle;padding-left:8px;">
                <div style="background:${C.border};border-radius:2px;height:3px;overflow:hidden;">
                  <div style="background:${mrColor};width:${Math.max(mr,2)}%;height:3px;"></div>
                </div>
              </div>
              <div style="display:table-cell;vertical-align:middle;padding-left:8px;font-size:9px;color:${C.muted};width:60px;white-space:nowrap;">${kw.totalHits||0}/${kw.totalKeywords||0} kw</div>
            </div>
            ${kwTags ? `<div style="margin-top:4px;">${kwTags}</div>` : ''}
          </td>

          <!-- right: score ring + view button -->
          <td style="vertical-align:middle;text-align:right;padding-left:12px;width:60px;white-space:nowrap;">
            <div style="width:44px;height:44px;border-radius:50%;border:2px solid ${tier.ring};background:${tier.bg};display:inline-flex;align-items:center;justify-content:center;flex-direction:column;margin-bottom:6px;">
              <div style="font-size:13px;font-weight:900;color:${tier.ring};font-family:'Courier New',monospace;line-height:1;">${s}</div>
              <div style="font-size:7px;color:${C.dim};">/100</div>
            </div>
            <div>
              <a href="${job.url}" style="display:block;background:${C.elevated};color:${C.body};border:1px solid ${C.border2};padding:4px 8px;border-radius:5px;text-decoration:none;font-size:9px;font-weight:600;letter-spacing:0.3px;text-align:center;">View →</a>
            </div>
          </td>

        </tr></table>
      </td>
    </tr>`;
  }).join('');

  return `
<div style="background:${C.surface};border:1px solid ${C.border};border-radius:10px;margin-bottom:10px;overflow:hidden;font-family:'Inter',Arial,sans-serif;">
  <!-- header -->
  <div style="padding:10px 16px;border-bottom:1px solid ${C.border};display:table;width:100%;box-sizing:border-box;">
    <span style="font-size:8px;font-weight:700;color:${C.dim};text-transform:uppercase;letter-spacing:2px;">↩ Revisit · Last Digest</span>
    <span style="float:right;font-size:8px;color:${C.dim};">${picks.length} roles</span>
  </div>
  <!-- rows -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${rows}
  </table>
</div>`;
}

function statCell(val, label, color) {
  return `<td style="text-align:center;padding:16px 10px;background:${C.surface};">
    <div style="font-size:24px;font-weight:800;color:${color};letter-spacing:-1px;line-height:1;font-family:'Courier New',monospace;">${val}</div>
    <div style="font-size:9px;color:${C.muted};margin-top:4px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${label}</div>
  </td>`;
}

function buildHTML(data) {
  const {date,count,jobs=[],topPicks=[],currentTopPicks=[],error}=data;
  const topPickCount = currentTopPicks.length || jobs.filter(j=>(j.rank?.total||0)>=65).length;
  const remote=jobs.filter(j=>j.workType==='Remote').length;
  const hybrid=jobs.filter(j=>j.workType!=='Remote').length;
  const mustApply=jobs.filter(j=>(j.rank?.total||0)>=80).length;
  const strong=jobs.filter(j=>{const s=j.rank?.total||0;return s>=65&&s<80;}).length;

  if (error) return `<div style="font-family:Arial;background:${C.bg};padding:30px;max-width:640px;margin:0 auto;color:${C.heading};">
    <h2 style="color:#a05050;">Error — ${date}</h2>
    <pre style="background:${C.surface};padding:16px;border-radius:8px;color:#a05050;font-size:12px;border:1px solid ${C.border};">${error}</pre></div>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Inter',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:20px 16px 48px;">

  <!-- wordmark -->
  <div style="padding:0 2px 14px;display:table;width:100%;box-sizing:border-box;">
    <span style="font-size:9px;font-weight:700;color:${C.dim};text-transform:uppercase;letter-spacing:3px;">Nick Stephen · 2026 Job Search</span>
    <span style="float:right;">
      <a href="https://nickstephen91.github.io/job-search-2026-ns/" style="font-size:10px;font-weight:600;color:${C.blueText};text-decoration:none;background:rgba(136,153,200,0.08);border:1px solid rgba(136,153,200,0.2);padding:3px 10px;border-radius:4px;letter-spacing:0.3px;">View Dashboard →</a>
    </span>
  </div>

  <!-- header -->
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:26px 22px;margin-bottom:8px;">
    <div style="font-size:31px;font-weight:800;color:${C.bright};letter-spacing:-1.2px;line-height:1.1;margin-bottom:8px;">
      ${count>0?`${count} New Role${count!==1?'s':''}`:'All Caught Up'}
    </div>
    <div style="font-size:11px;color:${C.muted};line-height:1.9;">
      📍 Remote (USA) + ≤60mi Stuart FL &nbsp;<span style="color:${C.dim}">·</span>&nbsp; 💼 Director / VP &nbsp;<span style="color:${C.dim}">·</span>&nbsp; 💰 $100K–$400K
    </div>
    ${count>0?`
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid ${C.border};display:table;width:100%;box-sizing:border-box;">
      <span style="font-size:11px;color:${C.muted};">
        ${mustApply>0?`<span style="color:${C.greenText};font-weight:600;">${mustApply} must-apply</span>`:''}
        ${strong>0?`${mustApply>0?' &nbsp;·&nbsp; ':''}<span style="color:${C.blueText};font-weight:600;">${strong} strong match${strong>1?'es':''}</span>`:''}
        ${mustApply===0&&strong===0?`<span style="color:${C.muted};">${count} to review</span>`:''}
      </span>
      <span style="float:right;font-size:11px;color:${C.dim};">${remote} remote &nbsp;·&nbsp; ${hybrid} local</span>
    </div>`:``}
  </div>

  <!-- stats -->
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:10px;margin-bottom:10px;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${statCell(count,         'New Today',  C.blueText)}
      <td style="width:1px;background:${C.border};"></td>
      ${statCell(remote,        'Remote',     C.greenText)}
      <td style="width:1px;background:${C.border};"></td>
      ${statCell(mustApply,     'Must Apply', C.greenText)}
      <td style="width:1px;background:${C.border};"></td>
      ${statCell(topPicks.length,'Prev Picks',C.amberText)}
    </tr></table>
  </div>

  <!-- top picks -->
  ${topPicksCard(topPicks)}

  <!-- section label -->
  ${count>0?`<div style="font-size:8px;font-weight:700;color:${C.dim};text-transform:uppercase;letter-spacing:2.5px;margin:14px 0 8px 2px;">New Listings · Ranked by Match Score</div>`:''}

  <!-- job cards -->
  ${count===0?`
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:48px 24px;text-align:center;">
    <div style="font-size:13px;font-weight:600;color:${C.heading};margin-bottom:6px;">No new listings today</div>
    <div style="font-size:12px;color:${C.muted};">All matching roles already sent. Check back tomorrow.</div>
  </div>`:jobs.map(j=>jobCard(j)).join('')}

  <!-- footer -->
  <div style="padding:20px 2px 0;border-top:1px solid ${C.border};margin-top:10px;">
    <div style="font-size:10px;color:${C.dim};line-height:2.2;">
      <strong style="color:${C.muted};">Nick Stephen · Job Search Agent</strong><br>
      Runs daily 6:00 AM ET &nbsp;·&nbsp; Never repeats a listing &nbsp;·&nbsp; Ranked by resume match<br>
      Sources: Indeed · Remotive · The Muse · Arbeitnow · Greenhouse · Lever
    </div>
  </div>

</div>
</body></html>`;
}

async function main() {
  if (!fs.existsSync(TODAY_PATH)) { console.log('No results file'); process.exit(0); }
  const data=JSON.parse(fs.readFileSync(TODAY_PATH,'utf8'));
  const subject=data.count>0
    ?`🎯 ${data.count} New Job${data.count!==1?'s':''} · ${data.date}`
    :`📋 No New Listings · ${data.date}`;
  console.log(`📧 ${subject}`);
  const transporter=nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
  await transporter.sendMail({from:`"Nick's Job Search" <${process.env.GMAIL_USER}>`,to:process.env.RECIPIENT_EMAIL,subject,html:buildHTML(data)});
  console.log(`✅ Delivered to ${process.env.RECIPIENT_EMAIL}`);
}

main().catch(err=>{console.error('Email error:',err.message);process.exit(1);});
