// Nick Stephen Job Search Agent - search.js CLEAN v11
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const DOCS_RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const DOCS_TODAY_PATH = path.join(DOCS_RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');

// ── MANUAL BLOCKLIST — jobs confirmed dead/irrelevant, never show again ────
const BLOCKED_JOBS = [
  { company: 'checkr', title: 'vp, partnerships' },      // confirmed expired
  { company: 'checkr', title: 'vp partnerships' },
];

function isBlocked(job) {
  const co = (job.company || '').toLowerCase().trim();
  const ti = (job.title || '').toLowerCase().trim();
  return BLOCKED_JOBS.some(b => co.includes(b.company) && ti.includes(b.title));
}

// ── PERSISTENCE ──────────────────────────────────────────────────────────────
function loadSeenUrls() {
  try {
    if (!fs.existsSync(SEEN_URLS_PATH)) return new Set();
    const raw = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8'));
    // Handle both {entries:[]} format and plain [] array (from reset)
    const entries = Array.isArray(raw) ? [] : (Array.isArray(raw.entries) ? raw.entries : []);
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const recent = entries.filter(e => e && e.ts && e.ts > cutoff);
    return new Set(recent.map(e => e.url).filter(Boolean));
  } catch { return new Set(); }
}

function saveSeenUrls(seenUrls, newUrls) {
  let existing = [];
  try {
    if (fs.existsSync(SEEN_URLS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8'));
      // raw.entries exists as a native Array method on arrays — must check it's a real array
      const ent = raw && !Array.isArray(raw) && Array.isArray(raw.entries) ? raw.entries : [];
      existing = ent;
    }
  } catch {}
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
  const kept = existing.filter(e => e && e.ts && e.ts > cutoff && !newUrls.has(e.url));
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

const HARD_JUNIOR = ['coordinator', 'specialist', 'analyst', 'junior', 'intern', 'assistant',
  'associate', 'entry level', 'entry-level'];

// ── TIGHT function targeting — Nick's actual roles ─────────────────────────
// Must match his core competency: partnerships, alliances, channels, customer success, revops
const TARGET_FUNCTIONS = [
  // Core — partnerships/alliances/channel
  'partner', 'alliance', 'channel', 'reseller', 'ecosystem', 'indirect',
  'isv', 'var ', ' var,', 'distribution',
  // Customer success / account management
  'customer success', 'client success', 'account management', 'account manag',
  'strategic account', 'partner success', 'client relationship',
  // Revenue / sales operations
  'revenue oper', 'revops', 'sales oper', 'sales enablement',
  // Business development — only when standalone
  'business development',
  // GTM / enablement
  'go-to-market', 'gtm', 'enablement',
];

// ── HARD REJECT title patterns — even if seniority + function passes ───────
// These are roles that match loose keywords but are clearly not Nick's space
const HARD_REJECT_TITLES = [
  // Marketing disciplines
  'growth market', 'marketing director', 'marketing manager', 'marketing vp',
  'content market', 'demand generation', 'demand gen', 'brand market',
  'product market', 'field market', 'digital market', 'performance market',
  'seo', 'social media', 'email market', 'lifecycle market', 'communications',
  // Pure engineering/product
  'engineering director', 'software director', 'product director', 'data director',
  'engineering manager', 'product manager', 'engineering vp', 'product vp',
  'technical director', 'solutions engineer', 'sales engineer',
  // Finance/legal/HR/ops not Nick's space
  'finance director', 'financial director', 'legal director', 'hr director',
  'human resources', 'people director', 'talent director', 'recruiting director',
  'supply chain', 'logistics director', 'operations director', 'manufacturing',
  'facilities', 'real estate director',
  // Healthcare clinical
  'medical director', 'clinical director', 'nursing director', 'physician',
  'healthcare director', 'patient',
  // Trading/investment/securities
  'trading director', 'investment director', 'portfolio director', 'fund director',
  'wealth management', 'asset management', 'securities', 'hedge fund',
  // Other irrelevant
  'creative director', 'design director', 'art director', 'ux director',
  'research director', 'science director', 'policy director', 'government',
  'public sector', 'nonprofit',
];

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

  // FILTER 4: Hard reject — wrong role type even if title/seniority passes
  const isHardReject = HARD_REJECT_TITLES.some(r => title.includes(r));
  if (isHardReject) {
    console.log(`   🚫 Role reject: "${job.title}"`);
    return false;
  }

  // FILTER 5: Must match Nick's core functions
  const matchesFunction = TARGET_FUNCTIONS.some(f => title.includes(f));
  if (!matchesFunction) {
    console.log(`   🚫 Function reject: "${job.title}"`);
    return false;
  }

  return true;
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
    // guid is the direct job page URL; link is a redirect — prefer guid
    const guid = get('guid') || link;
    if (title && guid) items.push({
      title, company: 'See posting', location: l, workType: desc.toLowerCase().includes('remote') ? 'Remote' : 'See posting',
      salary: 'Not Listed', posted: 'Recent', url: guid, source: 'Indeed', snippet: desc.replace(/<[^>]+>/g, '').substring(0, 200), industry: '', companyStage: ''
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
      model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
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



// ── ADDITIONAL SOURCES ────────────────────────────────────────────────────────

async function fetchJobicy(q) {
  // Jobicy: free remote jobs API, no auth required
  const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=20&geo=usa&industry=sales&tag=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Jobicy ${res.status}`);
  const { jobs = [] } = await res.json();
  return jobs.map(j => ({
    title: j.jobTitle, company: j.companyName, location: 'Remote', workType: 'Remote',
    salary: j.annualSalaryMin ? `$${Math.round(j.annualSalaryMin/1000)}K-$${Math.round(j.annualSalaryMax/1000)}K` : 'Not Listed',
    posted: j.pubDate ? new Date(j.pubDate).toLocaleDateString() : 'Recent',
    url: j.url, source: 'Jobicy',
    snippet: (j.jobExcerpt || '').substring(0, 200),
    industry: j.jobIndustry?.[0] || '', companyStage: ''
  }));
}

async function fetchWWR(q) {
  // We Work Remotely RSS feed — one of the largest remote job boards
  const category = 'sales-and-marketing';
  const res = await fetch(`https://weworkremotely.com/categories/remote-${category}-jobs.rss`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS/2.0)' }
  });
  if (!res.ok) throw new Error(`WWR ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = match[1];
    const get = (tag) => (x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's')) || [])[1]?.trim() || '';
    const title = get('title'); const link = get('link'); const desc = get('description');
    const region = get('region');
    // WWR titles are "Company: Title" format
    const parts = title.split(': ');
    const company = parts.length > 1 ? parts[0].trim() : '';
    const jobTitle = parts.length > 1 ? parts.slice(1).join(': ').trim() : title;
    if (jobTitle && link) items.push({
      title: jobTitle, company, location: region || 'Remote', workType: 'Remote',
      salary: 'Not Listed', posted: 'Recent',
      url: link.startsWith('http') ? link : `https://weworkremotely.com${link}`,
      source: 'We Work Remotely',
      snippet: desc.replace(/<[^>]+>/g, '').substring(0, 200),
      industry: '', companyStage: ''
    });
  }
  return items;
}

async function fetchAdzuna(q) {
  // Adzuna: large aggregator with public API (no key needed for basic search via RSS)
  const url = `https://www.adzuna.com/search?q=${encodeURIComponent(q)}&w=remote&sort_by=date&days=14`;
  // Use RSS endpoint
  const rssUrl = `https://www.adzuna.com/api/v1/us/jobs/search/1?app_id=test&app_key=test&results_per_page=20&what=${encodeURIComponent(q)}&where=remote&sort_by=date&max_days_old=14`;
  // Fall back to scraping search via Claude API web_search
  return [];
}

async function fetchJooble(queries) {
  // Jooble: aggregator API (free tier)
  try {
    const res = await fetch('https://jooble.org/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: queries.join(' OR '), location: 'remote', page: 1 })
    });
    if (!res.ok) throw new Error(`Jooble ${res.status}`);
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      title: j.title, company: j.company, location: j.location || 'Remote',
      workType: (j.location || '').toLowerCase().includes('remote') ? 'Remote' : 'Hybrid',
      salary: j.salary || 'Not Listed',
      posted: j.updated ? new Date(j.updated).toLocaleDateString() : 'Recent',
      url: j.link, source: 'Jooble',
      snippet: (j.snippet || '').replace(/<[^>]+>/g, '').substring(0, 200),
      industry: '', companyStage: ''
    }));
  } catch { return []; }
}

