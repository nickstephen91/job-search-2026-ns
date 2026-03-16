// Nick Stephen Job Search Agent - v13 - Intelligent Scoring
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const DOCS_RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const DOCS_TODAY_PATH = path.join(DOCS_RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');

// ── NICK'S RESUME KEYWORDS (from actual CV) ──────────────────────────────────
const RESUME_KEYWORDS = [
  // Core function
  'partner','partnership','partnerships','alliance','alliances','reseller','resellers',
  'channel','channel program','channel sales','co-marketing','co-branded',
  'joint sales','partner ecosystem','partner enablement','partner onboarding',
  'partner tiering','partner lifecycle','partner sourcing',
  // Revenue / GTM
  'go-to-market','gtm','revenue operations','revenue engine','pipeline',
  'deal velocity','distribution','lead-gen','lead generation',
  'business development','bd','crm','sales alignment','sales intelligence',
  // HR Tech / Industry
  'hr tech','hrtech','hcm','peo','professional employer','payroll','payroll platform',
  'compliance','workforce solutions','employer services','background screening',
  'unemployment cost','workforce','hr platform','hris',
  // Operations / Strategy
  'cross-functional','scalable','workflow automation','pricing architecture',
  'contracting','kpi','reporting','dashboards','qbr','executive reporting',
  'partner success framework','integration','tech stack','operationaliz',
  // Seniority signals
  'vice president','vp','director','alliances director','alliance director',
  'head of partnerships','head of alliances','head of channel',
  'senior director','managing director',
];

// ── DISQUALIFYING REQUIREMENTS (fields Nick has NO experience in) ─────────────
const HARD_DISQUALIFIERS = [
  // Healthcare / Medical
  'healthcare experience required','medical device','health system','clinical',
  'hospital','pharmaceutical','biotech','life sciences','healthcare industry',
  'health tech required','electronic health record','ehr experience',
  'hipaa compliance experience','nursing','physician',
  // Cloud / Infrastructure / DevOps
  'cloud infrastructure','aws required','azure required','gcp required',
  'devops','kubernetes','terraform','cloud architecture','cloud computing experience',
  'infrastructure experience','network engineering','cybersecurity experience',
  // Software Engineering
  'software engineering background','engineering degree required',
  'computer science degree','coding experience','programming experience',
  'software development experience','technical engineering',
  // Finance / Banking
  'investment banking','private equity experience','hedge fund',
  'financial services experience required','securities','trading experience',
  'banking experience required','asset management',
  // Legal / Compliance specific
  'legal experience required','bar exam','attorney','esquire','j.d. required',
  'law degree',
  // Manufacturing / Supply Chain
  'manufacturing experience','supply chain required','logistics experience',
  'warehouse management','lean manufacturing','six sigma required',
  // Real Estate
  'real estate license','property management experience',
  // Specific tech stacks Nick doesn't have
  'salesforce developer','salesforce engineer','sap experience required',
  'oracle experience required',
  // Education sector
  'higher education experience','k-12','school district',
  // Government
  'government clearance','security clearance required','federal government',
  'dod experience','military required',
];

// ── INDUSTRY SCORING (30% of total) ──────────────────────────────────────────
const INDUSTRY_SIGNALS = {
  tier1: { // Perfect fit - 30pts
    patterns: ['peo','professional employer','background screening','background check',
               'employer services','unemployment','workforce solutions','i-9','e-verify',
               'hrworkcycles','experian employer','cccverify','first advantage','sterling'],
    score: 30
  },
  tier2: { // Strong fit - 22pts
    patterns: ['hr tech','hrtech','human resources technology','hcm','payroll',
               'workforce management','hris','benefits administration','talent management',
               'compliance technology','hr platform','hr software','hr saas'],
    score: 22
  },
  tier3: { // Good fit - 15pts
    patterns: ['saas','b2b software','enterprise software','fintech','insurtech',
               'vertical saas','smb software','workforce','employment','staffing'],
    score: 15
  },
  tier4: { // Acceptable - 8pts
    patterns: ['software','technology','platform','cloud','data','analytics'],
    score: 8
  }
};

// ── SALARY PARSING ────────────────────────────────────────────────────────────
function parseSalary(text) {
  if (!text) return null;
  // Extract numbers from salary strings like "$120k-$160k", "120,000 - 160,000", etc.
  const cleaned = text.replace(/,/g, '').toLowerCase();
  const matches = cleaned.match(/\$?(\d+)k?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.map(m => {
    const n = parseFloat(m.replace(/[$k]/g, ''));
    return m.includes('k') || n < 1000 ? n * 1000 : n;
  }).filter(n => n >= 30000 && n <= 2000000);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), avg: nums.reduce((a,b)=>a+b,0)/nums.length };
}

