// Nick Stephen Job Search Agent - search.js v3
// Strategy: Cast WIDE net first, get raw results, then score locally via score-engine
const fs = require('fs');
const path = require('path');
const { scoreJob } = require('./score-engine');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const JOBS_PATH = path.join(RESULTS_DIR, 'jobs.json');

// Simple system prompt — just find jobs, no scoring pressure on Claude
const SYSTEM_PROMPT = `You are a job search assistant. Search the web for real, active job postings and return them as a JSON array.

CRITICAL: Return ONLY a valid JSON array. No markdown. No explanation. No text before or after the array.

Each job object must have these exact fields:
{
  "title": "job title",
  "company": "company name",
  "location": "city state or Remote",
  "workType": "Remote or Hybrid or Onsite",
  "salary": "salary range or Not Listed",
  "posted": "date posted or days ago",
  "url": "direct link to job posting",
  "source": "LinkedIn or Indeed or etc",
  "description": "job description and requirements text",
  "companyStage": "Startup or Series A or Series B or Series C or Enterprise or Public",
  "industry": "HR Tech or SaaS or Compliance or PEO or Payroll or other",
  "recruiterListing": false
}

If you cannot find real jobs, return an empty array: []
Never return null. Never return text. Only return a JSON array.`;

// 6 focused searches — simple and broad
const SEARCHES = [
  {
    name: 'Director VP Partnerships Alliances Remote',
    prompt: `Search LinkedIn Jobs and Indeed right now for active job postings with these titles: "Director of Partnerships", "VP of Partnerships", "Director of Alliances", "VP of Alliances", "Director of Channel Sales", "Head of Partnerships". Filter for: remote jobs OR jobs in Florida. Posted in the last 30 days. Return up to 10 results as a JSON array.`
  },
  {
    name: 'Director VP Customer Success Remote SaaS',
    prompt: `Search LinkedIn Jobs and Indeed right now for active job postings: "Director of Customer Success", "VP of Customer Success", "Director of Client Success" at SaaS, HR Tech, or software companies. Remote preferred or Florida. Posted in last 30 days. Return up to 10 results as a JSON array.`
  },
  {
    name: 'Director Revenue Operations Sales Operations Remote',
    prompt: `Search LinkedIn Jobs, Indeed, and Glassdoor right now for active job postings: "Director of Revenue Operations", "VP Revenue Operations", "Director of Sales Operations", "Director RevOps". Remote positions. Posted in last 30 days. Return up to 10 results as a JSON array.`
  },
  {
    name: 'HR Tech PEO Partnerships Leadership Jobs',
    prompt: `Search LinkedIn Jobs and Indeed right now for Director and VP level partnership, alliance, business development, or customer success roles at HR technology companies, payroll companies, or PEO companies like: TriNet, Insperity, Rippling, Gusto, Justworks, Paychex, ADP, Deel, BambooHR, Paylocity, UKG, Ceridian, HiBob. Remote or Florida. Return up to 10 results as a JSON array.`
  },
  {
    name: 'Director Business Development Alliances SaaS Remote',
    prompt: `Search LinkedIn Jobs, Indeed, and ZipRecruiter right now for active postings: "Director of Business Development", "VP of Business Development", "Director of Strategic Partnerships", "Senior Director Partnerships" at B2B SaaS companies. Remote. $130k or higher. Posted last 30 days. Return up to 10 results as a JSON array.`
  },
  {
    name: 'South Florida Director VP Jobs',
    prompt: `Search LinkedIn Jobs and Indeed right now for Director or VP level jobs located in: West Palm Beach FL, Palm Beach Gardens FL, Jupiter FL, Port St Lucie FL, Fort Pierce FL, Boca Raton FL, Stuart FL. Any of these functions: partnerships, alliances, business development, customer success, revenue operations, account management, channel sales. Return up to 10 results as a JSON array.`
  }
];

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

function parseJobs(text) {
  try {
    // Try to extract JSON array from response
    const cleaned = text.replace(/```json|```/gi, '').trim();

    // Find the array
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];

    const jsonStr = cleaned.substring(start, end + 1);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    // Filter out any entries missing required fields
    return parsed.filter(j => j && j.title && j.company && j.url);
  } catch (err) {
    console.log(`   ⚠️  JSON parse failed: ${err.message}`);
    return [];
  }
}

async function runSearch(search) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: search.prompt }]
    })
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`API: ${data.error.message}`);
  }

  // Collect all text blocks
  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  if (textBlocks.length === 0) {
    console.log(`   ⚠️  No text in response. Stop reason: ${data.stop_reason}`);
    console.log(`   Content types: ${(data.content || []).map(b => b.type).join(', ')}`);
    return [];
  }

  const fullText = textBlocks.map(b => b.text).join('');
  console.log(`   📝 Response length: ${fullText.length} chars`);

  const jobs = parseJobs(fullText);
  console.log(`   📋 Parsed ${jobs.length} jobs`);
  return jobs;
}

