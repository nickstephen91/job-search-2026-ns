// Nick Stephen Job Search Agent - CLEAN REWRITE v12
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const DOCS_RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const DOCS_TODAY_PATH = path.join(DOCS_RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');

function loadSeenUrls() {
  try {
    if (!fs.existsSync(SEEN_URLS_PATH)) return new Set();
    const raw = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8'));
    const entries = (!Array.isArray(raw) && Array.isArray(raw.entries)) ? raw.entries : [];
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    return new Set(entries.filter(e => e && e.ts > cutoff).map(e => e.url).filter(Boolean));
  } catch { return new Set(); }
}

function saveSeenUrls(seenUrls, newUrls) {
  try {
    let existing = [];
    if (fs.existsSync(SEEN_URLS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8'));
      existing = (!Array.isArray(raw) && Array.isArray(raw.entries)) ? raw.entries : [];
    }
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const kept = existing.filter(e => e && e.ts && e.ts > cutoff && !newUrls.has(e.url));
    const added = Array.from(newUrls).map(url => ({ url, ts: Date.now() }));
    fs.writeFileSync(SEEN_URLS_PATH, JSON.stringify({ lastUpdated: new Date().toISOString(), entries: [...kept, ...added] }, null, 2));
  } catch(e) { console.log('saveSeenUrls error:', e.message); }
}

function loadTopPicks() {
  try {
    if (!fs.existsSync(TOP_PICKS_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(TOP_PICKS_PATH, 'utf8'));
    return Array.isArray(raw.picks) ? raw.picks : [];
  } catch { return []; }
}

function saveTopPicks(jobs) {
  if (!jobs || jobs.length === 0) return;
  fs.writeFileSync(TOP_PICKS_PATH, JSON.stringify({ picks: jobs.slice(0, 5) }, null, 2));
}

// ── SCORING ───────────────────────────────────────────────────────────────────
function scoreJob(job) {
  const title = (job.title || '').toLowerCase();
  const company = (job.company || '').toLowerCase();
  const snippet = (job.snippet || '').toLowerCase();
  const text = title + ' ' + snippet;
  let score = 0;

  // Title score (0-25)
  if (/\bvp\b|vice president/.test(title)) score += 25;
  else if (/director/.test(title)) score += 22;
  else if (/head of/.test(title)) score += 20;
  else if (/senior director/.test(title)) score += 23;
  else if (/manager/.test(title)) score += 10;

  // Function score (0-25)
  if (/partner|alliance/.test(title)) score += 25;
  else if (/channel|reseller/.test(title)) score += 22;
  else if (/revenue ops|revops/.test(title)) score += 20;
  else if (/customer success/.test(title)) score += 18;
  else if (/business dev/.test(title)) score += 20;

  // Industry score (0-30)
  if (/\bpeo\b|professional employer/.test(text)) score += 30;
  else if (/hr tech|hrtech|hcm|payroll|background.?screen|compliance/.test(text)) score += 25;
  else if (/saas|b2b|fintech|insurtech/.test(text)) score += 15;
  else score += 10;

  // Keywords (0-20)
  const keywords = ['partnership','alliance','channel','reseller','go.to.market','gtm','ecosystem','integration','isvs','peo','hris','ats'];
  score += Math.min(20, keywords.filter(k => text.includes(k)).length * 3);

  // Company bonus
  if (/experian|checkr|first.?advantage|sterling|adp|paycom|rippling|gusto|deel|justworks|trinet|bamboohr|lattice|workday|ceridian|ukg/.test(company)) score += 5;

  const tier = score >= 80 ? '🔥 Must Apply' : score >= 65 ? '⭐ Strong Match' : score >= 50 ? '👍 Good Fit' : '👀 Worth a Look';
  return { score: Math.min(100, score), tier };
}

// ── SOURCES ───────────────────────────────────────────────────────────────────
async function fetchRemotive() {
  const jobs = [];
  const queries = ['partnerships','alliances','customer success','revenue operations','channel','business development'];
  for (const q of queries) {
    try {
      const r = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=20`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const d = await r.json();
      for (const j of (d.jobs || [])) {
        jobs.push({ title: j.title, company: j.company_name, location: 'Remote', workType: 'Remote',
          salary: j.salary || 'Not Listed', posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
          url: j.url, source: 'Remotive', snippet: (j.description||'').replace(/<[^>]+>/g,' ').substring(0,300) });
      }
      console.log(`   ✅ Remotive "${q}": ${(d.jobs||[]).length}`);
    } catch(e) { console.log(`   ❌ Remotive "${q}": ${e.message}`); }
  }
  return jobs;
}

async function fetchWWR() {
  const jobs = [];
  for (const cat of ['executive','sales','business']) {
    try {
      const r = await fetch(`https://weworkremotely.com/categories/remote-${cat}-jobs.rss`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items) {
        const rawTitle = ((item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || [])[1] || '');
        const title = rawTitle.replace(/^[^:]+:\s*/, '');
        const company = ((item.match(/<company><!\[CDATA\[(.*?)\]\]><\/company>/) || [])[1] || '');
        const link = ((item.match(/<link>(.*?)<\/link>/) || [])[1] || '');
        if (title) jobs.push({ title, company, location: 'Remote', workType: 'Remote',
          salary: 'Not Listed', posted: 'Recent',
          url: link.startsWith('http') ? link : `https://weworkremotely.com${link}`,
          source: 'WWR', snippet: '' });
      }
      console.log(`   ✅ WWR ${cat}: ${items.length}`);
    } catch(e) { console.log(`   ❌ WWR ${cat}: ${e.message}`); }
  }
  return jobs;
}

async function fetchGreenhouse() {
  const jobs = [];
  const companies = [
    'rippling','gusto','justworks','trinet','bamboohr','namely','paycor','paylocity','paycom',
    'isolved','leapsome','lattice','hibob','cultureamp','15five','personio',
    'remote','oysterhr','papayaglobal','velocityglobal','deel','multiplier',
    'partnerstack','workato','navan','experian','firstadvantage','sterlingcheck',
    'checkr','accurate','vanta','drata','fivetran','hightouch','hubspot',
    'zendesk','freshworks','intercom','salesloft','gong','clari'
  ];
  for (const co of companies) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const d = await r.json();
      const relevant = (d.jobs || []).filter(j => /partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|vp\b|vice.?pres|director|head.?of/i.test(j.title));
      for (const j of relevant) {
        const loc = (j.location?.name || '').toLowerCase();
        const content = (j.content || '').replace(/<[^>]+>/g, ' ').toLowerCase();
        // Only include if remote signal exists
        const isRemote = loc.includes('remote') || content.includes('remote') || loc === 'united states' || loc === '' || loc === 'usa';
        if (!isRemote) continue;
        jobs.push({ title: j.title, company: co.charAt(0).toUpperCase()+co.slice(1),
          location: loc.includes('remote') ? 'Remote' : 'United States (Remote-eligible)',
          workType: 'Remote',
          salary: 'Not Listed',
          posted: j.updated_at ? new Date(j.updated_at).toLocaleDateString() : 'Recent',
          url: j.absolute_url, source: 'Greenhouse',
          snippet: (j.content||'').replace(/<[^>]+>/g,' ').substring(0,300) });
      }
      if (relevant.length) console.log(`   ✅ ${co}: ${relevant.length} relevant (${jobs.filter(j=>j.company.toLowerCase()===co).length} remote)`);
    } catch(e) { /* skip */ }
  }
  return jobs;
}