function scoreSalary(salary, text) {
  // Try to parse from salary field first, then from text
  let parsed = parseSalary(salary);
  if (!parsed) parsed = parseSalary(text);
  if (!parsed) return 5; // No salary info — neutral score

  const { min, max, avg } = parsed;
  if (max < 80000) return 0; // Below threshold entirely
  if (min >= 150000) return 20; // Strong comp
  if (min >= 120000) return 17;
  if (min >= 100000) return 14;
  if (min >= 80000) return 10; // Base includes 80-100k range
  return 5;
}

// ── MAIN SCORING ──────────────────────────────────────────────────────────────
function scoreJob(job) {
  const title = (job.title || '').toLowerCase();
  const snippet = (job.snippet || '').toLowerCase();
  const text = title + ' ' + snippet;

  // ── 1. HARD DISQUALIFIER CHECK (instant reject) ───────────────────────────
  for (const dq of HARD_DISQUALIFIERS) {
    if (text.includes(dq)) {
      return { score: 0, tier: '🚫 Disqualified', disqualifier: dq, skip: true };
    }
  }

  // ── 2. INDUSTRY SCORE (30 pts max) ───────────────────────────────────────
  let industryScore = 0;
  for (const [tier, { patterns, score }] of Object.entries(INDUSTRY_SIGNALS)) {
    if (patterns.some(p => text.includes(p))) {
      industryScore = score;
      break;
    }
  }

  // ── 3. KEYWORD MATCH SCORE (50 pts max) ──────────────────────────────────
  // Match against Nick's resume keywords found in job description
  const matchedKeywords = RESUME_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  const keywordScore = Math.min(50, matchedKeywords.length * 3);

  // ── 4. SALARY SCORE (20 pts max) ─────────────────────────────────────────
  const salaryScore = scoreSalary(job.salary, snippet);

  const total = Math.min(100, industryScore + keywordScore + salaryScore);
  const tier = total >= 80 ? '🔥 Must Apply' :
               total >= 65 ? '⭐ Strong Match' :
               total >= 50 ? '👍 Good Fit' : '👀 Worth a Look';

  return { score: total, tier, matchedKeywords: matchedKeywords.slice(0, 8), industryScore, keywordScore, salaryScore };
}

// ── TITLE / ROLE FILTER ───────────────────────────────────────────────────────
const TITLE_REQUIRED_LEVEL = /\bvp\b|vice.?pres|director|head.?of|senior.?director|chief|manager|senior.?manager/i;
const TITLE_REQUIRED_FUNCTION = /partner|alliance|channel|reseller|customer.?success|revenue.?ops|revops|business.?dev|gtm|go.to.market|account.?management|sales/i;
const TITLE_REJECTS = /\bengineer\b|\bdeveloper\b|\bdevops\b|data.?scientist|\bdesigner\b|product.?manager|field.?marketing|\bmedia\b|demand.?gen|social.?media|\bcontent\b|\bseo\b|\bpaid\b|accountant|\bfinance\b|\blegal\b|\brecruiter\b|\bhr.?business\b|talent.?acquisition|it.?director|infrastructure/i;

