// Nick Stephen Job Search Agent - search.js CLEAN v11
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');
const { rankJob } = require('./rank-engine');

// ── PERSISTENCE ──────────────────────────────────────────────────────────────
function loadSeenUrls() {
  try {
    if (!fs.existsSync(SEEN_URLS_PATH)) return new Set();
    const data = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8'));
    // Only keep URLs from the last 14 days to prevent seen list from growing forever
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const recent = (data.entries || []).filter(e => e.ts > cutoff);
    return new Set(recent.map(e => e.url));
  } catch { return new Set(); }
}

function saveSeenUrls(seenUrls, newUrls) {
  let existing = [];
  try {
    if (fs.existsSync(SEEN_URLS_PATH)) {
      existing = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8')).entries || [];
    }
  } catch {}
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
  const kept = existing.filter(e => e.ts > cutoff && !newUrls.has(e.url));
  const added = Array.from(newUrls).map(url => ({ url, ts: Date.now() }));
  fs.writeFileSync(SEEN_URLS_PATH, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalTracked: kept.length + added.length,
    entries: [...kept, ...added]
  }, null, 2));
}

function loadTopPicks() {
  try {
    if (!fs.existsSync(TOP_PICKS_PATH)) return [];
    return JSON.parse(fs.readFileSync(TOP_PICKS_PATH, 'utf8')).picks || [];
  } catch { return []; }
}

function saveTopPicks(jobs) {
  if (!jobs || jobs.length === 0) return;
  const priority = ['vp', 'vice president', 'hr tech', 'hcm', 'peo', 'payroll', 'compliance', 'saas', 'partnership', 'alliance'];
  const ranked = [...jobs].sort((a, b) => {
    const at = `${a.title} ${a.industry || ''}`.toLowerCase();
    const bt = `${b.title} ${b.industry || ''}`.toLowerCase();
    return priority.filter(p => bt.includes(p)).length - priority.filter(p => at.includes(p)).length;
  });
  fs.writeFileSync(TOP_PICKS_PATH, JSON.stringify({
    savedAt: new Date().toISOString(),
    picks: ranked.slice(0, 5)
  }, null, 2));
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
const SENIOR_TITLES = ['director', 'vp', 'vice president', 'head of', 'senior director',
  'svp', 'chief', 'principal', 'senior manager', 'sr. manager', 'sr manager'];
const HARD_JUNIOR = ['coordinator', 'specialist', 'analyst', 'junior', 'intern', 'assistant'];
const TARGET_FUNCTIONS = ['partner', 'alliance', 'channel', 'reseller', 'ecosystem',
  'customer success', 'client success', 'revenue oper', 'revops', 'sales oper',
  'business development', 'account manag', 'enablement', 'go-to-market', 'gtm',
  'strategic account', 'sales enablement', 'partner success', 'growth',
  'commercial', 'revenue', 'sales', 'relationship', 'enterprise', 'market'];

// Cities within ~60 miles of Stuart FL 34997
const IN_RADIUS = [
  'stuart', 'port st. lucie', 'port saint lucie', 'fort pierce', 'vero beach',
  'jupiter', 'palm beach gardens', 'west palm beach', 'lake worth', 'boynton beach',
  'okeechobee', 'hobe sound', 'jensen beach', 'palm city', 'indiantown',
  'sebastian', 'boca raton', 'delray beach', 'florida', ', fl', ', fl '
];

// Cities that are too far — reject unless remote
const TOO_FAR = [
  'miami', 'fort lauderdale', 'orlando', 'tampa', 'jacksonville',
  'california', ' ca,', ', ca ', 'new york', ' ny,', ', ny ',
  'texas', ' tx,', ', tx ', 'chicago', 'illinois', ' il,',
  'seattle', 'washington', ' wa,', 'boston', 'massachusetts',
  'colorado', ' co,', 'denver', 'atlanta', 'georgia', ' ga,',
  'redwood city', 'san francisco', 'los angeles', 'austin', 'dallas',
  'houston', 'phoenix', 'arizona', 'ohio', 'michigan', 'minnesota',
  'virginia', 'north carolina', 'tennessee', 'nevada', 'las vegas'
];

function isLocationOk(job) {
  const loc = (job.location || '').toLowerCase();
  const workType = (job.workType || '').toLowerCase();

  // Always allow remote
  if (workType === 'remote' || loc.includes('remote')) return true;

  // Allow if in radius
  if (IN_RADIUS.some(c => loc.includes(c))) return true;

  // Reject if clearly too far
  if (TOO_FAR.some(c => loc.includes(c))) return false;

  // If location is vague (e.g. "United States", "USA", blank) — allow it
  return true;
}

function meetsRequirements(job) {
  // FILTER 1: Location
  if (!isLocationOk(job)) {
    console.log(`   📍 Location reject: "${job.title}" @ ${job.location}`);
    return false;
  }

  // FILTER 2: Seniority
  const title = (job.title || '').toLowerCase();
  const isSenior = SENIOR_TITLES.some(t => title.includes(t));
  const isHardJunior = HARD_JUNIOR.some(t => title.includes(t)) && !isSenior;
  if (!isSenior || isHardJunior) return false;

  // FILTER 3: Salary floor
  if (job.salary && job.salary !== 'Not Listed') {
    const nums = job.salary.replace(/[^0-9]/g, ' ').trim().split(/\s+/)
      .map(Number).filter(n => n > 10000 && n < 2000000);
    if (nums.length > 0 && Math.max(...nums) < 100000) return false;
  }

  // FILTER 4: Target function
  return TARGET_FUNCTIONS.some(f => title.includes(f));
}

// ── SOURCES ───────────────────────────────────────────────────────────────────
async function fetchIndeedRSS(q, l) {
  const url = `https://www.indeed.com/rss?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&sort=date&fromage=14`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS/2.0)' } });
  if (!res.ok) throw new Error(`Indeed ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = match[1];
    const get = (tag) => (x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's')) || [])[1]?.trim() || '';
    const title = get('title'); const link = get('link'); const desc = get('description');
    if (title && link) items.push({
      title, company: 'See posting', location: l, workType: desc.toLowerCase().includes('remote') ? 'Remote' : 'See posting',
      salary: 'Not Listed', posted: 'Recent', url: link, source: 'Indeed', snippet: desc.replace(/<[^>]+>/g, '').substring(0, 200), industry: '', companyStage: ''
    });
  }
  return items;
}

async function fetchRemotive(q) {
  const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=20`);
  if (!res.ok) throw new Error(`Remotive ${res.status}`);
  const { jobs = [] } = await res.json();
  return jobs.map(j => ({
    title: j.title, company: j.company_name, location: 'Remote', workType: 'Remote',
    salary: j.salary || 'Not Listed', posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
    url: j.url, source: 'Remotive', snippet: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    industry: j.category || '', companyStage: ''
  }));
}

