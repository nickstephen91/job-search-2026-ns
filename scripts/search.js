// Nick Stephen Job Search Agent - search.js CLEAN v11
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');

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

  // Tier 1 — Perfect industry match (Nick's core domains)
  const tier1 = ['hr tech', 'hrtech', 'hcm', 'peo', 'professional employer',
    'i-9', 'i9', 'e-verify', 'wotc', 'unemployment cost', 'ucm',
    'workforce compliance', 'employer services', 'payroll tech'];
  const tier1Hits = tier1.filter(k => text.includes(k));
  if (tier1Hits.length >= 2) { score = 30; matches.push(`Core domain: ${tier1Hits.slice(0,2).join(', ')}`); }
  else if (tier1Hits.length === 1) { score = 22; matches.push(`Core domain: ${tier1Hits[0]}`); }

  // Tier 2 — Strong adjacent match
  if (score < 22) {
    const tier2 = ['saas', 'b2b software', 'compliance', 'payroll', 'benefits',
      'background screening', 'identity verification', 'fintech', 'insurtech',
      'staffing tech', 'recruiting tech', 'workforce'];
    const tier2Hits = tier2.filter(k => text.includes(k));
    if (tier2Hits.length >= 2) { score = Math.max(score, 18); matches.push(`Adjacent: ${tier2Hits.slice(0,2).join(', ')}`); }
    else if (tier2Hits.length === 1) { score = Math.max(score, 12); matches.push(`Adjacent: ${tier2Hits[0]}`); }
  }

  // Tier 3 — General B2B/SaaS
  if (score < 12) {
    if (text.includes('b2b') || text.includes('enterprise software') || text.includes('cloud')) {
      score = Math.max(score, 7);
      matches.push('B2B/SaaS signal');
    }
  }

  return { score: Math.min(score, WEIGHTS.industryMatch), matches };
}

function scoreTitle(job) {
  const title = (job.title || '').toLowerCase();
  let score = 0;
  let match = '';

  // Perfect title matches
  if (['director of partnerships', 'vp of partnerships', 'vp, partnerships',
       'director of alliances', 'vp of alliances', 'head of partnerships',
       'senior director of partnerships', 'svp partnerships'].some(t => title.includes(t))) {
    score = 25; match = 'Exact target title';
  } else if (['director of channel', 'vp of channel', 'director of ecosystem',
              'director of reseller', 'vp of business development',
              'director of business development'].some(t => title.includes(t))) {
    score = 22; match = 'Strong title match';
  } else if (['director of customer success', 'vp of customer success',
              'director of client success', 'vp customer success'].some(t => title.includes(t))) {
    score = 20; match = 'CS leadership match';
  } else if (['director of revenue operations', 'director of sales operations',
              'vp revenue operations', 'vp of revops'].some(t => title.includes(t))) {
    score = 18; match = 'RevOps/SalesOps match';
  } else if (['director of account management', 'director of strategic accounts',
              'director of sales enablement', 'director of partner success',
              'vp of account management'].some(t => title.includes(t))) {
    score = 15; match = 'Account/Enablement match';
  } else if (title.includes('partnership') || title.includes('alliance') || title.includes('channel')) {
    score = 12; match = 'Partnerships/Alliances signal';
  } else if (title.includes('director') || title.includes('vp') || title.includes('vice president')) {
    score = 8; match = 'Senior level signal';
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
  const salary = job.salary || '';
  if (!salary || salary === 'Not Listed') {
    // Neutral — don't penalize unlisted salary (Nick's preference)
    return { score: 6, note: 'Salary not listed' };
  }

  const nums = salary.replace(/[^0-9]/g, ' ').trim().split(/\s+/)
    .map(Number).filter(n => n > 10000 && n < 2000000);

  if (nums.length === 0) return { score: 6, note: 'Salary unclear' };

  const max = Math.max(...nums);
  if (max >= 200000)      return { score: 12, note: `Top comp: ${salary}` };
  if (max >= 160000)      return { score: 10, note: `Strong comp: ${salary}` };
  if (max >= 130000)      return { score: 8,  note: `Target comp: ${salary}` };
  if (max >= 100000)      return { score: 5,  note: `Acceptable comp: ${salary}` };
  return { score: 2, note: `Below target: ${salary}` };
}

function scoreCompanyStage(job) {
  const stage = (job.companyStage || '').toLowerCase();
  const text = `${job.snippet || ''} ${job.company || ''}`.toLowerCase();

  // Nick prefers Series B/C and growth-stage; also likes Public/Enterprise
  if (['series b', 'series c'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 8, note: `Ideal stage: ${job.companyStage || 'Series B/C'}` };
  if (['series d', 'pre-ipo', 'late stage', 'growth'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 7, note: `Late stage: ${job.companyStage || 'Series D+'}` };
  if (['public', 'enterprise', 'nasdaq', 'nyse'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 6, note: 'Public/Enterprise' };
  if (['series a'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 4, note: 'Series A — earlier stage' };
  if (['seed', 'startup'].some(s => stage.includes(s) || text.includes(s)))
    return { score: 2, note: 'Early stage seed/startup' };

  return { score: 4, note: 'Stage unknown' }; // neutral for unknown
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
      keywords:   { score: keywords.score,  max: WEIGHTS.resumeKeywords, note: `${keywords.totalHits} resume keyword${keywords.totalHits !== 1 ? 's' : ''} matched`, topMatches: keywords.topMatches },
      comp:       { score: comp.score,      max: WEIGHTS.compensation,   note: comp.note },
      stage:      { score: stage.score,     max: WEIGHTS.companyStage,   note: stage.note },
      workType:   { score: workType.score,  max: WEIGHTS.workType,       note: workType.note }
    }
  };
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

  // Fetch full descriptions for keyword matching (batch, with delays)
  console.log('\n📄 Fetching full job descriptions for keyword analysis...');
  for (let i = 0; i < newJobs.length; i++) {
    const job = newJobs[i];
    const desc = await fetchFullDescription(job.url);
    if (desc) {
      job.fullDescription = desc;
      console.log(`   ✅ [${i+1}/${newJobs.length}] Got description: ${job.title.substring(0,40)}`);
    } else {
      console.log(`   ⚠️  [${i+1}/${newJobs.length}] No description: ${job.title.substring(0,40)}`);
    }
    if (i < newJobs.length - 1) await new Promise(r => setTimeout(r, 400));
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
