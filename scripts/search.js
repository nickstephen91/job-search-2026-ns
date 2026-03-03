// Nick Stephen Job Search Agent - RSS/API SOURCE VERSION
// Uses real accessible job feeds instead of scraping blocked sites
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');

function loadSeenUrls() {
  try {
    if (!fs.existsSync(SEEN_URLS_PATH)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8')).urls || []);
  } catch { return new Set(); }
}

function saveSeenUrls(seenUrls) {
  fs.writeFileSync(SEEN_URLS_PATH, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalSeen: seenUrls.size,
    urls: Array.from(seenUrls)
  }, null, 2));
}

// Nick's resume keywords for 50% match filter
const NICK_SKILLS = [
  'partner', 'alliance', 'channel', 'reseller', 'ecosystem', 'crm', 'pipeline',
  'go-to-market', 'gtm', 'enablement', 'revenue', 'saas', 'b2b', 'peo',
  'hr tech', 'hrtech', 'hcm', 'payroll', 'compliance', 'workforce', 'integration',
  'kpi', 'reporting', 'cross-functional', 'leadership', 'strategy', 'operations',
  'account', 'client', 'customer', 'relationship', 'negotiation', 'contract',
  'pricing', 'quota', 'arr', 'qbr', 'sop', 'business development'
];

const NICK_TITLES = [
  'director', 'vp', 'vice president', 'head of', 'senior director', 'svp',
  'partnership', 'alliance', 'channel', 'customer success', 'client success',
  'revenue operations', 'revops', 'sales operations', 'business development',
  'account management', 'enablement', 'ecosystem'
];

const NICK_INDUSTRIES = [
  'saas', 'software', 'tech', 'hr', 'payroll', 'compliance', 'peo',
  'workforce', 'hcm', 'benefits', 'staffing', 'fintech', 'b2b', 'cloud'
];

function meetsRequirements(job) {
  const text = `${job.title} ${job.snippet || ''} ${job.company || ''}`.toLowerCase();
  const titleMatch = NICK_TITLES.some(t => text.includes(t));
  const skillMatches = NICK_SKILLS.filter(s => text.includes(s)).length;
  const industryMatch = NICK_INDUSTRIES.some(i => text.includes(i));
  return (titleMatch && skillMatches >= 1) || (titleMatch && industryMatch) || skillMatches >= 4;
}

// ── SOURCE 1: Indeed RSS Feeds ─────────────────────────────────────────────
// Indeed has public RSS feeds that are freely accessible
async function fetchIndeedRSS(query, location) {
  const q = encodeURIComponent(query);
  const l = encodeURIComponent(location);
  const url = `https://www.indeed.com/rss?q=${q}&l=${l}&sort=date&fromage=7`;

  console.log(`   📡 Indeed RSS: ${query} in ${location}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' }
  });

  if (!res.ok) throw new Error(`Indeed RSS returned ${res.status}`);

  const xml = await res.text();

  // Parse RSS XML manually
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const item = match[1];
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (item.match(/<source.*?>(.*?)<\/source>/) || [])[1] || 'Indeed';

    // Extract company from description
    const companyMatch = description.match(/([A-Z][a-zA-Z\s]+(?:Inc|LLC|Corp|Co|Ltd|Group|Solutions|Services|Technologies|Software|Platform)?)/);

    if (title && link) {
      items.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        company: companyMatch?.[1]?.trim() || 'See posting',
        location: location,
        workType: description.toLowerCase().includes('remote') ? 'Remote' : 'See posting',
        salary: 'Not Listed',
        posted: pubDate ? new Date(pubDate).toLocaleDateString() : 'Recent',
        url: link,
        source: 'Indeed',
        snippet: description.replace(/<[^>]+>/g, '').substring(0, 300),
        industry: '',
        companyStage: ''
      });
    }
  }

  return items;
}

// ── SOURCE 2: Remotive API ─────────────────────────────────────────────────
// Remotive has a free public API for remote jobs
async function fetchRemotive(query) {
  console.log(`   📡 Remotive API: ${query}`);
  const q = encodeURIComponent(query);
  const url = `https://remotive.com/api/remote-jobs?search=${q}&limit=20`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Remotive returned ${res.status}`);

  const data = await res.json();
  const jobs = data.jobs || [];

  return jobs.map(j => ({
    title: j.title || '',
    company: j.company_name || '',
    location: 'Remote',
    workType: 'Remote',
    salary: j.salary || 'Not Listed',
    posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
    url: j.url || '',
    source: 'Remotive',
    snippet: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 300),
    industry: j.category || '',
    companyStage: ''
  }));
}