async function fetchCareerJet(q) {
  // CareerJet: has a public API
  const res = await fetch(`https://public.api.careerjet.com/search/jobs?locale_code=en_US&keywords=${encodeURIComponent(q)}&location=remote&affid=null&sort=date&pagesize=20`);
  if (!res.ok) throw new Error(`CareerJet ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(j => ({
    title: j.title, company: j.company, location: j.locations || 'Remote',
    workType: (j.locations || '').toLowerCase().includes('remote') ? 'Remote' : 'Hybrid',
    salary: j.salary || 'Not Listed',
    posted: 'Recent',
    url: j.url, source: 'CareerJet',
    snippet: (j.description || '').substring(0, 200),
    industry: '', companyStage: ''
  }));
}

async function fetchLinkedInRSS(q) {
  // LinkedIn has public RSS for job searches — no auth needed
  const encoded = encodeURIComponent(q);
  const url = `https://www.linkedin.com/jobs/search/?keywords=${encoded}&location=United%20States&f_WT=2&f_TPR=r604800&sortBy=DD`;
  // LinkedIn blocks RSS/API scraping — use Claude web_search instead
  return [];
}

async function fetchGlassdoorViaSearch(q) {
  // Glassdoor doesn't have public API — use Claude search
  return [];
}

async function fetchClaudeATSSearch(prompt) {
  // Reuses fetchViaClaudeSearch — alias for clarity
  return fetchViaClaudeSearch(prompt);
}

// Nick Stephen Job Search Agent - rank-engine.js
// 100-point ranking system based on Nick's priorities

// ── NICK'S RESUME KEYWORDS ────────────────────────────────────────────────────
// Pulled directly from his CV — these are the exact skills/tools/domains he brings
const NICK_RESUME = {

  // Core competencies (high weight)
  coreSkills: [
    'partner enablement', 'co-marketing', 'channel program', 'reseller program',
    'alliance', 'partner ecosystem', 'partner onboarding', 'partner tiering',
    'go-to-market', 'gtm', 'revenue operations', 'pipeline', 'crm',
    'cross-functional', 'sales alignment', 'quota', 'arr',
    'peo', 'professional employer', 'hr tech', 'hrtech', 'hcm',
    'i-9', 'e-verify', 'wotc', 'work opportunity', 'unemployment',
    'compliance', 'workforce compliance', 'employer services',
    'integration', 'workflow automation', 'pricing architecture',
    'contracting', 'sop', 'qbr', 'kpi', 'dashboard', 'reporting',
    'partner lifecycle', 'co-sell', 'joint selling', 'field enablement'
  ],

  // Domain knowledge (medium weight)
  domain: [
    'saas', 'b2b', 'payroll', 'benefits', 'staffing', 'recruiting',
    'background screening', 'identity verification', 'tax credit',
    'cobra', 'aca', 'onboarding', 'workforce management', 'hris',
    'employer', 'enterprise', 'mid-market', 'smb', 'channel sales',
    'indirect sales', 'var', 'broker', 'referral program', 'distribution'
  ],

  // Tools & platforms (medium weight)
  tools: [
    'salesforce', 'sfdc', 'hubspot', 'crossbeam', 'impartner', 'alliances',
    'looker', 'tableau', 'partner portal', 'marketplaces', 'api',
    'zapier', 'slack', 'outreach', 'salesloft', 'gong'
  ],

  // Leadership signals (lower weight but still valuable)
  leadership: [
    'build from scratch', 'greenfield', 'first hire', 'stand up',
    'built and scaled', 'operationalize', 'architect', 'own',
    'reports to cro', 'reports to ceo', 'executive', 'vp level',
    'team leadership', 'hire and manage', 'direct reports'
  ]
};

// ── RANKING WEIGHTS ───────────────────────────────────────────────────────────
// Priorities set by Nick (ranked order):
// 1. Industry match
// 2. Role title match
// 3. Compensation
// 4. Company stage
// 5. Remote work type

const WEIGHTS = {
  industryMatch:   30,  // #1 priority
  titleMatch:      25,  // #2 priority
  resumeKeywords:  20,  // keyword match against resume
  compensation:    12,  // #3 priority
  companyStage:    8,   // #4 priority
  workType:        5,   // #5 priority
  // Total: 100
};

// ── SCORING FUNCTIONS ─────────────────────────────────────────────────────────

function scoreIndustry(job) {
  const text = `${job.title} ${job.snippet || ''} ${job.industry || ''} ${job.company || ''}`.toLowerCase();
  let score = 0;
  const matches = [];

  // ── HARD NEGATIVE — wrong industry signals, cap score low ─────────────────
  const hardNegative = [
    'trading', 'hedge fund', 'investment bank', 'securities', 'asset management',
    'wealth management', 'private equity', 'venture capital', 'insurance broker',
    'real estate', 'construction', 'manufacturing', 'oil and gas', 'energy sector',
    'mining', 'agriculture', 'hospitality', 'retail', 'ecommerce', 'e-commerce',
    'media', 'entertainment', 'gaming company', 'food and beverage', 'restaurant',
    'healthcare provider', 'hospital', 'clinical', 'pharmaceutical', 'biotech',
    'nonprofit', 'government', 'public sector', 'education', 'k-12', 'university',
    'advertising agency', 'marketing agency', 'pr agency', 'creative agency',
  ];
  const negHit = hardNegative.find(k => text.includes(k));
  if (negHit) {
    return { score: 0, matches: [`❌ Wrong industry: ${negHit}`] };
  }

  // ── Tier 1 — Nick's sweet spot (30pts) ────────────────────────────────────
  const tier1 = [
    'hr tech', 'hrtech', 'hcm', 'human capital management',
    'peo', 'professional employer', 'employer of record', 'eor',
    'i-9', 'i9', 'e-verify', 'wotc', 'work opportunity tax',
    'unemployment cost', 'ucm', 'unemployment insurance',
    'workforce compliance', 'employer services', 'payroll tech',
    'background screening', 'background check', 'employment verification',
    'identity verification', 'tax credit',
  ];
  const tier1Hits = tier1.filter(k => text.includes(k));
  if (tier1Hits.length >= 2) { score = 30; matches.push(`🎯 Core domain: ${tier1Hits.slice(0,2).join(', ')}`); }
  else if (tier1Hits.length === 1) { score = 24; matches.push(`🎯 Core domain: ${tier1Hits[0]}`); }

  // ── Tier 2 — Strong adjacent (18pts max) ──────────────────────────────────
  if (score < 24) {
    const tier2 = [
      'saas', 'b2b software', 'compliance software', 'regtech', 'legaltech',
      'payroll', 'benefits administration', 'benefits tech', 'insurtech',
      'staffing tech', 'recruiting tech', 'talent tech', 'ats',
      'workforce management', 'workforce', 'fintech', 'payments tech',
      'data company', 'data platform', 'api platform',
    ];
    const tier2Hits = tier2.filter(k => text.includes(k));
    if (tier2Hits.length >= 2) { score = Math.max(score, 18); matches.push(`Strong adjacent: ${tier2Hits.slice(0,2).join(', ')}`); }
    else if (tier2Hits.length === 1) { score = Math.max(score, 13); matches.push(`Adjacent: ${tier2Hits[0]}`); }
  }

  // ── Tier 3 — General B2B (8pts max) ───────────────────────────────────────
  if (score < 13) {
    const tier3 = ['b2b', 'enterprise software', 'cloud platform', 'platform company'];
    const tier3Hit = tier3.find(k => text.includes(k));
    if (tier3Hit) { score = Math.max(score, 8); matches.push(`B2B signal: ${tier3Hit}`); }
  }

  // ── No industry signal at all — score 5 (unknown, not penalized heavily) ──
  if (score === 0) {
    score = 5;
    matches.push('Industry unknown');
  }

  return { score: Math.min(score, WEIGHTS.industryMatch), matches };
}

function scoreTitle(job) {
  const title = (job.title || '').toLowerCase();
  let score = 0;
  let match = '';

  // ── Tier 1: Exact target titles (25pts) ─────────────────────────────────
  const exact = [
    'director of partnerships', 'vp of partnerships', 'vp, partnerships',
    'vice president of partnerships', 'vice president, partnerships',
    'director of alliances', 'vp of alliances', 'vice president of alliances',
    'head of partnerships', 'head of alliances', 'head of channel',
    'senior director of partnerships', 'senior director, partnerships',
    'svp partnerships', 'svp of partnerships',
    'director, partnerships', 'director, alliances',
    'vp partnerships', 'vp alliances',
  ];
  if (exact.some(t => title.includes(t))) {
    score = 25; match = 'Exact target title';

  // ── Tier 2: Strong function match (22pts) ────────────────────────────────
  } else if ([
    'director of channel', 'vp of channel', 'vp, channel',
    'director of ecosystem', 'vp of ecosystem',
    'director of reseller', 'vp of reseller',
    'director of business development', 'vp of business development', 'vp business development',
    'director, business development', 'vp, business development',
    'director of strategic alliances', 'vp of strategic alliances',
    'director of partner', 'vp of partner',
    'director, partner', 'head of partner',
    'director of indirect', 'vp of indirect',
  ].some(t => title.includes(t))) {
    score = 22; match = 'Strong function match';

  // ── Tier 3: Customer success leadership (20pts) ──────────────────────────
  } else if ([
    'director of customer success', 'vp of customer success',
    'director of client success', 'vp customer success',
    'vp, customer success', 'vice president customer success',
    'director, customer success', 'head of customer success',
    'senior director customer success',
  ].some(t => title.includes(t))) {
    score = 20; match = 'CS leadership match';

  // ── Tier 4: RevOps / Sales ops (18pts) ───────────────────────────────────
  } else if ([
    'director of revenue operations', 'director of sales operations',
    'vp revenue operations', 'vp of revops', 'vp of revenue operations',
    'director, revenue operations', 'head of revenue operations',
    'vp sales operations', 'director of revops',
  ].some(t => title.includes(t))) {
    score = 18; match = 'RevOps/SalesOps match';

  // ── Tier 5: Account mgmt / enablement (15pts) ────────────────────────────
  } else if ([
    'director of account management', 'director of strategic accounts',
    'director of sales enablement', 'director of partner success',
    'vp of account management', 'director of global accounts',
    'director of key accounts', 'head of account management',
    'vp of enablement', 'director of enablement',
  ].some(t => title.includes(t))) {
    score = 15; match = 'Account/Enablement match';

  // ── Tier 6: Keyword present but not exact (10pts) ────────────────────────
  } else if (title.includes('partnership') || title.includes('alliance') ||
             title.includes('channel') || title.includes('reseller') ||
             title.includes('ecosystem') || title.includes('indirect')) {
    score = 10; match = 'Partnerships/Channel signal';

  // ── Tier 7: Seniority only, weak function (5pts) ─────────────────────────
  } else if (title.includes('director') || title.includes(' vp') ||
             title.includes('vice president') || title.includes('head of')) {
    score = 5; match = 'Senior level — weak function match';
  }

  // ── Bonus: APAC/Americas/Global scope titles (+2) ─────────────────────────
  if (score > 0 && (title.includes('global') || title.includes('americas') ||
      title.includes('north america') || title.includes('worldwide'))) {
    score = Math.min(score + 2, WEIGHTS.titleMatch);
    match += ' · Global scope';
  }

  // ── Penalty: regional/territory-limited roles (-3) ────────────────────────
  if (score > 0 && (title.includes('apac') || title.includes('emea') ||
      title.includes('latam') || title.includes('asia pacific') ||
      title.includes('europe') || title.includes('uk ') || title.includes('australia'))) {
    score = Math.max(score - 3, 0);
    match += ' · Non-US region penalty';
  }

  return { score: Math.min(score, WEIGHTS.titleMatch), match };
}

function scoreResumeKeywords(job) {
  // Use full description if available, fall back to snippet
  const text = `${job.title} ${job.fullDescription || job.snippet || ''} ${job.industry || ''}`.toLowerCase();
  const hits = { core: [], domain: [], tools: [], leadership: [] };

  hits.core     = NICK_RESUME.coreSkills.filter(k => text.includes(k));
  hits.domain   = NICK_RESUME.domain.filter(k => text.includes(k));
  hits.tools    = NICK_RESUME.tools.filter(k => text.includes(k));
  hits.leadership = NICK_RESUME.leadership.filter(k => text.includes(k));

  const totalKeywords = NICK_RESUME.coreSkills.length + NICK_RESUME.domain.length +
                        NICK_RESUME.tools.length + NICK_RESUME.leadership.length;
  const totalHits = hits.core.length + hits.domain.length + hits.tools.length + hits.leadership.length;

  // Match rate as percentage of all resume keywords found in job
  const matchRate = Math.round((totalHits / totalKeywords) * 100);

  // Weighted score: core=2pts each, domain=1pt, tools=1pt, leadership=1.5pts
  const raw = (hits.core.length * 2) + (hits.domain.length * 1) +
              (hits.tools.length * 1) + (hits.leadership.length * 1.5);
  const score = Math.min(Math.round((raw / 10) * WEIGHTS.resumeKeywords), WEIGHTS.resumeKeywords);

  // Top matched keywords to display on card
  const topMatches = [
    ...hits.core.slice(0, 4),
    ...hits.leadership.slice(0, 2),
    ...hits.tools.slice(0, 2),
    ...hits.domain.slice(0, 2)
  ].slice(0, 8);

  return {
    score,
    matchRate,
    totalHits,
    totalKeywords,
    topMatches,
    breakdown: hits,
    usedFullDesc: !!job.fullDescription
  };
}

function scoreCompensation(job) {
  const salary = (job.salary || '').toLowerCase();
  const snippet = (job.snippet || '').toLowerCase();
  const combined = salary + ' ' + snippet;

  if (!salary || salary === 'not listed') {
    // Check snippet for salary signals
    const hasEquity = combined.includes('equity') || combined.includes('stock') || combined.includes('rsu');
    const hasOTE    = combined.includes('ote') || combined.includes('on-target');
    if (hasEquity || hasOTE) return { score: 7, note: 'Salary unlisted · equity/OTE signals found' };
    return { score: 6, note: 'Salary not listed' };
  }

  const nums = salary.replace(/[^0-9]/g, ' ').trim().split(/\s+/)
    .map(Number).filter(n => n > 10000 && n < 2000000);

  if (nums.length === 0) return { score: 6, note: 'Salary format unclear' };

  // Use max value — OTE/total comp is what matters
  const max = Math.max(...nums);
  let note = salary;

  // Bonus signals in snippet
  const hasEquity = combined.includes('equity') || combined.includes('stock') || combined.includes('rsu');
  const bonus = hasEquity ? 1 : 0;

  if (max >= 250000) return { score: Math.min(12 + bonus, 12), note: `💰 Executive comp: ${salary}` };
  if (max >= 200000) return { score: Math.min(12 + bonus, 12), note: `💰 Top comp: ${salary}` };
  if (max >= 160000) return { score: Math.min(10 + bonus, 12), note: `Strong comp: ${salary}` };
  if (max >= 130000) return { score: Math.min(8  + bonus, 12), note: `Target range: ${salary}` };
  if (max >= 100000) return { score: Math.min(5  + bonus, 12), note: `Acceptable: ${salary}` };
  return { score: 2, note: `Below target: ${salary}` };
}

function scoreCompanyStage(job) {
  const stage = (job.companyStage || '').toLowerCase();
  const text = `${job.snippet || ''} ${job.company || ''} ${job.title || ''}`.toLowerCase();

  // Known high-fit companies from Nick's background — boost these
  const knownFitCompanies = [
    'experian', 'equifax', 'adp', 'paychex', 'ceridian', 'workday',
    'checkr', 'sterling', 'first advantage', 'hireright', 'accurate',
    'indeed', 'ziprecruiter', 'bamboohr', 'rippling', 'gusto', 'deel',
    'papaya', 'velocity global', 'oyster', 'remote.com', 'multiplier',
    'horizons', 'safeguard global', 'globalization partners',
    'trinet', 'justworks', 'oasis', 'insperity', 'paycor', 'paylocity',
    'ukg', 'kronos', 'ultimate software', 'isolved', 'paycom',
    'workato', 'lattice', 'leapsome', 'culture amp', '15five',
    'crossbeam', 'partnerstack', 'alliances', 'impartner', 'zift',
  ];
  const isKnownFit = knownFitCompanies.some(c => text.includes(c));
  if (isKnownFit) return { score: 8, note: `✅ Known fit company` };

  // Stage signals
  if (['series b', 'series c'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 8, note: `Growth stage: Series B/C` };
  if (['series d', 'pre-ipo', 'late stage'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 7, note: `Late stage: Series D+` };
  if (['public company', 'publicly traded', 'nasdaq', 'nyse', 'fortune 500', 'fortune500'].some(s => text.includes(s)))
    return { score: 6, note: 'Public/Enterprise' };
  if (['series a'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 4, note: 'Series A' };
  if (['seed', 'pre-seed'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 2, note: 'Seed stage — early' };

  return { score: 4, note: 'Stage unknown' };
}

function scoreWorkType(job) {
  const wt = (job.workType || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();
  const isRemote = wt.includes('remote') || loc.includes('remote');
  const isHybrid = wt.includes('hybrid');

  if (isRemote)  return { score: 5, note: 'Fully remote ✅' };
  if (isHybrid)  return { score: 3, note: 'Hybrid' };
  return           { score: 2, note: 'Onsite in radius' };
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
function rankJob(job) {
  const industry    = scoreIndustry(job);
  const title       = scoreTitle(job);
  const keywords    = scoreResumeKeywords(job);
  const comp        = scoreCompensation(job);
  const stage       = scoreCompanyStage(job);
  const workType    = scoreWorkType(job);

  const total = industry.score + title.score + keywords.score +
                comp.score + stage.score + workType.score;

  const tier = total >= 80 ? { label: '🔥 Must Apply',      color: '#00e5a0', min: 80 }
             : total >= 65 ? { label: '⭐ Strong Match',     color: '#6c63ff', min: 65 }
             : total >= 50 ? { label: '👀 Worth Reviewing',  color: '#ffb020', min: 50 }
             :               { label: '📋 Low Match',        color: '#4a4f66', min: 0  };

  return {
    total,
    tier,
    breakdown: {
      industry:   { score: industry.score,  max: WEIGHTS.industryMatch,  note: industry.matches?.[0] || '' },
      title:      { score: title.score,     max: WEIGHTS.titleMatch,     note: title.match || '' },
      keywords:   { score: keywords.score,  max: WEIGHTS.resumeKeywords, note: `${keywords.totalHits} resume keyword${keywords.totalHits !== 1 ? 's' : ''} matched`, topMatches: keywords.topMatches, matchRate: keywords.matchRate, totalHits: keywords.totalHits, totalKeywords: keywords.totalKeywords, usedFullDesc: keywords.usedFullDesc },
      comp:       { score: comp.score,      max: WEIGHTS.compensation,   note: comp.note },
      stage:      { score: stage.score,     max: WEIGHTS.companyStage,   note: stage.note },
      workType:   { score: workType.score,  max: WEIGHTS.workType,       note: workType.note }
    }
  };
}



// ── URL RESOLVER + CLOSED JOB DETECTOR ───────────────────────────────────────
// Resolves redirect URLs to final destination and checks if job is still open

const CLOSED_SIGNALS = [
  // Generic
  'this job is no longer available',
  'this job has expired',
  'job listing is no longer active',
  'position has been filled',
  'no longer accepting applications',
  'this posting has been closed',
  'job posting has expired',
  'this position has been closed',
  'application is closed',
  'posting is no longer available',
  'this role has been filled',
  'job is closed',
  'expired job',
  'this listing has expired',
  'job has been filled',
  'this vacancy has been filled',
  // Indeed specific
  'indeedjobs.com/error',
  'page not found',
  'the job you requested is no longer available',
  // Greenhouse
  'this job is not accepting applications',
  'job has closed',
  'the job you are looking for is no longer open',
  'this job is no longer open',
  // Lever
  'this posting has been closed',
  'no longer accepting job applications',
  // Workday
  'this requisition is no longer available',
  'position is no longer available',
  // SmartRecruiters / Ashby
  'position is no longer open',
  'job is no longer open',
  'this job is no longer open',
  // LinkedIn
  'job is no longer accepting applications',
  'application window has closed',
  // 404/error pages
  '404 not found',
  'page does not exist',
  'page cannot be found',
];

async function resolveUrl(url) {
  try {
    // Check URL itself for obvious closed signals before even fetching
    const urlLower = url.toLowerCase();
    if (urlLower.includes('error=true') || urlLower.includes('?error=') || 
        urlLower.includes('job-not-found') || urlLower.includes('expired')) {
      return { finalUrl: url, isClosed: true, ok: false, description: null };
    }

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5' }
    });

    const finalUrl = res.url || url;

    // Any 4xx/5xx = dead
    if (res.status >= 400) {
      return { finalUrl, isClosed: true, ok: false, description: null };
    }
    
    // Check final URL for closed signals
    const finalUrlLower = finalUrl.toLowerCase();
    if (finalUrlLower.includes('error=true') || finalUrlLower.includes('?error=') ||
        finalUrlLower.includes('job-not-found') || finalUrlLower.includes('not-found') ||
        finalUrlLower.includes('jobs/search') || finalUrlLower.includes('jobs/results') ||
        finalUrlLower.includes('/404') || finalUrlLower.includes('expired')) {
      return { finalUrl, isClosed: true, ok: false, description: null };
    }

    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const textLower = text.toLowerCase();

    // Check for closed signals
    const isClosed = CLOSED_SIGNALS.some(s => textLower.includes(s));
    if (isClosed) return { finalUrl, isClosed: true, ok: false, description: null };

    // Extract description for keyword matching (reuse this fetch — no second request needed)
    const reqIdx = text.search(/requirements|qualifications|what you.ll need|what we.re looking for|you have|you bring|must have/i);
    const description = reqIdx > -1 ? text.substring(reqIdx, reqIdx + 3000) : text.substring(0, 3000);

    return { finalUrl, isClosed: false, ok: true, description };
  } catch(err) {
    // On timeout or network error — mark as closed to be safe
    // Better to miss a job than show a dead link
    console.log(`   ⚠️  Fetch failed for ${url.substring(0,50)} — removing (${err.message})`);
    return { finalUrl: url, isClosed: true, ok: false, description: null };
  }
}

// ── FETCH FULL JOB DESCRIPTION ────────────────────────────────────────────────
// Fetches the actual requirements/qualifications from the job posting page
async function fetchFullDescription(url) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags and collapse whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    // Focus on requirements section if possible
    const reqIdx = text.search(/requirements|qualifications|what you.ll need|what we.re looking for|you have|you bring|must have/i);
    if (reqIdx > -1) return text.substring(reqIdx, reqIdx + 3000);
    return text.substring(0, 3000);
  } catch { return null; }
}


// ── JOB NORMALIZER ────────────────────────────────────────────────────────────
// Cleans and enriches raw job data before scoring
function normalizeJob(job) {
  // Fix company
  if (!job.company || job.company === 'See posting' || job.company === 'undefined') {
    job.company = 'Company Not Listed';
  }

  // Fix location — infer from snippet/title if blank
  const snip = (job.snippet || '').toLowerCase();
  if (!job.location || job.location === 'undefined' || job.location === '') {
    if (snip.includes('remote')) job.location = 'Remote';
    else if (snip.includes('new york')) job.location = 'New York, NY';
    else if (snip.includes('san francisco')) job.location = 'San Francisco, CA';
    else if (snip.includes('austin')) job.location = 'Austin, TX';
    else job.location = 'United States';
  }

  // Fix workType — infer from location + snippet
  if (!job.workType || job.workType === 'See posting' || job.workType === 'undefined') {
    const loc = (job.location || '').toLowerCase();
    if (loc.includes('remote') || snip.includes('fully remote') || snip.includes('100% remote') || snip.includes('work from anywhere')) {
      job.workType = 'Remote';
    } else if (snip.includes('hybrid')) {
      job.workType = 'Hybrid';
    } else if (loc && !loc.includes('remote') && !loc.includes('united states')) {
      job.workType = 'Onsite';
    } else {
      job.workType = 'Remote'; // default assumption for director+ roles
    }
  }

  // Normalize workType casing
  const wt = job.workType.toLowerCase();
  if (wt.includes('remote')) job.workType = 'Remote';
  else if (wt.includes('hybrid')) job.workType = 'Hybrid';
  else job.workType = 'Onsite';

  // Fix source label — check source string AND url
  const srcMap = {
    'indeed': 'Indeed', 'remotive': 'Remotive', 'the muse': 'The Muse',
    'arbeitnow': 'Arbeitnow', 'greenhouse': 'Greenhouse', 'lever': 'Lever',
    'workday': 'Workday', 'linkedin': 'LinkedIn', 'smartrecruiters': 'SmartRecruiters',
    'jobvite': 'Jobvite', 'ashby': 'Ashby'
  };
  const srcLower = (job.source || '').toLowerCase();
  const urlLower = (job.url || '').toLowerCase();
  let srcMatched = false;
  for (const [k, v] of Object.entries(srcMap)) {
    if (srcLower.includes(k) || urlLower.includes(k)) { job.source = v; srcMatched = true; break; }
  }
  if (!srcMatched) job.source = 'Job Board';

  // Infer industry from snippet + title if blank
  if (!job.industry || job.industry === 'undefined' || job.industry === '') {
    const text = `${job.title} ${job.snippet || ''}`.toLowerCase();
    if (text.match(/\bpeo\b|professional employer|hr tech|hrtech|workforce compliance|wotc|i-9|e-verify/))
      job.industry = 'HR Tech / PEO';
    else if (text.match(/payroll|hris|hcm|human capital/))
      job.industry = 'HR Technology';
    else if (text.match(/compliance|regulatory|legal/))
      job.industry = 'Compliance';
    else if (text.match(/fintech|financial|payments|banking/))
      job.industry = 'FinTech';
    else if (text.match(/cybersecurity|security|identity/))
      job.industry = 'Cybersecurity';
    else if (text.match(/saas|software|platform|cloud/))
      job.industry = 'SaaS';
    else if (text.match(/staffing|recruiting|talent/))
      job.industry = 'Staffing / HR';
    else
      job.industry = '';
  }

  return job;
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

  // ── Remotive ──────────────────────────────────────────────────────────────
  console.log('\n📡 Remotive...');
  for (const q of ['partnerships', 'alliances', 'customer success', 'revenue operations',
                   'channel sales', 'business development', 'account management',
                   'sales enablement', 'ecosystem', 'go-to-market']) {
    try {
      const jobs = await fetchRemotive(q);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // ── The Muse ───────────────────────────────────────────────────────────────
  console.log('\n📡 The Muse...');
  for (const q of ['director partnerships', 'VP alliances', 'director customer success', 'revenue operations director']) {
    try {
      const jobs = await fetchTheMuse(q);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // ── Arbeitnow ──────────────────────────────────────────────────────────────
  console.log('\n📡 Arbeitnow...');
  for (const q of ['director partnerships', 'VP customer success', 'director alliances', 'revenue operations']) {
    try {
      const jobs = await fetchArbeitnow(q);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // ── We Work Remotely ───────────────────────────────────────────────────────
  console.log('\n📡 We Work Remotely...');
  try {
    const jobs = await fetchWWR('partnerships');
    if (jobs.length) { console.log(`   ✅ ${jobs.length} results`); allJobs = allJobs.concat(jobs); }
  } catch (e) { console.log(`   ❌ ${e.message}`); }

  // ── Jobicy ─────────────────────────────────────────────────────────────────
  console.log('\n📡 Jobicy...');
  for (const q of ['partnerships', 'alliances', 'customer success', 'revenue operations', 'channel']) {
    try {
      const jobs = await fetchJobicy(q);
      if (jobs.length) { console.log(`   ✅ "${q}" → ${jobs.length}`); allJobs = allJobs.concat(jobs); }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.log(`   ❌ "${q}": ${e.message}`); }
  }

  // ── Claude Web Search (ATS + Niche boards) ─────────────────────────────────
  console.log('\n📡 Claude web search (ATS + niche boards)...');
  // ── FREE DIRECT ATS APIs (no Claude cost) ──────────────────────────────────
  // Greenhouse board API — free, no auth needed
  console.log('\n🏢 Fetching from Greenhouse boards API...');
  const greenhouseCompanies = [
    'checkr','rippling','gusto','deel','lattice','navan','leapsome',
    'papayaglobal','velocityglobal','oysterhr','workato','remote',
    'experian','firstadvantage','sterlingcheck','hirequest',
    'justworks','trinet','bamboohr','namely','paycor','paylocity',
    'adp','ceridian','ukg','dayforce','isolved','paycom'
  ];
  for (const co of greenhouseCompanies) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`, {signal: AbortSignal.timeout(6000)});
      if (!r.ok) continue;
      const d = await r.json();
      const jobs = (d.jobs || []).filter(j => {
        const t = (j.title||'').toLowerCase();
        return /partner|alliance|channel|reseller|business dev|revenue ops|customer success|vp|director|head of/i.test(t);
      }).map(j => ({
        title: j.title, company: co.charAt(0).toUpperCase()+co.slice(1),
        location: (j.location?.name)||'United States',
        workType: /remote/i.test(j.location?.name||'')?'Remote':'Onsite',
        salary: 'Not Listed', posted: j.updated_at ? new Date(j.updated_at).toLocaleDateString() : 'Recent',
        url: j.absolute_url, source: 'Greenhouse', verified: true,
        snippet: j.content ? j.content.replace(/<[^>]+>/g,' ').substring(0,200) : '',
        industry: '', companyStage: ''
      }));
      if (jobs.length) { console.log(`   ✅ ${co}: ${jobs.length} roles`); allJobs = allJobs.concat(jobs); }
    } catch(e) { /* skip */ }
  }

  // Lever postings API — free, no auth needed  
  console.log('\n🏢 Fetching from Lever postings API...');
  const leverCompanies = [
    'rippling','gusto','deel','lattice','navan','leapsome','remote',
    'papayaglobal','velocityglobal','workato','experian','checkr',
    'justworks','bamboohr','namely','paycor','paylocity','paycom',
    'servicenow','salesforce','hubspot','zendesk','freshworks'
  ];
  for (const co of leverCompanies) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${co}?mode=json&state=published`, {signal: AbortSignal.timeout(6000)});
      if (!r.ok) continue;
      const jobs = await r.json();
      const filtered = (Array.isArray(jobs)?jobs:[]).filter(j => {
        const t = (j.text||'').toLowerCase();
        return /partner|alliance|channel|reseller|business dev|revenue ops|customer success|vp|director|head of/i.test(t);
      }).map(j => ({
        title: j.text, company: co.charAt(0).toUpperCase()+co.slice(1),
        location: (j.categories?.location)||'United States',
        workType: /remote/i.test(j.categories?.location||'')?'Remote':'Onsite',
        salary: 'Not Listed',
        posted: j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Recent',
        url: j.hostedUrl, source: 'Lever', verified: true,
        snippet: j.descriptionPlain ? j.descriptionPlain.substring(0,200) : '',
        industry: '', companyStage: ''
      }));
      if (filtered.length) { console.log(`   ✅ ${co}: ${filtered.length} roles`); allJobs = allJobs.concat(filtered); }
    } catch(e) { /* skip */ }
  }

  // Dedup
  const urlSet = new Set();
  const deduped = allJobs.filter(j => {
    if (!j.url || urlSet.has(j.url)) return false;
    urlSet.add(j.url); return true;
  });
  console.log(`\n📊 Total unique: ${deduped.length}`);

  // Universal age filter — reject jobs older than 30 days
  const MAX_JOB_AGE_DAYS = 30;
  const now = Date.now();

  function parsePostedAge(posted) {
    if (!posted || posted === 'Recent') return 0; // assume fresh if no date
    const s = posted.toLowerCase();
    // "X days ago" / "X hours ago" / "X weeks ago"
    const daysAgo = s.match(/(\d+)\s*day/);
    if (daysAgo) return parseInt(daysAgo[1]);
    const hoursAgo = s.match(/(\d+)\s*hour/);
    if (hoursAgo) return 0;
    const weeksAgo = s.match(/(\d+)\s*week/);
    if (weeksAgo) return parseInt(weeksAgo[1]) * 7;
    const monthsAgo = s.match(/(\d+)\s*month/);
    if (monthsAgo) return parseInt(monthsAgo[1]) * 30;
    // Try parsing as actual date string e.g. "3/1/2026" or "2026-01-15"
    try {
      const d = new Date(posted);
      if (!isNaN(d.getTime())) {
        return Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
      }
    } catch(e) {}
    return 0; // unknown format — keep it
  }

  const fresh = deduped.filter(job => {
    const ageDays = parsePostedAge(job.posted);
    if (ageDays > MAX_JOB_AGE_DAYS) {
      console.log(`   ⏰ Skipping stale job (${ageDays}d old): ${job.title} @ ${job.company}`);
      return false;
    }
    return true;
  });
  console.log(`📅 After age filter (max ${MAX_JOB_AGE_DAYS}d): ${fresh.length} (removed ${deduped.length - fresh.length} stale)`);

  // Filter
  // Remove manually blocked jobs
  const unblocked = fresh.filter(job => {
    if (isBlocked(job)) {
      console.log(`   🚫 Blocked: "${job.title}" @ ${job.company}`);
      return false;
    }
    return true;
  });

  const qualified = unblocked.filter(meetsRequirements);
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

  // Resolve URLs + check closed + fetch descriptions
  console.log('\n🔗 Resolving URLs and checking job status...');
  const validJobs = [];
  for (let i = 0; i < newJobs.length; i++) {
    const job = newJobs[i];
    
    // Even pre-verified jobs: reject if URL already contains error signals
    const urlCheck = (job.url || '').toLowerCase();
    if (urlCheck.includes('error=true') || urlCheck.includes('?error=') ||
        urlCheck.includes('/oops') || urlCheck.includes('not_found=true') ||
        urlCheck.includes('not-found') || urlCheck.includes('expired_jd_redirect') ||
        urlCheck.includes('job-not-found') || urlCheck.includes('jobs/search') ||
        urlCheck.includes('trk=expired') || urlCheck.includes('linkedin.com/company/')) {
      console.log(`   ❌ [${i+1}/${newJobs.length}] BAD URL — removing: ${job.title.substring(0,40)}`);
      seenUrls.add(job.url);
      continue;
    }

    // Greenhouse and Lever API jobs are pre-verified — always live, skip HTTP check
    if (job.verified) {
      seenUrls.add(job.url);
      console.log(`   ✅ [${i+1}/${newJobs.length}] Pre-verified (${job.source}): ${job.title.substring(0,40)}`);
      validJobs.push(job);
      continue;
    }

    // All other sources: resolve URL + check for closed signals
    const resolveResult = await resolveUrl(job.url);
    const { finalUrl, isClosed } = resolveResult;
    
    if (isClosed) {
      console.log(`   ❌ [${i+1}/${newJobs.length}] CLOSED — removing: ${job.title.substring(0,40)}`);
      seenUrls.add(job.url);
      seenUrls.add(finalUrl);
      continue;
    }
    
    seenUrls.add(job.url);
    job.url = finalUrl;
    console.log(`   🔗 [${i+1}/${newJobs.length}] Verified active: ${finalUrl.substring(0,60)}`);
    
    if (resolveResult.description) {
      job.fullDescription = resolveResult.description;
    }
    
    validJobs.push(job);
    if (i < newJobs.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  
  const activeJobs = validJobs;
  console.log(`\n✅ ${activeJobs.length} active jobs (${newJobs.length - activeJobs.length} closed/removed)`);
  // Replace newJobs reference for ranking
  newJobs.length = 0;
  activeJobs.forEach(j => newJobs.push(j));

  // Rank all new jobs
  const rankedJobs = newJobs
    .map(j => normalizeJob(j))
    .map(j => ({ ...j, rank: rankJob(j) }))
    .sort((a, b) => b.rank.total - a.rank.total);

  console.log(`\n🏆 Top 3 ranked jobs:`);
  rankedJobs.slice(0, 3).forEach((j, i) => {
    console.log(`   ${i+1}. [${j.rank.total}/100] ${j.title} @ ${j.company}`);
  });

  // Current run top picks — must apply (80+) first, then strong match (65+), up to 5
  const currentTopPicks = rankedJobs
    .filter(j => (j.rank?.total || 0) >= 65)
    .slice(0, 5);

  // Save top picks for NEXT email's "revisit" section
  if (rankedJobs.length > 0) saveTopPicks(currentTopPicks.length > 0 ? currentTopPicks : rankedJobs.slice(0, 5));

  // Update seen URLs — only add the new qualified ones
  const newUrlSet = new Set(newJobs.map(j => j.url));
  saveSeenUrls(seenUrls, newUrlSet);

  // Save today — currentTopPicks shown in stats, previousTopPicks shown in revisit card
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: dateStr, count: rankedJobs.length,
    jobs: rankedJobs,
    topPicks: previousTopPicks,          // "revisit" card = last run's bests
    currentTopPicks: currentTopPicks     // stats bar top picks count = this run
  }, null, 2));
  if (!fs.existsSync(DOCS_RESULTS_DIR)) fs.mkdirSync(DOCS_RESULTS_DIR, { recursive: true });
  fs.writeFileSync(DOCS_TODAY_PATH, JSON.stringify({
    date: dateStr, count: rankedJobs.length,
    jobs: rankedJobs,
    topPicks: previousTopPicks,          // "revisit" card = last run's bests
    currentTopPicks: currentTopPicks     // stats bar top picks count = this run
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