async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  console.log('='.repeat(60));
  console.log('NICK STEPHEN JOB SEARCH AGENT v3');
  console.log(`DATE: ${dateStr}`);
  console.log('MODE: Wide net → local ATS scoring');
  console.log('='.repeat(60));

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const seenUrls = loadSeenUrls();
  console.log(`\n📚 Previously seen: ${seenUrls.size} jobs\n`);

  // Run all searches
  let allRaw = [];
  for (const search of SEARCHES) {
    console.log(`\n🔎 ${search.name}`);
    try {
      const jobs = await runSearch(search);
      allRaw = allRaw.concat(jobs);
      // Delay between searches
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n📥 Total raw results: ${allRaw.length}`);

  // Deduplicate by URL
  const urlSet = new Set();
  const deduped = allRaw.filter(job => {
    if (!job.url || urlSet.has(job.url)) return false;
    urlSet.add(job.url);
    return true;
  });
  console.log(`📊 After dedup: ${deduped.length} unique jobs`);

  // Run ATS scoring on everything
  console.log('\n🏆 Running ATS scoring...');
  let hardRejects = 0;
  let belowThreshold = 0;
  const scoredJobs = [];

  for (const job of deduped) {
    try {
      const result = scoreJob(job);
      if (!result.passed) {
        if (result.hardFilterReason) {
          hardRejects++;
        } else {
          belowThreshold++;
        }
        continue;
      }
      scoredJobs.push({
        ...job,
        atsScore: result.atsScore,
        atsTier: result.tier,
        atsBreakdown: result.breakdown
      });
    } catch (err) {
      console.log(`   ⚠️  Scoring error for ${job.title}: ${err.message}`);
    }
  }

  scoredJobs.sort((a, b) => b.atsScore - a.atsScore);

  console.log(`\n   🚫 Hard rejected: ${hardRejects}`);
  console.log(`   ⬇️  Below threshold: ${belowThreshold}`);
  console.log(`   ✅ Passed ATS (55+): ${scoredJobs.length}`);

  const tierBreakdown = {
    applyNow: scoredJobs.filter(j => j.atsScore >= 85).length,
    applyStrong: scoredJobs.filter(j => j.atsScore >= 70 && j.atsScore < 85).length,
    network: scoredJobs.filter(j => j.atsScore >= 55 && j.atsScore < 70).length
  };

  console.log(`\n   🔥 Apply Now (85+): ${tierBreakdown.applyNow}`);
  console.log(`   ⭐ Apply Strong (70-84): ${tierBreakdown.applyStrong}`);
  console.log(`   🤝 Network (55-69): ${tierBreakdown.network}`);

  // Filter to NEW only
  const newJobs = scoredJobs
    .filter(j => !seenUrls.has(j.url))
    .map(j => ({ ...j, foundDate: new Date().toISOString(), isNew: true }));

  const newTiers = {
    applyNow: newJobs.filter(j => j.atsScore >= 85).length,
    applyStrong: newJobs.filter(j => j.atsScore >= 70 && j.atsScore < 85).length,
    network: newJobs.filter(j => j.atsScore >= 55 && j.atsScore < 70).length
  };

  console.log(`\n🆕 NEW jobs never sent before: ${newJobs.length}`);

  // Update seen URLs
  deduped.forEach(j => j.url && seenUrls.add(j.url));
  saveSeenUrls(seenUrls);

  // Update jobs.json
  let existingJobs = [];
  try {
    if (fs.existsSync(JOBS_PATH)) {
      existingJobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8')).all || [];
    }
  } catch { existingJobs = []; }

  const newUrls = new Set(newJobs.map(j => j.url));
  const merged = [
    ...newJobs,
    ...existingJobs.filter(j => !newUrls.has(j.url)).map(j => ({ ...j, isNew: false })).slice(0, 300)
  ];

  fs.writeFileSync(JOBS_PATH, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    newToday: newJobs.length,
    totalTracked: merged.length,
    tierBreakdownToday: newTiers,
    all: merged
  }, null, 2));

  // Save today.json for email
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: dateStr,
    count: newJobs.length,
    totalFound: scoredJobs.length,
    hardRejects,
    belowThreshold,
    tierBreakdown: newTiers,
    jobs: newJobs
  }, null, 2));

  console.log(`\n✅ Complete! ${newJobs.length} new jobs ready to email.`);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    count: 0, jobs: [], error: err.message
  }, null, 2));
  process.exit(1);
});