// ── SOURCE 3: The Muse API ─────────────────────────────────────────────────
// The Muse has a free public jobs API
async function fetchTheMuse(query) {
  console.log(`   📡 The Muse API: ${query}`);
  const q = encodeURIComponent(query);
  const url = `https://www.themuse.com/api/public/jobs?descending=true&page=1&query=${q}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`The Muse returned ${res.status}`);

  const data = await res.json();
  const results = data.results || [];

  return results.map(j => ({
    title: j.name || '',
    company: j.company?.name || '',
    location: j.locations?.[0]?.name || 'Remote',
    workType: j.locations?.[0]?.name?.toLowerCase().includes('remote') ? 'Remote' : 'Hybrid',
    salary: 'Not Listed',
    posted: j.publication_date ? new Date(j.publication_date).toLocaleDateString() : 'Recent',
    url: j.refs?.landing_page || '',
    source: 'The Muse',
    snippet: (j.contents || '').replace(/<[^>]+>/g, '').substring(0, 300),
    industry: j.categories?.[0]?.name || '',
    companyStage: ''
  }));
}

// ── SOURCE 4: Arbeitnow API ────────────────────────────────────────────────
// Free job board API with remote jobs
async function fetchArbeitnow(query) {
  console.log(`   📡 Arbeitnow API: ${query}`);
  const q = encodeURIComponent(query);
  const url = `https://www.arbeitnow.com/api/job-board-api?search=${q}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Arbeitnow returned ${res.status}`);

  const data = await res.json();
  const jobs = data.data || [];

  return jobs.filter(j => j.remote).map(j => ({
    title: j.title || '',
    company: j.company_name || '',
    location: 'Remote',
    workType: 'Remote',
    salary: j.salary || 'Not Listed',
    posted: j.created_at ? new Date(j.created_at * 1000).toLocaleDateString() : 'Recent',
    url: j.url || '',
    source: 'Arbeitnow',
    snippet: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 300),
    industry: j.tags?.[0] || '',
    companyStage: ''
  }));
}

