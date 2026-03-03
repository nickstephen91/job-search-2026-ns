// Nick Stephen Job Search Agent - verify-and-update-sheet.js
// 1. Checks every tracked job URL to see if it's still active
// 2. Removes filled/closed roles from the master list
// 3. Generates an updated CSV for the historical spreadsheet
// Runs daily AFTER search.js so new jobs are already in jobs.json

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const JOBS_PATH = path.join(RESULTS_DIR, 'jobs.json');
const MASTER_CSV_PATH = path.join(RESULTS_DIR, 'master_job_history.csv');

// Check if a job URL is still live
// We do a HEAD request — if 404, 410, or redirects to a generic jobs page, it's likely filled
async function isJobStillActive(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)'
      }
    });

    clearTimeout(timeout);

    // Definitive "gone" signals
    if (response.status === 404 || response.status === 410) return false;

    // Check final URL for filled-job redirect patterns
    const finalUrl = response.url.toLowerCase();
    const filledPatterns = [
      'job-filled', 'position-filled', 'no-longer-available',
      'expired', 'job-closed', 'listing-expired', 'not-found',
      '/404', 'jobnotfound', 'position-closed', 'job-expired'
    ];
    if (filledPatterns.some(p => finalUrl.includes(p))) return false;

    return true;
  } catch (err) {
    // Network error or timeout — assume still active to avoid false removals
    console.log(`   ⚠️  Could not verify ${url.substring(0, 60)}... — keeping (${err.message})`);
    return true;
  }
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function jobToCsvRow(job) {
  const fields = [
    job.title || '',
    job.company || '',
    job.location || '',
    job.workType || '',
    job.industry || '',
    job.score ? `${job.score}/10` : '',
    job.salary || 'Not Listed',
    job.posted || '',
    job.foundDate ? new Date(job.foundDate).toLocaleDateString('en-US') : '',
    job.companyStage || '',
    job.source || '',
    job.recruiterListing ? 'Yes' : 'No',
    job.requirementsMet || '',
    (job.matchReasons || []).join(' | '),
    job.scoreReasoning || '',
    job.url || ''
  ];
  return fields.map(escapeCsv).join(',');
}

const CSV_HEADER = [
  'Job Title', 'Company', 'Location', 'Work Type', 'Industry',
  'Match Score', 'Salary', 'Originally Posted', 'Date Found by Agent',
  'Company Stage', 'Source', 'Recruiter Listing', 'Requirements Met',
  'Match Reasons', 'Score Reasoning', 'Job URL'
].map(escapeCsv).join(',');

async function verifyAndUpdateSheet() {
  console.log('='.repeat(60));
  console.log('JOB VERIFICATION & SPREADSHEET UPDATE');
  console.log(`DATE: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(JOBS_PATH)) {
    console.log('⚠️  No jobs.json found — nothing to verify yet');
    return;
  }

  const data = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
  const allJobs = data.all || [];

  console.log(`\n📋 Total jobs to verify: ${allJobs.length}`);

  const activeJobs = [];
  const removedJobs = [];
  let checked = 0;

  for (const job of allJobs) {
    if (!job.url) {
      activeJobs.push(job); // No URL to check, keep it
      continue;
    }

    checked++;
    process.stdout.write(`\r   Checking ${checked}/${allJobs.length}...`);

    const active = await isJobStillActive(job.url);

    if (active) {
      activeJobs.push(job);
    } else {
      removedJobs.push(job);
      console.log(`\n   ❌ REMOVED (filled/closed): ${job.title} @ ${job.company}`);
    }

    // Small delay to be respectful
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n\n📊 Verification complete:`);
  console.log(`   ✅ Still active: ${activeJobs.length}`);
  console.log(`   ❌ Removed (filled): ${removedJobs.length}`);

  // Update jobs.json with only active jobs
  fs.writeFileSync(JOBS_PATH, JSON.stringify({
    ...data,
    lastVerified: new Date().toISOString(),
    totalTracked: activeJobs.length,
    removedToday: removedJobs.length,
    all: activeJobs
  }, null, 2));

  // Build master CSV — all active jobs sorted by score then date found
  const sorted = [...activeJobs].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return new Date(b.foundDate || 0) - new Date(a.foundDate || 0);
  });

  const csvLines = [CSV_HEADER, ...sorted.map(jobToCsvRow)];
  fs.writeFileSync(MASTER_CSV_PATH, csvLines.join('\n'), 'utf8');

  console.log(`\n📄 Master spreadsheet updated: ${activeJobs.length} active jobs`);
  console.log(`💾 Saved to: results/master_job_history.csv`);
}

verifyAndUpdateSheet().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
