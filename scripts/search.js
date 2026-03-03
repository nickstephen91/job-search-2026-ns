// Nick Stephen Job Search Agent - search.js
// Finds new job postings → passes through 3-layer ATS scoring → saves qualifying jobs only
const fs = require('fs');
const path = require('path');
const { scoreJob } = require('./score-engine');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const JOBS_PATH = path.join(RESULTS_DIR, 'jobs.json');

const NICK_PROFILE = `
CANDIDATE: Nick Stephen
CURRENT TITLE: Vice President, Alliances & Resellers
LOCATION: Stuart, FL 34997 — Treasure Coast
WORK: Fully remote (USA) OR onsite/hybrid within 60 miles of Stuart FL (Treasure Coast region)
  IN RADIUS: Stuart, Port St. Lucie, Fort Pierce, Vero Beach, Jupiter, Palm Beach Gardens,
             West Palm Beach, Lake Worth, Boynton Beach, Okeechobee, Hobe Sound, Jensen Beach,
             Palm City, Sebastian, Boca Raton (northern edge)
  EXCLUDE UNLESS REMOTE: Miami, Fort Lauderdale, Orlando, Tampa, Jacksonville

EXPERIENCE: 10+ years · HR Tech · Compliance · Partner Ecosystems · PEO

TARGET ROLES (Director+ / VP+ only):
Director/VP of Alliances, Partnerships, Channel Sales, Business Development, Partner Ecosystem,
Customer Success, Client Success, Reseller Programs, Revenue Operations, Sales Operations,
GTM Strategy, Strategic Accounts, Account Management, Sales Enablement, Partner Enablement,
Head of Partnerships, Senior Director of Partnerships, VP of Customer Success

TARGET INDUSTRIES (priority order):
1. HR Technology / HCM (HIGHEST)
2. Workforce Compliance / I-9 / E-Verify / WOTC / UCM (HIGHEST)
3. PEO — Professional Employer Organizations (HIGHEST)
4. Payroll Technology
5. B2B SaaS (any vertical)
6. Benefits Tech / Staffing Tech / Insurance Tech (employer-facing)
7. Background Screening / Identity Verification
8. Fintech / Insurtech (B2B, employer-facing)

COMPENSATION: $130,000–$400,000 base. Full-time only. Max travel 35%.

KEY QUALIFICATIONS:
Built partner/channel/alliance programs from scratch · Revenue operations & CRM architecture ·
PEO and HR Tech ecosystem expertise · Reseller/referral program design and tiering ·
Co-marketing and partner enablement · Enterprise account management and QBRs ·
Cross-functional leadership (Sales/Product/Marketing/Legal) · Workforce compliance domain ·
Acquisition integration experience (Corporate Cost Control → Experian)

WORK HISTORY:
- VP Alliances & Resellers @ HRWorkCycles (2024–Present)
- Alliance Director @ Experian Employer Services (2021–2024)
- Director of Operations @ Corporate Cost Control/Experian (2014–2020)

IMPORTANT: Return the FULL job description text in the "description" field.
This is critical for accurate scoring. Include all requirements, responsibilities, and qualifications.
`;

const SYSTEM_PROMPT = `You are a precise job search agent. Find REAL, CURRENTLY ACTIVE job postings matching this candidate profile.

SEARCH ALL OF THESE SOURCES:
Job Boards: LinkedIn Jobs, Indeed, ZipRecruiter, Glassdoor, Monster, CareerBuilder, Dice, Built In, Wellfound/AngelList
ATS Platforms: Greenhouse.io, Lever.co, Workday, iCIMS, SmartRecruiters, Jobvite, Taleo
Remote Boards: Remotive.com, We Work Remotely, Remote.co, FlexJobs, Himalayas, PowerToFly
HR Niche: SHRM Jobs, HR Executive jobs, HR Tech job boards
Recruiters: Robert Half, Michael Page, Kforce, LHH, Randstad, Spencer Stuart, Korn Ferry, Heidrick & Struggles
Company Direct: TriNet, Insperity, ADP, Paychex, Justworks, Rippling, Deel, Gusto, BambooHR, Workday,
  UKG, Ceridian, Paylocity, Paycom, HiBob, Lattice, Checkr, Sterling, Experian, Equifax Workforce

Return ONLY a valid JSON array — no markdown, no explanation, nothing else:
[
  {
    "title": "Exact job title",
    "company": "Company name",
    "location": "City, State or Remote",
    "workType": "Remote | Hybrid | Onsite",
    "salary": "Salary range or Not Listed",
    "posted": "Date or relative time",
    "url": "Direct URL to posting",
    "source": "Where found",
    "description": "FULL job description text — all responsibilities, requirements, qualifications. Be thorough.",
    "requirements": "Key requirements bullet points as a string",
    "companyStage": "Startup | Series A | Series B | Series C | Enterprise | Public",
    "industry": "HR Tech | Compliance | PEO | SaaS | Payroll | etc",
    "recruiterListing": true or false
  }
]`;

