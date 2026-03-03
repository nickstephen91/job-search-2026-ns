// Nick Stephen Job Search Agent - score-engine.js
// 3-layer ATS scoring: Hard Filters → Must-Haves → Nice-to-Haves
// Returns 0-100 score with full breakdown. Jobs below 55 are discarded.

const NICK_CONFIG = {
  location: {
    coords: { lat: 27.1975, lng: -80.2528 }, // Stuart FL 34997
    maxMiles: 60,                              // ≤60 miles from Treasure Coast
    inRadiusCities: [
      'stuart', 'port st. lucie', 'fort pierce', 'vero beach', 'jupiter',
      'palm beach gardens', 'west palm beach', 'lake worth', 'boynton beach',
      'okeechobee', 'hobe sound', 'jensen beach', 'palm city', 'indiantown',
      'sebastian', 'fellsmere', 'boca raton'  // northern edge
    ],
    excludeUnlessRemote: ['miami', 'fort lauderdale', 'orlando', 'tampa', 'jacksonville']
  },
  comp: {
    floor: 130000,
    bands: { good: 135000, great: 160000, exceptional: 200000 }
  },
  level: {
    accepted: ['director', 'vp', 'vice president', 'senior director', 'head of', 'svp', 'chief'],
    rejected: ['manager', 'associate', 'coordinator', 'specialist', 'analyst', 'junior', 'entry']
  },
  functions: [
    'partnership', 'alliances', 'channel', 'reseller', 'ecosystem',
    'revenue operations', 'revops', 'sales operations', 'customer success',
    'client success', 'business development', 'go-to-market', 'gtm',
    'account management', 'strategic accounts', 'enablement'
  ],
  industries: {
    preferred: ['hr tech', 'hrtech', 'hcm', 'payroll', 'compliance', 'peo', 'workforce',
                'i-9', 'e-verify', 'wotc', 'ucm', 'unemployment', 'background screening',
                'identity verification', 'risk', 'fintech', 'insurtech'],
    acceptable: ['b2b saas', 'saas', 'enterprise software', 'data analytics', 'staffing',
                 'benefits', 'recruiting tech', 'talent', 'legaltech']
  },
  maxTravel: 35, // percent
  employmentType: ['full-time', 'full time', 'permanent'],
  travelExclusions: ['50%', '75%', '100%', 'extensive travel', 'heavy travel']
};