async function fetchTheMuse(q) {
  const res = await fetch(`https://www.themuse.com/api/public/jobs?descending=true&page=1&query=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Muse ${res.status}`);
  const { results = [] } = await res.json();
  return results.map(j => ({
    title: j.name, company: j.company?.name || '', location: j.locations?.[0]?.name || 'Remote',
    workType: (j.locations?.[0]?.name || '').toLowerCase().includes('remote') ? 'Remote' : 'Hybrid',
    salary: 'Not Listed', posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
    url: j.refs?.landing_page || '', source: 'The Muse',
    snippet: (j.contents || '').replace(/<[^>]+>/g, '').substring(0, 200),
    industry: j.categories?.[0]?.name || '', companyStage: ''
  }));
}

async function fetchArbeitnow(q) {
  const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Arbeitnow ${res.status}`);
  const { data = [] } = await res.json();
  return data.filter(j => j.remote).map(j => ({
    title: j.title, company: j.company_name, location: 'Remote', workType: 'Remote',
    salary: j.salary || 'Not Listed',
    posted: j.created_at ? new Date(j.created_at * 1000).toLocaleDateString() : 'Recent',
    url: j.url, source: 'Arbeitnow',
    snippet: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    industry: j.tags?.[0] || '', companyStage: ''
  }));
}

async function fetchViaClaudeSearch(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const start = text.indexOf('['); const end = text.lastIndexOf(']');
  if (start === -1) return [];
  try {
    const jobs = JSON.parse(text.substring(start, end + 1));
    return jobs.filter(j => j.title && j.url);
  } catch { return []; }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

// ── RANKING SYSTEM ────────────────────────────────────────────────────────────
// 0-100 score. Nick's priority order:
// 1. Compensation (30pts)  2. Industry (25pts)  3. Remote (20pts)
// 4. Title match (15pts)   5. Company stage (10pts)  -5 unlisted salary penalty


async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH AGENT');
  console.log(`DATE: ${dateStr}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  const previousTopPicks = loadTopPicks();
  console.log(`\nPreviously seen (last 14 days): ${seenUrls.size}`);
  console.log(`Previous top picks: ${previousTopPicks.length}\n`);

  let allJobs = [];

  // Indeed RSS
  const indeedSearches = [
    { q: 'Director of Partnerships', l: 'remote' },
    { q: 'VP of Partnerships', l: 'remote' },
    { q: 'Director of Alliances', l: 'remote' },
    { q: 'VP of Alliances', l: 'remote' },
    { q: 'Director of Customer Success', l: 'remote' },
    { q: 'VP of Customer Success', l: 'remote' },
    { q: 'Director of Revenue Operations', l: 'remote' },
    { q: 'Director of Channel Sales', l: 'remote' },
    { q: 'Director of Business Development', l: 'remote' },
    { q: 'Head of Partnerships', l: 'remote' },
    { q: 'Senior Director Partnerships', l: 'remote' },
    { q: 'Director of Sales Operations', l: 'remote' },
    { q: 'Director of Account Management', l: 'remote' },
    { q: 'VP Business Development', l: 'remote' },
    { q: 'Director Partnerships', l: 'West Palm Beach, FL' },
    { q: 'Director Customer Success', l: 'West Palm Beach, FL' },
    { q: 'Director Business Development', l: 'West Palm Beach, FL' },
  ];

  console.log('📡 Indeed RSS...');
  for (const { q, l } of indeedSearches) {
    try {
      const jobs = await fetchIndeedRSS(q, l);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 800));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // Remotive
  console.log('\n📡 Remotive API...');
  for (const q of ['partnerships', 'alliances', 'customer success', 'revenue operations', 'channel sales', 'business development', 'account management', 'sales enablement', 'ecosystem']) {
    try {
      const jobs = await fetchRemotive(q);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // The Muse
  console.log('\n📡 The Muse...');
  try {
    const jobs = await fetchTheMuse('director partnerships alliances customer success');
    console.log(`   ✅ ${jobs.length} results`); allJobs = allJobs.concat(jobs);
  } catch (e) { console.log(`   ❌ ${e.message}`); }

  // Arbeitnow
  console.log('\n📡 Arbeitnow...');
  try {
    const jobs = await fetchArbeitnow('director partnerships');
    console.log(`   ✅ ${jobs.length} results`); allJobs = allJobs.concat(jobs);
  } catch (e) { console.log(`   ❌ ${e.message}`); }

  // Claude ATS search
  console.log('\n📡 Claude ATS search...');
  const atsPrompts = [
    `Search greenhouse.io job board for active Director and VP level Partnerships, Alliances, Customer Success roles posted in the last 30 days. Return as JSON array: [{"title":"","company":"","location":"","workType":"Remote","salary":"Not Listed","posted":"","url":"","source":"Greenhouse","snippet":"","industry":"","companyStage":""}]`,
    `Search lever.co job board for active Director and VP level Partnerships, Channel, Revenue Operations, Business Development roles. Return as JSON array only.`
  ];
  for (const prompt of atsPrompts) {
    try {
      const jobs = await fetchViaClaudeSearch(prompt);
      console.log(`   ✅ ${jobs.length} results`); allJobs = allJobs.concat(jobs);
      await new Promise(r => setTimeout(r, 10000));
    } catch (e) { console.log(`   ❌ ${e.message}`); }
  }

  // Dedup
  const urlSet = new Set();
  const deduped = allJobs.filter(j => {
    if (!j.url || urlSet.has(j.url)) return false;
    urlSet.add(j.url); return true;
  });
  console.log(`\n📊 Total unique: ${deduped.length}`);

  // Filter
  const qualified = deduped.filter(meetsRequirements);
  console.log(`✅ After filters: ${qualified.length}`);

  // New only
  const newJobs = qualified
    .filter(j => !seenUrls.has(j.url))
    .map(j => {
      const ranking = rankJob(j);
      return { ...j, foundDate: new Date().toISOString(), ...ranking };
    })
    .sort((a, b) => b.score - a.score);

  console.log(`🆕 New this run: ${newJobs.length}`);
  if (newJobs.length > 0) {
    console.log(`   🔥 Prime Match (80+): ${newJobs.filter(j => j.score >= 80).length}`);
    console.log(`   ⭐ Strong Fit (65-79): ${newJobs.filter(j => j.score >= 65 && j.score < 80).length}`);
    console.log(`   👍 Good Fit (50-64): ${newJobs.filter(j => j.score >= 50 && j.score < 65).length}`);
    console.log(`   👀 Worth a Look (35-49): ${newJobs.filter(j => j.score >= 35 && j.score < 50).length}`);
  }

  // Rank all new jobs
  const rankedJobs = newJobs
    .map(j => ({ ...j, rank: rankJob(j) }))
    .sort((a, b) => b.rank.total - a.rank.total);

  console.log(`\n🏆 Top 3 ranked jobs:`);
  rankedJobs.slice(0, 3).forEach((j, i) => {
    console.log(`   ${i+1}. [${j.rank.total}/100] ${j.title} @ ${j.company}`);
  });

  // Save top picks for next email (top 5 by rank)
  if (rankedJobs.length > 0) saveTopPicks(rankedJobs.slice(0, 5));

  // Update seen URLs — only add the new qualified ones
  const newUrlSet = new Set(newJobs.map(j => j.url));
  saveSeenUrls(seenUrls, newUrlSet);

  // Save today
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: dateStr, count: rankedJobs.length,
    jobs: rankedJobs, topPicks: previousTopPicks
  }, null, 2));

  console.log(`\n✅ Done! ${rankedJobs.length} ranked jobs queued for email.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: new Date().toLocaleDateString(), count: 0, jobs: [], topPicks: [], error: err.message
  }, null, 2));
  process.exit(1);
});