// ── SOURCE 5: Claude web search as fallback ────────────────────────────────
// Use Claude to search specific company career pages directly
async function fetchViaClaudeSearch(query) {
  console.log(`   📡 Claude search: ${query}`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for "${query}" on job boards. Return ONLY a JSON array of job listings found, with no other text:
[{"title":"","company":"","location":"","workType":"Remote or Hybrid or Onsite","salary":"","posted":"","url":"","source":"","snippet":"","industry":"","companyStage":""}]`
      }]
    })
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1) return [];

  try {
    const jobs = JSON.parse(text.substring(start, end + 1));
    return jobs.filter(j => j.title && j.url);
  } catch { return []; }
}

async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH - RSS/API MODE');
  console.log(`DATE: ${dateStr}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  console.log(`Previously seen: ${seenUrls.size} jobs\n`);

  let allJobs = [];

  // Indeed RSS - multiple searches
  const indeedQueries = [
    { q: 'Director of Partnerships', l: 'remote' },
    { q: 'VP of Partnerships', l: 'remote' },
    { q: 'Director of Alliances', l: 'remote' },
    { q: 'VP of Alliances', l: 'remote' },
    { q: 'Director of Customer Success', l: 'remote' },
    { q: 'VP of Customer Success', l: 'remote' },
    { q: 'Director of Revenue Operations', l: 'remote' },
    { q: 'Director of Sales Operations', l: 'remote' },
    { q: 'Director of Channel Sales', l: 'remote' },
    { q: 'Director of Business Development', l: 'remote' },
    { q: 'Director of Account Management', l: 'remote' },
    { q: 'Director of Strategic Accounts', l: 'remote' },
    { q: 'Director of Sales Enablement', l: 'remote' },
    { q: 'Head of Partnerships', l: 'remote' },
    { q: 'Director of Ecosystem', l: 'remote' },
    { q: 'Director of Partner Success', l: 'remote' },
    { q: 'VP of Business Development', l: 'remote' },
    { q: 'Senior Director of Partnerships', l: 'remote' },
    { q: 'Director Partnerships', l: 'West Palm Beach, FL' },
    { q: 'Director Customer Success', l: 'West Palm Beach, FL' },
    { q: 'Director Business Development', l: 'West Palm Beach, FL' },
  ];

  console.log('📋 Indeed RSS Feeds:');
  for (const { q, l } of indeedQueries) {
    try {
      const jobs = await fetchIndeedRSS(q, l);
      console.log(`   ✅ "${q}" → ${jobs.length} results`);
      allJobs = allJobs.concat(jobs);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.log(`   ❌ "${q}": ${err.message}`);
    }
  }

  // Remotive - remote jobs API
  console.log('\n📋 Remotive API:');
  const remotiveQueries = ['partnerships', 'alliances', 'customer success', 'revenue operations', 'channel sales', 'business development', 'account management', 'sales enablement', 'ecosystem'];
  for (const q of remotiveQueries) {
    try {
      const jobs = await fetchRemotive(q);
      console.log(`   ✅ "${q}" → ${jobs.length} results`);
      allJobs = allJobs.concat(jobs);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`   ❌ "${q}": ${err.message}`);
    }
  }

  // The Muse API
  console.log('\n📋 The Muse API:');
  try {
    const jobs = await fetchTheMuse('director partnerships alliances');
    console.log(`   ✅ ${jobs.length} results`);
    allJobs = allJobs.concat(jobs);
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
  }

  // Arbeitnow API
  console.log('\n📋 Arbeitnow API:');
  try {
    const jobs = await fetchArbeitnow('director partnerships');
    console.log(`   ✅ ${jobs.length} results`);
    allJobs = allJobs.concat(jobs);
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
  }

  // Claude web search for HR Tech companies directly
  console.log('\n📋 Claude Web Search (HR Tech companies):');
  const claudeQueries = [
    'Director VP Partnerships Alliances remote jobs 2026 site:greenhouse.io',
    'Director VP Partnerships Alliances remote jobs 2026 site:lever.co',
    'Director Customer Success remote SaaS jobs 2026 site:greenhouse.io',
    'Director Revenue Operations RevOps remote jobs 2026 site:lever.co OR site:greenhouse.io'
  ];
  for (const q of claudeQueries) {
    try {
      const jobs = await fetchViaClaudeSearch(q);
      console.log(`   ✅ ${jobs.length} results`);
      allJobs = allJobs.concat(jobs);
      await new Promise(r => setTimeout(r, 10000));
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  console.log(`\n📥 Total raw: ${allJobs.length}`);

  // Deduplicate by URL
  const seen = new Set();
  const deduped = allJobs.filter(j => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
  console.log(`📊 After dedup: ${deduped.length}`);

  // 50% requirements match filter
  const qualified = deduped.filter(meetsRequirements);
  console.log(`✅ After 50% match filter: ${qualified.length}`);

  // New only
  const newJobs = qualified
    .filter(j => !seenUrls.has(j.url))
    .map(j => ({ ...j, foundDate: new Date().toISOString() }));

  console.log(`🆕 New jobs: ${newJobs.length}`);

  // Update seen URLs
  deduped.forEach(j => seenUrls.add(j.url));
  saveSeenUrls(seenUrls);

  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: dateStr,
    count: newJobs.length,
    jobs: newJobs
  }, null, 2));

  console.log(`\n✅ Done! ${newJobs.length} new jobs to send.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: new Date().toLocaleDateString(), count: 0, jobs: [], error: err.message
  }, null, 2));
  process.exit(1);
});