// ─── HARD FILTERS ────────────────────────────────────────────────────────────
// Returns { pass: bool, reason: string }
function hardFilters(job) {
  const text = `${job.title} ${job.description || ''} ${job.location || ''} ${job.requirements || ''}`.toLowerCase();
  const title = (job.title || '').toLowerCase();
  const location = (job.location || '').toLowerCase();
  const workType = (job.workType || '').toLowerCase();

  // 1. LOCATION — must be remote or within radius
  const isRemote = workType.includes('remote') || location.includes('remote') ||
                   text.includes('fully remote') || text.includes('remote-first') ||
                   text.includes('work from home') || text.includes('wfh');

  const inRadius = NICK_CONFIG.location.inRadiusCities.some(city => location.includes(city));

  const isExcluded = NICK_CONFIG.location.excludeUnlessRemote.some(city => location.includes(city));

  if (!isRemote && !inRadius) {
    return { pass: false, reason: `Location fail: "${job.location}" not remote or within 60mi of Stuart FL` };
  }
  if (isExcluded && !isRemote) {
    return { pass: false, reason: `Location fail: "${job.location}" excluded unless remote` };
  }

  // 2. COMPENSATION — base must meet floor (if salary listed)
  if (job.salary && job.salary !== 'Not Listed' && job.salary !== '') {
    const nums = job.salary.replace(/[^0-9]/g, ' ').trim().split(/\s+/)
      .map(Number).filter(n => n > 10000);
    if (nums.length > 0) {
      const maxSalary = Math.max(...nums);
      if (maxSalary < NICK_CONFIG.comp.floor) {
        return { pass: false, reason: `Comp fail: Max salary $${maxSalary.toLocaleString()} below floor $${NICK_CONFIG.comp.floor.toLocaleString()}` };
      }
    }
  }

  // 3. ROLE LEVEL — must be Director+ or VP+
  const hasAcceptedLevel = NICK_CONFIG.level.accepted.some(l => title.includes(l));
  const hasRejectedLevel = NICK_CONFIG.level.rejected.some(l => title.includes(l));
  if (!hasAcceptedLevel || hasRejectedLevel) {
    return { pass: false, reason: `Level fail: "${job.title}" is not Director+ or VP+` };
  }

  // 4. FUNCTION — title or description must include at least one target function
  const hasFunction = NICK_CONFIG.functions.some(f =>
    title.includes(f) || (job.description || '').toLowerCase().includes(f)
  );
  if (!hasFunction) {
    return { pass: false, reason: `Function fail: No partnerships/alliances/CS/RevOps signal in "${job.title}"` };
  }

  // 5. INDUSTRY — must be B2B or have acceptable industry signal
  const allIndustries = [...NICK_CONFIG.industries.preferred, ...NICK_CONFIG.industries.acceptable];
  const hasIndustry = allIndustries.some(ind => text.includes(ind)) ||
    (job.industry || '').toLowerCase().split('/').some(i =>
      allIndustries.some(ind => i.trim().includes(ind))
    );
  if (!hasIndustry && !text.includes('saas') && !text.includes('software')) {
    return { pass: false, reason: `Industry fail: No B2B SaaS or relevant industry signal detected` };
  }

  // 6. TRAVEL — reject if over max
  const travelFail = NICK_CONFIG.travelExclusions.some(t => text.includes(t));
  if (travelFail) {
    return { pass: false, reason: `Travel fail: Excessive travel requirement detected` };
  }

  // 7. EMPLOYMENT TYPE — full-time only
  const mentionsContract = text.includes('contract only') || text.includes('1099') ||
    text.includes('freelance') || text.includes('part-time') || text.includes('part time');
  const mentionsFullTime = NICK_CONFIG.employmentType.some(t => text.includes(t));
  if (mentionsContract && !mentionsFullTime) {
    return { pass: false, reason: `Employment type fail: Contract/freelance/part-time detected` };
  }

  // 8. WORK AUTHORIZATION — must accept US employees
  if (text.includes('no sponsorship') || text.includes('must be authorized') ||
      text.includes('us citizen only') || text.includes('security clearance required')) {
    // These are fine — Nick is a US citizen. Pass.
  }
  if (text.includes('sponsorship required') || text.includes('visa required')) {
    return { pass: false, reason: `Auth fail: Requires visa sponsorship` };
  }

  return { pass: true, reason: 'All hard filters passed' };
}