const SEARCHES = [
  {
    name: 'Partnerships, Alliances & Channel',
    prompt: `Search LinkedIn Jobs, Indeed, ZipRecruiter, Glassdoor, Greenhouse, Lever, Wellfound, Built In, Remotive, and We Work Remotely for ACTIVE Director and VP level Partnerships, Alliances, Channel Sales, Business Development, Ecosystem, and Reseller roles. Remote or South Florida / Treasure Coast. $130K+. Include FULL job description text. Return as JSON array.\n\n${NICK_PROFILE}`
  },
  {
    name: 'Customer Success & Account Management',
    prompt: `Search LinkedIn Jobs, Indeed, ZipRecruiter, Glassdoor, SmartRecruiters, and company career pages for ACTIVE Director and VP level Customer Success, Client Success, Strategic Accounts, and Account Management roles. Remote or South Florida. $130K+. HR Tech/SaaS/Compliance/PEO companies. Include FULL job description. Return as JSON array.\n\n${NICK_PROFILE}`
  },
  {
    name: 'Revenue Ops, Sales Ops & GTM',
    prompt: `Search LinkedIn Jobs, Indeed, Glassdoor, Built In, Wellfound, Remotive, Himalayas, and We Work Remotely for ACTIVE Director and VP level Revenue Operations, Sales Operations, RevOps, and GTM Strategy roles. Fully remote preferred. $130K+. B2B SaaS / HR Tech. Include FULL job description. Return as JSON array.\n\n${NICK_PROFILE}`
  },
  {
    name: 'HR Tech & PEO Companies Direct',
    prompt: `Search career pages, LinkedIn, and Indeed for ACTIVE senior Director and VP roles at: TriNet, Insperity, ADP, Paychex, Justworks, Rippling, Deel, Gusto, BambooHR, Workday, UKG, Ceridian, Paylocity, Paycom, HiBob, Lattice, Namely, Zenefits, Experian Employer Services, Equifax Workforce Solutions, Checkr, Sterling, First Advantage. Remote or South Florida. Include FULL job description. Return as JSON array.\n\n${NICK_PROFILE}`
  },
  {
    name: 'Recruiter & Headhunter Placements',
    prompt: `Search LinkedIn Jobs, Indeed, and ZipRecruiter for Director and VP roles placed by: Robert Half, Michael Page, Kforce, LHH, Randstad, Beacon Hill, Korn Ferry, Spencer Stuart, Heidrick & Struggles. Partnerships, alliances, customer success, revenue operations, BD roles. Remote or South Florida. $130K+. Include FULL job description. Return as JSON array.\n\n${NICK_PROFILE}`
  },
  {
    name: 'South Florida & Treasure Coast Local',
    prompt: `Search LinkedIn Jobs, Indeed, and ZipRecruiter for Director and VP roles with offices in: West Palm Beach, Palm Beach Gardens, Jupiter, Port St. Lucie, Fort Pierce, Vero Beach, Stuart, Hobe Sound, Jensen Beach, Boca Raton FL. Any industry. Partnerships, alliances, CS, operations, BD, account management, RevOps. Include FULL job description. Return as JSON array.\n\n${NICK_PROFILE}`
  }
];

function loadSeenUrls() {
  if (!fs.existsSync(SEEN_URLS_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(SEEN_URLS_PATH, 'utf8')).urls || []);
}

function saveSeenUrls(seenUrls) {
  fs.writeFileSync(SEEN_URLS_PATH, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalSeen: seenUrls.size,
    urls: Array.from(seenUrls)
  }, null, 2));
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

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1) return [];

  return JSON.parse(cleaned.substring(start, end + 1));
}

