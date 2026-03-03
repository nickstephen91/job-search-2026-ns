// Nick Stephen Job Search Agent - score-engine.js v2
// PHILOSOPHY: Cast wide, score honestly, let Nick decide.
// Hard filters only reject the truly obvious misfits.
// Everything else gets scored 0-100 and Nick sees anything 40+.

const NICK_CONFIG = {
  location: {
    inRadiusCities: [
      'stuart', 'port st. lucie', 'port saint lucie', 'fort pierce', 'vero beach',
      'jupiter', 'palm beach gardens', 'west palm beach', 'lake worth', 'boynton beach',
      'okeechobee', 'hobe sound', 'jensen beach', 'palm city', 'indiantown',
      'sebastian', 'boca raton', 'delray beach', 'florida', ' fl '
    ],
    excludeUnlessRemote: ['miami', 'fort lauderdale', 'orlando', 'tampa', 'jacksonville']
  },
  comp: { floor: 130000 },
  level: {
    accepted: ['director', 'vp', 'vice president', 'senior director', 'head of', 'svp', 'chief', 'principal'],
    rejected: ['coordinator', 'specialist', 'analyst', 'junior', 'entry level', 'intern', 'assistant']
  }
};

function hardFilters(job) {
  const title = (job.title || '').toLowerCase();
  const location = (job.location || '').toLowerCase();
  const workType = (job.workType || '').toLowerCase();
  const salary = (job.salary || '');

  // 1. LOCATION — remote always passes. Onsite must not be in excluded cities.
  const isRemote = workType.includes('remote') || location.includes('remote');
  const isInRadius = NICK_CONFIG.location.inRadiusCities.some(c => location.includes(c));
  const isExcluded = NICK_CONFIG.location.excludeUnlessRemote.some(c => location.includes(c));

  if (!isRemote && !isInRadius && isExcluded) {
    return { pass: false, reason: `Location: "${job.location}" is an excluded city and not remote` };
  }

  // 2. SALARY — only reject if salary is explicitly listed AND clearly below floor
  if (salary && salary !== 'Not Listed' && salary !== '') {
    const nums = salary.replace(/[^0-9]/g, ' ').trim().split(/\s+/)
      .map(Number).filter(n => n > 10000 && n < 1000000);
    if (nums.length > 0 && Math.max(...nums) < 100000) {
      return { pass: false, reason: `Salary too low: ${salary}` };
    }
  }

  // 3. LEVEL — only reject if clearly entry-level/coordinator
  const hasRejectedLevel = NICK_CONFIG.level.rejected.some(l => title.includes(l));
  const hasAcceptedLevel = NICK_CONFIG.level.accepted.some(l => title.includes(l));
  if (hasRejectedLevel && !hasAcceptedLevel) {
    return { pass: false, reason: `Level too junior: "${job.title}"` };
  }

  // 4. EMPLOYMENT — reject obvious contract-only
  const text = `${job.title} ${job.description || ''}`.toLowerCase();
  if ((text.includes('contract only') || text.includes('1099 only')) && !text.includes('full-time')) {
    return { pass: false, reason: 'Contract only role' };
  }

  return { pass: true, reason: 'Passed hard filters' };
}