async function fetchLever() {
  const jobs = [];
  const companies = [
    'rippling','gusto','justworks','bamboohr','namely','paycor','paylocity',
    'leapsome','lattice','hibob','cultureamp','remote','oysterhr','deel',
    'papayaglobal','velocityglobal','multiplier','partnerstack','workato',
    'checkr','firstadvantage','experian','hubspot','zendesk','freshworks',
    'salesloft','gong','clari','vanta','drata','fivetran','hightouch',
    'servicenow','salesforce','navan','brex','ramp'
  ];
  for (const co of companies) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${co}?mode=json&state=published`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      const relevant = (Array.isArray(data) ? data : []).filter(j => /partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|vp\b|vice.?pres|director|head.?of/i.test(j.text));
      for (const j of relevant) {
        const loc = (j.categories?.location || '').toLowerCase();
        const desc = (j.descriptionPlain || '').toLowerCase();
        const isRemote = loc.includes('remote') || desc.includes('remote') || loc === '' || loc === 'united states' || loc === 'usa';
        if (!isRemote) continue;
        jobs.push({ title: j.text, company: co.charAt(0).toUpperCase()+co.slice(1),
          location: loc.includes('remote') ? 'Remote' : 'United States',
          workType: 'Remote',
          salary: 'Not Listed',
          posted: j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Recent',
          url: j.hostedUrl, source: 'Lever',
          snippet: (j.descriptionPlain||'').substring(0,300) });
      }
      if (relevant.length) console.log(`   ✅ ${co}: ${relevant.length} relevant`);
    } catch(e) { /* skip */ }
  }
  return jobs;
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
const TITLE_REJECTS = [
  'engineer','software','developer','devops','data scientist','analyst','designer',
  'product manager','marketing','finance','accounting','legal','recruiter','hr ',
  'talent','it ','infrastructure','security engineer','field marketing','media ',
  'demand gen','social media','content ','seo','paid ','growth hacker'
];

function meetsRequirements(job) {
  const title = (job.title || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();

  // Must have VP/Director/Head level
  if (!/vp\b|vice.?pres|director|head.?of|senior.?director|chief/.test(title)) return false;

  // Must be partnerships/alliances/channel/CS/RevOps function  
  if (!/partner|alliance|channel|reseller|customer.?success|revenue.?ops|revops|business.?dev|gtm|go.to.market/.test(title)) return false;

  // Reject clearly wrong functions
  if (TITLE_REJECTS.some(r => title.includes(r))) return false;

  return true;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH AGENT');
  console.log(`DATE: ${dateStr}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(DOCS_RESULTS_DIR)) fs.mkdirSync(DOCS_RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  const previousTopPicks = loadTopPicks();
  console.log(`\nPreviously seen (last 14 days): ${seenUrls.size}`);
  console.log(`Previous top picks: ${previousTopPicks.length}`);

  // Fetch from all sources
  console.log('\n📡 Fetching from all sources...');
  const [remotiveJobs, wwrJobs, greenhouseJobs, leverJobs] = await Promise.all([
    fetchRemotive(),
    fetchWWR(),
    fetchGreenhouse(),
    fetchLever()
  ]);

  const allJobs = [...remotiveJobs, ...wwrJobs, ...greenhouseJobs, ...leverJobs];
  console.log(`\n📊 Raw total: ${allJobs.length}`);

  // Dedup by URL
  const urlSet = new Set();
  const deduped = allJobs.filter(j => {
    if (!j.url || urlSet.has(j.url)) return false;
    urlSet.add(j.url); return true;
  });
  console.log(`📊 After dedup: ${deduped.length}`);

  // Filter by title/role requirements
  const qualified = deduped.filter(meetsRequirements);
  console.log(`✅ After title filter: ${qualified.length}`);

  // Remove already seen
  const newJobs = qualified.filter(j => !seenUrls.has(j.url));
  console.log(`🆕 New this run: ${newJobs.length}`);

  // Score and sort
  const scored = newJobs.map(j => ({ ...j, ...scoreJob(j) })).sort((a, b) => b.score - a.score);

  console.log(`\n🏆 Top results:`);
  scored.slice(0, 5).forEach((j, i) => console.log(`   ${i+1}. [${j.score}] ${j.title} @ ${j.company} (${j.location})`));

  // Save seen URLs
  const newUrlSet = new Set(scored.map(j => j.url));
  saveSeenUrls(seenUrls, newUrlSet);

  // Save top picks for next email's revisit section
  const topPicks = scored.filter(j => j.score >= 65).slice(0, 5);
  if (scored.length > 0) saveTopPicks(topPicks.length > 0 ? topPicks : scored.slice(0, 3));

  // Save today.json
  const output = { date: dateStr, count: scored.length, jobs: scored, topPicks: previousTopPicks, currentTopPicks: topPicks };
  fs.writeFileSync(TODAY_PATH, JSON.stringify(output, null, 2));
  fs.writeFileSync(DOCS_TODAY_PATH, JSON.stringify(output, null, 2));

  console.log(`\n✅ Done! ${scored.length} jobs saved.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(TODAY_PATH, JSON.stringify({ date: new Date().toLocaleDateString(), count: 0, jobs: [], topPicks: [], error: err.message }, null, 2));
  process.exit(1);
});