async function main() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  console.log('='.repeat(65));
  console.log('NICK STEPHEN — JOB SEARCH AGENT WITH 3-LAYER ATS SCORING');
  console.log(`DATE: ${dateStr}`);
  console.log('LAYERS: Hard Filters → Must-Haves (25pts) → Nice-to-Haves');
  console.log('TIERS: 85-100=Apply Now | 70-84=Apply Strong | 55-69=Network');
  console.log('='.repeat(65));

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const seenUrls = loadSeenUrls();
  console.log(`\n📚 Previously seen jobs in database: ${seenUrls.size}`);

  // Run all searches
  let allRaw = [];
  for (const search of SEARCHES) {
    console.log(`\n🔎 ${search.name}...`);
    try {
      const jobs = await runSearch(search);
      console.log(`   📥 Raw results returned: ${jobs.length}`);
      allRaw = allRaw.concat(jobs);
      await new Promise(r => setTimeout(r, 2500));
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
    }
  }

  // Deduplicate by URL
  const urlSet = new Set();
  const deduped = allRaw.filter(job => {
    if (!job.url || urlSet.has(job.url)) return false;
    urlSet.add(job.url);
    return true;
  });
  console.log(`\n📊 Unique jobs after dedup: ${deduped.length}`);

  // ── RUN 3-LAYER ATS SCORING ──────────────────────────────────────────────
  console.log('\n🏆 Running 3-layer ATS scoring...\n');

  let hardRejects = 0, belowThreshold = 0;
  const scoredJobs = [];

  for (const job of deduped) {
    const result = scoreJob(job);

    if (!result.passed) {
      if (result.hardFilterReason) {
        hardRejects++;
        // console.log(`   🚫 Hard reject: ${job.title} @ ${job.company} — ${result.hardFilterReason}`);
      } else {
        belowThreshold++;
        // console.log(`   ⬇️  Below threshold (${result.atsScore}): ${job.title} @ ${job.company}`);
      }
      continue;
    }

    scoredJobs.push({
      ...job,
      atsScore: result.atsScore,
      atsTier: result.tier,
      atsBreakdown: result.breakdown,
      hardFilterPassed: true
    });
  }

  // Sort by ATS score
  scoredJobs.sort((a, b) => b.atsScore - a.atsScore);

  console.log(`   🚫 Hard filter rejects: ${hardRejects}`);
  console.log(`   ⬇️  Below threshold (<55): ${belowThreshold}`);
  console.log(`   ✅ Passed ATS (score 55+): ${scoredJobs.length}`);

  // Score tier breakdown
  const tiers = {
    applyNow: scoredJobs.filter(j => j.atsScore >= 85).length,
    applyStrong: scoredJobs.filter(j => j.atsScore >= 70 && j.atsScore < 85).length,
    network: scoredJobs.filter(j => j.atsScore >= 55 && j.atsScore < 70).length
  };
  console.log(`\n   🔥 Apply Immediately (85-100): ${tiers.applyNow}`);
  console.log(`   ⭐ Apply — Strong Fit (70-84): ${tiers.applyStrong}`);
  console.log(`   🤝 Network/Warm Intro (55-69): ${tiers.network}`);

  // Filter to NEW only
  const newJobs = scoredJobs
    .filter(j => !seenUrls.has(j.url))
    .map(j => ({ ...j, foundDate: new Date().toISOString(), isNew: true }));

  const newTiers = {
    applyNow: newJobs.filter(j => j.atsScore >= 85).length,
    applyStrong: newJobs.filter(j => j.atsScore >= 70 && j.atsScore < 85).length,
    network: newJobs.filter(j => j.atsScore >= 55 && j.atsScore < 70).length
  };

  console.log(`\n🆕 NEW jobs (never sent before): ${newJobs.length}`);
  console.log(`   🔥 Apply Now: ${newTiers.applyNow} | ⭐ Apply Strong: ${newTiers.applyStrong} | 🤝 Network: ${newTiers.network}`);

  // Update seen URLs database
  deduped.forEach(j => j.url && seenUrls.add(j.url));
  saveSeenUrls(seenUrls);

  // Update jobs.json (active tracked jobs with scores)
  const existing = fs.existsSync(JOBS_PATH)
    ? JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8')).all || []
    : [];

  const existingUrls = new Set(newJobs.map(j => j.url));
  const mergedJobs = [
    ...newJobs,
    ...existing.filter(j => !existingUrls.has(j.url)).map(j => ({ ...j, isNew: false })).slice(0, 300)
  ];

  fs.writeFileSync(JOBS_PATH, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    newToday: newJobs.length,
    totalTracked: mergedJobs.length,
    tierBreakdownToday: newTiers,
    all: mergedJobs
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

  console.log(`\n✅ Done! ${newJobs.length} new qualifying jobs ready to send.`);
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(TODAY_PATH, JSON.stringify({
    date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    count: 0, jobs: [], error: err.message
  }, null, 2));
  process.exit(1);
});
