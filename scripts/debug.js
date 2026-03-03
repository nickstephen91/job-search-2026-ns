// DEBUG SCRIPT - Run this to see exactly what the API is returning
// This bypasses all scoring and just shows raw API output

async function debug() {
  console.log('='.repeat(60));
  console.log('DEBUG: Testing single API call');
  console.log('API Key present:', !!process.env.ANTHROPIC_API_KEY);
  console.log('API Key prefix:', process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...');
  console.log('='.repeat(60));

  const testPrompt = `Search LinkedIn Jobs and Indeed for 3 current job postings with the title "Director of Partnerships" that are remote or in Florida. Return them as a JSON array like this:
[
  {
    "title": "Director of Partnerships",
    "company": "Example Corp",
    "location": "Remote",
    "workType": "Remote",
    "salary": "$150,000 - $180,000",
    "posted": "2 days ago",
    "url": "https://www.linkedin.com/jobs/view/example",
    "source": "LinkedIn",
    "description": "We are looking for a Director of Partnerships...",
    "companyStage": "Series B",
    "industry": "HR Tech",
    "recruiterListing": false
  }
]`;

  try {
    console.log('\n📡 Making API call...');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: testPrompt }]
      })
    });

    console.log('HTTP Status:', res.status, res.statusText);

    const data = await res.json();

    console.log('\n📦 Response structure:');
    console.log('- stop_reason:', data.stop_reason);
    console.log('- content blocks:', data.content?.length);
    console.log('- error:', data.error?.message || 'none');

    if (data.content) {
      data.content.forEach((block, i) => {
        console.log(`\nBlock ${i}: type=${block.type}`);
        if (block.type === 'text') {
          console.log('Text length:', block.text?.length);
          console.log('First 500 chars:\n', block.text?.substring(0, 500));
        }
        if (block.type === 'tool_use') {
          console.log('Tool:', block.name);
          console.log('Input:', JSON.stringify(block.input)?.substring(0, 200));
        }
        if (block.type === 'tool_result') {
          console.log('Result length:', JSON.stringify(block.content)?.length);
        }
      });
    }

    // Try to find and parse any JSON
    const allText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const start = allText.indexOf('[');
    const end = allText.lastIndexOf(']');

    if (start !== -1 && end !== -1) {
      console.log('\n✅ Found JSON array in response!');
      try {
        const jobs = JSON.parse(allText.substring(start, end + 1));
        console.log('Jobs parsed:', jobs.length);
        if (jobs.length > 0) {
          console.log('First job:', JSON.stringify(jobs[0], null, 2));
        }
      } catch (e) {
        console.log('❌ JSON parse failed:', e.message);
        console.log('Raw JSON attempt:', allText.substring(start, start + 300));
      }
    } else {
      console.log('\n❌ No JSON array found in response');
      console.log('Full text response:\n', allText.substring(0, 1000));
    }

  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    console.error(err.stack);
  }
}

debug();
