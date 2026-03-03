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
  const text = `${job.title} ${job.snippet || ''} ${job.industry || ''}`.toLowerCase();
  const hits = { core: [], domain: [], tools: [], leadership: [] };

  hits.core = NICK_RESUME.coreSkills.filter(k => text.includes(k));
  hits.domain = NICK_RESUME.domain.filter(k => text.includes(k));
  hits.tools = NICK_RESUME.tools.filter(k => text.includes(k));
  hits.leadership = NICK_RESUME.leadership.filter(k => text.includes(k));

  // Score: core=2pts each, domain=1pt, tools=1pt, leadership=1.5pts
  const raw = (hits.core.length * 2) + (hits.domain.length * 1) +
              (hits.tools.length * 1) + (hits.leadership.length * 1.5);

  // Scale to max 20 pts (cap at 10 raw points = 20 pts)
  const score = Math.min(Math.round((raw / 10) * WEIGHTS.resumeKeywords), WEIGHTS.resumeKeywords);

  const topMatches = [
    ...hits.core.slice(0, 3),
    ...hits.leadership.slice(0, 1),
    ...hits.tools.slice(0, 1)
  ].slice(0, 4);

  return {
    score,
    totalHits: hits.core.length + hits.domain.length + hits.tools.length + hits.leadership.length,
    topMatches,
    breakdown: hits
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

module.exports = { rankJob, WEIGHTS, NICK_RESUME };