// ─── FIT SCORE (0–100) ────────────────────────────────────────────────────────
function fitScore(job) {
  const text = `${job.title} ${job.description || ''} ${job.requirements || ''} ${job.scoreReasoning || ''} ${(job.matchReasons || []).join(' ')} ${(job.keyRequirements || []).join(' ')}`.toLowerCase();
  const title = (job.title || '').toLowerCase();

  let score = 0;
  const breakdown = {
    roleScope: { earned: 0, max: 30, items: [] },
    domainMatch: { earned: 0, max: 25, items: [] },
    revenueReality: { earned: 0, max: 20, items: [] },
    companyMotion: { earned: 0, max: 15, items: [] },
    logistics: { earned: 0, max: 10, items: [] }
  };

  // ── A. ROLE + SCOPE (30 pts) ──────────────────────────────────────────────
  // Partnerships/Alliances in title (+10)
  if (['partnership', 'alliances', 'alliance', 'channel', 'ecosystem', 'reseller'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 10;
    breakdown.roleScope.items.push('Partnerships/Alliances/Channel in title (+10)');
  } else if (['customer success', 'client success', 'revenue operations', 'revops', 'business development'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 7;
    breakdown.roleScope.items.push('CS/RevOps/BD in title (+7)');
  } else if (['account management', 'strategic accounts', 'enablement'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 5;
    breakdown.roleScope.items.push('Account Management/Enablement in title (+5)');
  }

  // "Build/own partner program" language (+10)
  const buildSignals = ['build', 'own', 'launch', 'stand up', 'from scratch', 'from zero',
    'first hire', 'greenfield', 'create', 'establish', 'develop the', 'build out'];
  if (buildSignals.some(s => text.includes(s))) {
    breakdown.roleScope.earned += 10;
    breakdown.roleScope.items.push('Build/own/launch program language (+10)');
  }

  // Reports to CRO/CEO / exec visibility (+5)
  if (text.includes('reports to') || text.includes('reporting to')) {
    if (['cro', 'ceo', 'coo', 'chief revenue', 'chief executive', 'president', 'executive'].some(e => text.includes(e))) {
      breakdown.roleScope.earned += 5;
      breakdown.roleScope.items.push('Reports to CRO/CEO/exec (+5)');
    }
  }

  // Team leadership (+5)
  if (text.includes('lead a team') || text.includes('manage a team') || text.includes('team of') ||
      text.includes('direct report') || text.includes('hire and') || text.includes('build a team')) {
    breakdown.roleScope.earned += 5;
    breakdown.roleScope.items.push('Team leadership responsibility (+5)');
  }

  // ── B. DOMAIN MATCH (25 pts) ──────────────────────────────────────────────
  // HRTech/payroll/HCM (+10)
  const hrKeywords = ['hr tech', 'hrtech', 'hcm', 'human capital', 'payroll', 'hris', 'workforce management',
    'talent management', 'benefits', 'peo', 'professional employer', 'employer services',
    'human resources', 'hr software', 'hr platform'];
  const hrHits = hrKeywords.filter(k => text.includes(k));
  if (hrHits.length >= 2) {
    breakdown.domainMatch.earned += 10;
    breakdown.domainMatch.items.push(`HR Tech/HCM/Payroll domain (${hrHits.slice(0,3).join(', ')}) (+10)`);
  } else if (hrHits.length === 1) {
    breakdown.domainMatch.earned += 6;
    breakdown.domainMatch.items.push(`HR Tech signal (${hrHits[0]}) (+6)`);
  }

  // Compliance/I-9/E-Verify/WOTC/UCM (+10)
  const complianceKeywords = ['compliance', 'i-9', 'i9', 'e-verify', 'everify', 'wotc',
    'work opportunity', 'unemployment', 'ucm', 'tax credit', 'aca', 'cobra',
    'background check', 'background screening', 'identity verification', 'onboarding compliance'];
  const complianceHits = complianceKeywords.filter(k => text.includes(k));
  if (complianceHits.length >= 2) {
    breakdown.domainMatch.earned += 10;
    breakdown.domainMatch.items.push(`Compliance domain (${complianceHits.slice(0,3).join(', ')}) (+10)`);
  } else if (complianceHits.length === 1) {
    breakdown.domainMatch.earned += 6;
    breakdown.domainMatch.items.push(`Compliance signal (${complianceHits[0]}) (+6)`);
  }

  // Integrations/ecosystem (+5)
  const integrationKeywords = ['integration', 'api', 'marketplace', 'app store', 'ecosystem',
    'technology partner', 'isv', 'embedded', 'native integration', 'connector'];
  if (integrationKeywords.some(k => text.includes(k))) {
    breakdown.domainMatch.earned += 5;
    breakdown.domainMatch.items.push('Integrations/ecosystem/marketplace language (+5)');
  }

  // ── C. REVENUE REALITY (20 pts) ───────────────────────────────────────────
  // Partner-sourced ARR / pipeline ownership (+10)
  const revenueKeywords = ['partner-sourced', 'partner sourced', 'sourced revenue', 'pipeline',
    'quota', 'arr', 'revenue target', 'bookings', 'partner-led', 'influenced revenue',
    'revenue ownership', 'revenue responsibility', 'p&l', 'gmv', 'partner revenue'];
  if (revenueKeywords.some(k => text.includes(k))) {
    breakdown.revenueReality.earned += 10;
    breakdown.revenueReality.items.push('Partner-sourced ARR/pipeline/quota ownership (+10)');
  }

  // Co-sell / field enablement / GTM (+5)
  const cosellKeywords = ['co-sell', 'cosell', 'co sell', 'field enablement', 'joint go-to-market',
    'joint gtm', 'co-marketing', 'comarketing', 'field sales', 'solution selling',
    'joint selling', 'overlay', 'partner-led growth'];
  if (cosellKeywords.some(k => text.includes(k))) {
    breakdown.revenueReality.earned += 5;
    breakdown.revenueReality.items.push('Co-sell/field enablement/joint GTM (+5)');
  }

  // Clear comp + OTE posted (+5)
  if (job.salary && job.salary !== 'Not Listed') {
    breakdown.revenueReality.earned += 5;
    breakdown.revenueReality.items.push(`Salary/OTE posted: ${job.salary} (+5)`);
  }

  // ── D. COMPANY + MOTION (15 pts) ──────────────────────────────────────────
  // B2B SaaS (+5)
  if (text.includes('b2b') || text.includes('saas') || text.includes('software as a service') ||
      text.includes('enterprise software') || (job.industry || '').toLowerCase().includes('saas')) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push('B2B SaaS company/motion (+5)');
  }

  // Channel-friendly / partner-led motion (+5)
  const channelMotion = ['channel-led', 'channel led', 'partner-led', 'partner led', 'reseller',
    'channel program', 'partner program', 'distribution', 'indirect sales',
    'channel sales', 'var', 'value-added reseller', 'referral program',
    'broker channel', 'broker network', 'peo channel'];
  if (channelMotion.some(k => text.includes(k))) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push('Channel/partner-led sales motion (+5)');
  }

  // Stage match — Nick prefers Series B–D or growth-stage public (+5)
  const stage = (job.companyStage || '').toLowerCase();
  const goodStages = ['series b', 'series c', 'series d', 'growth', 'scale', 'public', 'enterprise'];
  const okStages = ['series a', 'late stage'];
  if (goodStages.some(s => stage.includes(s))) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push(`Ideal company stage: ${job.companyStage} (+5)`);
  } else if (okStages.some(s => stage.includes(s))) {
    breakdown.companyMotion.earned += 3;
    breakdown.companyMotion.items.push(`Acceptable company stage: ${job.companyStage} (+3)`);
  }

  // ── E. LOGISTICS (10 pts) ──────────────────────────────────────────────────
  // Travel within tolerance (+5)
  const highTravel = ['50%', '75%', '100%', 'extensive', 'heavy travel', 'significant travel'];
  const lowTravel = ['minimal travel', 'occasional travel', '10%', '15%', '20%', '25%', '30%',
    'up to 25', 'up to 30', 'some travel', 'limited travel', 'as needed'];
  if (!highTravel.some(t => text.includes(t))) {
    breakdown.logistics.earned += 5;
    breakdown.logistics.items.push(
      lowTravel.some(t => text.includes(t))
        ? 'Low/acceptable travel requirement (+5)'
        : 'No excessive travel mentioned (+5)'
    );
  }

  // Remote/hybrid match (+5)
  const workType = (job.workType || '').toLowerCase();
  if (workType.includes('remote')) {
    breakdown.logistics.earned += 5;
    breakdown.logistics.items.push('Fully remote (+5)');
  } else if (workType.includes('hybrid')) {
    breakdown.logistics.earned += 4;
    breakdown.logistics.items.push('Hybrid work (+4)');
  } else {
    // Onsite but in radius
    breakdown.logistics.earned += 2;
    breakdown.logistics.items.push('Onsite within commute radius (+2)');
  }

  // ── TOTAL ──────────────────────────────────────────────────────────────────
  const total = Object.values(breakdown).reduce((sum, cat) => sum + Math.min(cat.earned, cat.max), 0);

  // Cap each category at its max
  Object.keys(breakdown).forEach(k => {
    breakdown[k].earned = Math.min(breakdown[k].earned, breakdown[k].max);
  });

  return {
    total: Math.min(total, 100),
    breakdown,
    tier: getTier(total)
  };
}

function getTier(score) {
  if (score >= 85) return { label: 'APPLY IMMEDIATELY', emoji: '🔥', color: '#00c853' };
  if (score >= 70) return { label: 'APPLY — STRONG FIT', emoji: '⭐', color: '#64dd17' };
  if (score >= 55) return { label: 'NETWORK / WARM INTRO', emoji: '🤝', color: '#ffc400' };
  return { label: 'SKIP', emoji: '❌', color: '#ff5252' };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
function scoreJob(job) {
  const filterResult = hardFilters(job);

  if (!filterResult.pass) {
    return {
      passed: false,
      hardFilterReason: filterResult.reason,
      atsScore: 0,
      tier: { label: 'AUTO-REJECTED', emoji: '🚫', color: '#ff5252' },
      breakdown: null
    };
  }

  const result = fitScore(job);

  return {
    passed: result.total >= 55,
    hardFilterReason: null,
    atsScore: result.total,
    tier: result.tier,
    breakdown: result.breakdown
  };
}

module.exports = { scoreJob, hardFilters, fitScore, getTier, NICK_CONFIG };