function meetsRequirements(job) {
  const title = (job.title || '');
  if (!TITLE_REQUIRED_LEVEL.test(title)) return false;
  if (!TITLE_REQUIRED_FUNCTION.test(title)) return false;
  if (TITLE_REJECTS.test(title)) return false;
  return true;
}

// ── LOCATION CHECK ────────────────────────────────────────────────────────────
const STUART_FL_CITIES = [
  'stuart','port st. lucie','port saint lucie','fort pierce','vero beach',
  'jupiter','palm beach gardens','west palm beach','lake worth','boynton beach',
  'okeechobee','hobe sound','jensen beach','palm city','indiantown',
  'sebastian','boca raton','delray beach','florida', ', fl'
];

function isLocationOk(job) {
  const loc = (job.location || '').toLowerCase();
  const workType = (job.workType || '').toLowerCase();
  const snippet = (job.snippet || '').toLowerCase();

  if (workType === 'remote') return true;
  if (loc.includes('remote')) return true;
  if (snippet.includes('this is a remote') || snippet.includes('fully remote') || snippet.includes('100% remote')) return true;
  if (STUART_FL_CITIES.some(c => loc.includes(c))) return true;
  return false;
}

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
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

// ── SOURCES ───────────────────────────────────────────────────────────────────
async function fetchRemotive() {
  const jobs = [];
  const queries = ['partnerships director','alliances vp','channel director','customer success vp','revenue operations director','business development director'];
  for (const q of queries) {
    try {
      const r = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=20`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const d = await r.json();
      for (const j of (d.jobs || [])) {
        jobs.push({ title: j.title, company: j.company_name, location: 'Remote', workType: 'Remote',
          salary: j.salary || 'Not Listed',
          posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
          url: j.url, source: 'Remotive',
          snippet: (j.description||'').replace(/<[^>]+>/g,' ').substring(0,500) });
      }
      if ((d.jobs||[]).length) console.log(`   ✅ Remotive "${q}": ${(d.jobs||[]).length}`);
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
        const desc = ((item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || [])[1] || '').replace(/<[^>]+>/g,' ');
        if (title) jobs.push({ title, company, location: 'Remote', workType: 'Remote',
          salary: 'Not Listed', posted: 'Recent',
          url: link.startsWith('http') ? link : `https://weworkremotely.com${link}`,
          source: 'WWR', snippet: desc.substring(0, 500) });
      }
      if (items.length) console.log(`   ✅ WWR ${cat}: ${items.length}`);
    } catch(e) { console.log(`   ❌ WWR ${cat}: ${e.message}`); }
  }
  return jobs;
}

