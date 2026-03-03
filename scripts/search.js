// Nick Stephen Job Search Agent - SIMPLE VERSION
// No scoring, no filtering. Just find jobs and send them all.
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

async function searchJobs(query) {
  console.log(`\n🔎 Searching: ${query}`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 5000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for job postings: "${query}". 

Find real active listings on LinkedIn Jobs or Indeed. For each job found return a JSON array. Return ONLY the JSON array, nothing else.

[
  {
    "title": "job title here",
    "company": "company name",
    "location": "city state or Remote",
    "workType": "Remote or Hybrid or Onsite",
    "salary": "salary if listed or Not Listed",
    "posted": "when posted",
    "url": "link to job posting",
    "source": "LinkedIn or Indeed",
    "industry": "industry type",
    "companyStage": "company stage"
  }
]

Find as many real listings as you can (up to 10). Only return the JSON array.`
      }]
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  console.log(`   Response: ${text.length} chars, stop_reason: ${data.stop_reason}`);

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1) {
    console.log(`   ⚠️ No JSON found. Sample: ${text.substring(0, 200)}`);
    return [];
  }

  try {
    const jobs = JSON.parse(text.substring(start, end + 1));
    console.log(`   ✅ Found ${jobs.length} jobs`);
    return jobs.filter(j => j.title && j.company && j.url);
  } catch (e) {
    console.log(`   ❌ Parse error: ${e.message}`);
    return [];
  }
}


// Nick's resume qualifications for 50% match check
const NICK_RESUME = {
  titles: ['vp', 'vice president', 'director', 'alliance', 'partner', 'channel', 'reseller',
           'customer success', 'client success', 'revenue operations', 'revops', 'sales operations',
           'business development', 'account management', 'enablement', 'go-to-market', 'gtm',
           'ecosystem', 'strategic'],
  skills: ['partner', 'alliance', 'channel', 'reseller', 'ecosystem', 'crm', 'pipeline',
           'go-to-market', 'gtm', 'co-marketing', 'enablement', 'revenue', 'saas', 'b2b',
           'peo', 'hr tech', 'hrtech', 'hcm', 'payroll', 'compliance', 'workforce',
           'onboarding', 'integration', 'api', 'kpi', 'dashboard', 'reporting',
           'cross-functional', 'stakeholder', 'leadership', 'strategy', 'operations',
           'account', 'client', 'customer', 'relationship', 'negotiation', 'contract',
           'pricing', 'quota', 'arr', 'pipeline', 'qbr', 'sop', 'process'],
  industries: ['saas', 'software', 'tech', 'hr', 'payroll', 'compliance', 'peo', 'workforce',
               'hcm', 'benefits', 'staffing', 'recruiting', 'fintech', 'insurtech', 'b2b',
               'data', 'analytics', 'cloud', 'platform']
};

function meetsHalfRequirements(job) {
  const text = `${job.title} ${job.description || ''} ${job.industry || ''}`.toLowerCase();
  
  // Count how many of Nick's skills/keywords appear in the job text
  const skillMatches = NICK_RESUME.skills.filter(s => text.includes(s)).length;
  const industryMatch = NICK_RESUME.industries.some(i => text.includes(i));
  const titleMatch = NICK_RESUME.titles.some(t => (job.title || '').toLowerCase().includes(t));

  // Title match alone is a strong signal - if title matches he likely meets 50%+
  if (titleMatch && skillMatches >= 2) return true;
  if (titleMatch && industryMatch) return true;
  if (skillMatches >= 5) return true;
  if (skillMatches >= 3 && industryMatch) return true;

  console.log(`   ⬇️  Filtered out (low match): ${job.title} @ ${job.company} — ${skillMatches} skill matches`);
  return false;
}

async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH - SIMPLE MODE');
  console.log(`DATE: ${dateStr}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  console.log(`Previously seen: ${seenUrls.size} jobs`);

  const queries = [
    'Director of Partnerships remote 2026',
    'VP of Partnerships remote 2026',
    'Director of Customer Success remote SaaS 2026',
    'Director of Alliances remote 2026',
    'Director Revenue Operations remote 2026'
  ];

  let allJobs = [];

  for (let i = 0; i < queries.length; i++) {
    try {
      const jobs = await searchJobs(queries[i]);
      allJobs = allJobs.concat(jobs);
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }
    // Wait 20 seconds between each search
    if (i < queries.length - 1) {
      console.log('   ⏳ Waiting 20s...');
      await new Promise(r => setTimeout(r, 20000));
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduped = allJobs.filter(j => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  // Apply 50% requirements match filter
  const qualified = deduped.filter(meetsHalfRequirements);
  console.log(`📊 Total unique jobs found: ${deduped.length}`);
  console.log(`✅ After 50% match filter: ${qualified.length}`);



  // Only keep NEW ones
  const newJobs = qualified
    .filter(j => !seenUrls.has(j.url))
    .map(j => ({ ...j, foundDate: new Date().toISOString() }));

  console.log(`🆕 New jobs: ${newJobs.length}`);

  // Update seen URLs
  deduped.forEach(j => seenUrls.add(j.url));
  saveSeenUrls(seenUrls);

  // Save today.json
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
// Note: filter function added below main - see filterByResume