function fitScore(job) {
  const text = `${job.title} ${job.description || ''} ${job.requirements || ''} ${job.industry || ''} ${(job.matchReasons || []).join(' ')}`.toLowerCase();
  const title = (job.title || '').toLowerCase();
  const location = (job.location || '').toLowerCase();
  const workType = (job.workType || '').toLowerCase();

  let score = 0;
  const breakdown = {
    roleScope:      { earned: 0, max: 30, items: [] },
    domainMatch:    { earned: 0, max: 25, items: [] },
    revenueReality: { earned: 0, max: 20, items: [] },
    companyMotion:  { earned: 0, max: 15, items: [] },
    logistics:      { earned: 0, max: 10, items: [] }
  };

  // ── ROLE + SCOPE (30pts) ─────────────────────────────────────────────────

  // Title match — most important signal
  if (['partnership', 'alliances', 'alliance', 'channel'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 15;
    breakdown.roleScope.items.push('Partnerships/Alliances/Channel in title (+15)');
  } else if (['customer success', 'client success'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 12;
    breakdown.roleScope.items.push('Customer Success in title (+12)');
  } else if (['revenue operations', 'revops', 'sales operations'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 12;
    breakdown.roleScope.items.push('RevOps/Sales Ops in title (+12)');
  } else if (['business development', 'ecosystem', 'reseller'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 10;
    breakdown.roleScope.items.push('BD/Ecosystem in title (+10)');
  } else if (['account management', 'strategic account', 'enablement'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 8;
    breakdown.roleScope.items.push('Account Mgmt/Enablement in title (+8)');
  } else if (['operations', 'go-to-market', 'gtm'].some(k => title.includes(k))) {
    breakdown.roleScope.earned += 6;
    breakdown.roleScope.items.push('Ops/GTM in title (+6)');
  }

  // Build/own/launch language
  if (['build', 'own', 'launch', 'stand up', 'from scratch', 'greenfield', 'first hire', 'create', 'establish'].some(s => text.includes(s))) {
    breakdown.roleScope.earned += 8;
    breakdown.roleScope.items.push('Build/own/launch language (+8)');
  }

  // Exec visibility
  if (['cro', 'ceo', 'chief revenue', 'chief executive', 'president'].some(e => text.includes(e))) {
    breakdown.roleScope.earned += 4;
    breakdown.roleScope.items.push('Reports to CRO/CEO (+4)');
  }

  // Team leadership
  if (['lead a team', 'manage a team', 'team of', 'direct report', 'hire and build', 'build a team'].some(s => text.includes(s))) {
    breakdown.roleScope.earned += 3;
    breakdown.roleScope.items.push('Team leadership (+3)');
  }

  // ── DOMAIN MATCH (25pts) ─────────────────────────────────────────────────

  // HR Tech / HCM / Payroll (top priority)
  const hrKeywords = ['hr tech', 'hrtech', 'hcm', 'human capital', 'payroll', 'hris',
    'workforce', 'talent management', 'benefits', 'peo', 'professional employer',
    'employer services', 'human resources', 'hr software', 'hr platform', 'hr saas'];
  const hrHits = hrKeywords.filter(k => text.includes(k));
  if (hrHits.length >= 2) {
    breakdown.domainMatch.earned += 12;
    breakdown.domainMatch.items.push(`Strong HR Tech domain (${hrHits.slice(0,2).join(', ')}) (+12)`);
  } else if (hrHits.length === 1) {
    breakdown.domainMatch.earned += 7;
    breakdown.domainMatch.items.push(`HR Tech signal (${hrHits[0]}) (+7)`);
  }

  // Compliance / I-9 / E-Verify / WOTC
  const complianceKw = ['compliance', 'i-9', 'i9', 'e-verify', 'everify', 'wotc',
    'work opportunity', 'unemployment', 'ucm', 'tax credit', 'aca', 'background check',
    'background screening', 'identity verification', 'onboarding compliance', 'regulatory'];
  const compHits = complianceKw.filter(k => text.includes(k));
  if (compHits.length >= 2) {
    breakdown.domainMatch.earned += 10;
    breakdown.domainMatch.items.push(`Strong compliance domain (${compHits.slice(0,2).join(', ')}) (+10)`);
  } else if (compHits.length === 1) {
    breakdown.domainMatch.earned += 5;
    breakdown.domainMatch.items.push(`Compliance signal (${compHits[0]}) (+5)`);
  }

  // Integrations / ecosystem / marketplace
  if (['integration', 'api', 'marketplace', 'app store', 'ecosystem', 'isv', 'embedded', 'connector', 'technology partner'].some(k => text.includes(k))) {
    breakdown.domainMatch.earned += 3;
    breakdown.domainMatch.items.push('Integrations/ecosystem language (+3)');
  }

  // ── REVENUE REALITY (20pts) ──────────────────────────────────────────────

  // Pipeline / quota / ARR ownership
  if (['pipeline', 'quota', 'arr', 'revenue target', 'bookings', 'partner-sourced',
       'sourced revenue', 'revenue ownership', 'partner revenue', 'gmv'].some(k => text.includes(k))) {
    breakdown.revenueReality.earned += 10;
    breakdown.revenueReality.items.push('Revenue/pipeline/quota ownership (+10)');
  }

  // Co-sell / GTM motion
  if (['co-sell', 'cosell', 'joint go-to-market', 'joint gtm', 'co-marketing',
       'field enablement', 'partner-led', 'channel-led'].some(k => text.includes(k))) {
    breakdown.revenueReality.earned += 6;
    breakdown.revenueReality.items.push('Co-sell/joint GTM language (+6)');
  }

  // Salary transparency
  if (job.salary && job.salary !== 'Not Listed' && job.salary !== '') {
    breakdown.revenueReality.earned += 4;
    breakdown.revenueReality.items.push(`Salary listed: ${job.salary} (+4)`);
  }

  // ── COMPANY + MOTION (15pts) ─────────────────────────────────────────────

  // SaaS / B2B signal
  if (['saas', 'b2b', 'software as a service', 'enterprise software', 'cloud'].some(k => text.includes(k))) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push('B2B SaaS/cloud company (+5)');
  }

  // Channel/partner motion
  if (['channel program', 'partner program', 'reseller', 'indirect sales',
       'channel sales', 'var ', 'referral program', 'broker', 'partner ecosystem'].some(k => text.includes(k))) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push('Channel/partner sales motion (+5)');
  }

  // Company stage
  const stage = (job.companyStage || '').toLowerCase();
  if (['series b', 'series c', 'series d', 'public', 'enterprise', 'growth'].some(s => stage.includes(s))) {
    breakdown.companyMotion.earned += 5;
    breakdown.companyMotion.items.push(`Good stage: ${job.companyStage} (+5)`);
  } else if (['series a', 'startup', 'seed'].some(s => stage.includes(s))) {
    breakdown.companyMotion.earned += 2;
    breakdown.companyMotion.items.push(`Early stage: ${job.companyStage} (+2)`);
  }

  // ── LOGISTICS (10pts) ────────────────────────────────────────────────────

  // Travel
  const highTravel = ['50%', '75%', '100%', 'extensive travel', 'heavy travel'];
  if (!highTravel.some(t => text.includes(t))) {
    breakdown.logistics.earned += 5;
    breakdown.logistics.items.push('Travel within tolerance (+5)');
  }

  // Work type
  if (workType.includes('remote') || location.includes('remote')) {
    breakdown.logistics.earned += 5;
    breakdown.logistics.items.push('Fully remote (+5)');
  } else if (workType.includes('hybrid')) {
    breakdown.logistics.earned += 3;
    breakdown.logistics.items.push('Hybrid (+3)');
  } else {
    breakdown.logistics.earned += 2;
    breakdown.logistics.items.push('Onsite in commute radius (+2)');
  }

  // Cap each category
  Object.keys(breakdown).forEach(k => {
    breakdown[k].earned = Math.min(breakdown[k].earned, breakdown[k].max);
  });

  const total = Math.min(
    Object.values(breakdown).reduce((sum, cat) => sum + cat.earned, 0),
    100
  );

  return { total, breakdown, tier: getTier(total) };
}

function getTier(score) {
  if (score >= 85) return { label: 'APPLY IMMEDIATELY', emoji: '🔥', color: '#00c853' };
  if (score >= 70) return { label: 'APPLY — STRONG FIT', emoji: '⭐', color: '#64dd17' };
  if (score >= 55) return { label: 'NETWORK / WARM INTRO', emoji: '🤝', color: '#ffc400' };
  if (score >= 40) return { label: 'WORTH REVIEWING', emoji: '👀', color: '#ff9100' };
  return { label: 'LOW FIT', emoji: '❌', color: '#bdbdbd' };
}

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

  // LOWERED THRESHOLD to 40 so Nick sees more results
  return {
    passed: result.total >= 40,
    hardFilterReason: null,
    atsScore: result.total,
    tier: result.tier,
    breakdown: result.breakdown
  };
}

module.exports = { scoreJob, hardFilters, fitScore, getTier, NICK_CONFIG };