async function fetchGreenhouse() {
  const jobs = [];
  const companies = [
    'rippling','gusto','justworks','trinet','bamboohr','namely','paycor','paylocity','paycom',
    'isolved','leapsome','lattice','hibob','cultureamp','15five','personio','factorial',
    'remote','oysterhr','papayaglobal','velocityglobal','deel','multiplier','horizons',
    'partnerstack','workato','navan','experian','firstadvantage','sterlingcheck',
    'checkr','accurate','vanta','drata','fivetran','hightouch','hubspot',
    'zendesk','freshworks','intercom','salesloft','gong','clari','outreach',
    'adp','ceridian','ukg','dayforce','workday','successfactors'
  ];
  for (const co of companies) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const d = await r.json();
      const relevant = (d.jobs || []).filter(j => /partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|vp\b|vice.?pres|director|head.?of|manager/i.test(j.title));
      for (const j of relevant) {
        const loc = (j.location?.name || '').toLowerCase();
        const content = (j.content || '').replace(/<[^>]+>/g, ' ');
        const contentLower = content.toLowerCase();
        const isRemote = loc.includes('remote') || contentLower.includes('remote') || 
                         loc === 'united states' || loc === '' || loc === 'usa' || loc === 'north america';
        if (!isRemote) continue;
        jobs.push({ title: j.title, company: co.charAt(0).toUpperCase()+co.slice(1),
          location: loc.includes('remote') ? 'Remote' : 'United States',
          workType: 'Remote',
          salary: 'Not Listed',
          posted: j.updated_at ? new Date(j.updated_at).toLocaleDateString() : 'Recent',
          url: j.absolute_url, source: 'Greenhouse',
          snippet: content.substring(0, 500) });
      }
      if (relevant.length) console.log(`   ✅ ${co}: ${relevant.length} relevant`);
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
    'servicenow','salesforce','navan','brex','ramp','intercom','outreach'
  ];
  for (const co of companies) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${co}?mode=json&state=published`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      const relevant = (Array.isArray(data) ? data : []).filter(j => /partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|vp\b|vice.?pres|director|head.?of|manager/i.test(j.text));
      for (const j of relevant) {
        const loc = (j.categories?.location || '').toLowerCase();
        const desc = (j.descriptionPlain || '');
        const isRemote = loc.includes('remote') || desc.toLowerCase().includes('remote') || loc === '' || loc === 'united states';
        if (!isRemote) continue;
        jobs.push({ title: j.text, company: co.charAt(0).toUpperCase()+co.slice(1),
          location: loc.includes('remote') ? 'Remote' : 'United States',
          workType: 'Remote', salary: 'Not Listed',
          posted: j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Recent',
          url: j.hostedUrl, source: 'Lever',
          snippet: desc.substring(0, 500) });
      }
      if (relevant.length) console.log(`   ✅ ${co}: ${relevant.length} relevant`);
    } catch(e) { /* skip */ }
  }
  return jobs;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH AGENT v13');
  console.log(`DATE: ${dateStr}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(DOCS_RESULTS_DIR)) fs.mkdirSync(DOCS_RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  const previousTopPicks = loadTopPicks();
  console.log(`\nPreviously seen: ${seenUrls.size} | Previous top picks: ${previousTopPicks.length}`);

  console.log('\n📡 Fetching from all sources...');
  const [remotiveJobs, wwrJobs, greenhouseJobs, leverJobs] = await Promise.all([
    fetchRemotive(), fetchWWR(), fetchGreenhouse(), fetchLever()
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

  // Title/role filter
  const qualified = deduped.filter(j => {
    if (!meetsRequirements(j)) return false;
    if (!isLocationOk(j)) { console.log(`   📍 Location reject: "${j.title}" @ ${j.location}`); return false; }
    return true;
  });
  console.log(`✅ After title+location filter: ${qualified.length}`);

  // Remove already seen
  const newJobs = qualified.filter(j => !seenUrls.has(j.url));
  console.log(`🆕 New this run: ${newJobs.length}`);

  // Score, disqualify, and sort
  const scored = [];
  let disqualified = 0;
  for (const j of newJobs) {
    const s = scoreJob(j);
    if (s.skip) { console.log(`   🚫 Disqualified (${s.disqualifier}): ${j.title} @ ${j.company}`); disqualified++; continue; }
    scored.push({ ...j, ...s });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log(`✅ After disqualifiers: ${scored.length} (removed ${disqualified})`);

  // Summary
  console.log(`\n   🔥 Must Apply (80+): ${scored.filter(j=>j.score>=80).length}`);
  console.log(`   ⭐ Strong Match (65-79): ${scored.filter(j=>j.score>=65&&j.score<80).length}`);
  console.log(`   👍 Good Fit (50-64): ${scored.filter(j=>j.score>=50&&j.score<65).length}`);
  console.log(`   👀 Worth a Look (<50): ${scored.filter(j=>j.score<50).length}`);

  console.log(`\n🏆 Top 5:`);
  scored.slice(0, 5).forEach((j, i) => console.log(`   ${i+1}. [${j.score}] ${j.title} @ ${j.company} | ${j.tier}`));

  // Save
  const newUrlSet = new Set(scored.map(j => j.url));
  saveSeenUrls(seenUrls, newUrlSet);
  const topPicks = scored.filter(j => j.score >= 65).slice(0, 5);
  if (scored.length > 0) saveTopPicks(topPicks.length > 0 ? topPicks : scored.slice(0, 3));

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
