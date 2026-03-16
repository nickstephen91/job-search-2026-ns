// Nick Stephen Job Search Agent v15 - CLEAN
const fs = require('fs');
const path = require('path');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const DOCS_RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');
const SEEN_URLS_PATH = path.join(RESULTS_DIR, 'seen_urls.json');
const TODAY_PATH = path.join(RESULTS_DIR, 'today.json');
const DOCS_TODAY_PATH = path.join(DOCS_RESULTS_DIR, 'today.json');
const TOP_PICKS_PATH = path.join(RESULTS_DIR, 'top_picks.json');

function clean(h){return(h||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function loadSeenUrls(){try{if(!fs.existsSync(SEEN_URLS_PATH))return new Set();const r=JSON.parse(fs.readFileSync(SEEN_URLS_PATH,'utf8'));const e=(!Array.isArray(r)&&Array.isArray(r.entries))?r.entries:[];const c=Date.now()-(14*24*60*60*1000);return new Set(e.filter(x=>x&&x.ts>c).map(x=>x.url).filter(Boolean));}catch{return new Set();}}
function saveSeenUrls(seen,newUrls){try{let e=[];if(fs.existsSync(SEEN_URLS_PATH)){const r=JSON.parse(fs.readFileSync(SEEN_URLS_PATH,'utf8'));e=(!Array.isArray(r)&&Array.isArray(r.entries))?r.entries:[];}const c=Date.now()-(14*24*60*60*1000);const k=e.filter(x=>x&&x.ts&&x.ts>c&&!newUrls.has(x.url));const a=Array.from(newUrls).map(u=>({url:u,ts:Date.now()}));fs.writeFileSync(SEEN_URLS_PATH,JSON.stringify({lastUpdated:new Date().toISOString(),entries:[...k,...a]},null,2));}catch(e){console.log('saveSeenUrls error:',e.message);}}
function loadTopPicks(){try{if(!fs.existsSync(TOP_PICKS_PATH))return[];const r=JSON.parse(fs.readFileSync(TOP_PICKS_PATH,'utf8'));return Array.isArray(r.picks)?r.picks:[];}catch{return[];}}
function saveTopPicks(jobs){if(!jobs||!jobs.length)return;fs.writeFileSync(TOP_PICKS_PATH,JSON.stringify({picks:jobs.slice(0,5)},null,2));}

// RESUME KEYWORDS
const KW=['partner','partnership','partnerships','alliance','alliances','reseller','channel','co-marketing','partner ecosystem','partner enablement','go-to-market','gtm','revenue operations','pipeline','deal velocity','business development','crm','hr tech','hrtech','hcm','peo','professional employer','payroll','compliance','workforce solutions','employer services','background screening','unemployment','hris','cross-functional','scalable','workflow automation','pricing architecture','contracting','kpi','qbr','partner success','integration','operationaliz','vice president','director','head of partnerships','head of alliances','head of channel','senior director'];

// HARD DISQUALIFIERS
const DQ=['healthcare experience required','medical device','clinical experience required','hospital experience','pharmaceutical experience','biotech','life sciences required','electronic health record','nursing','physician required','cloud infrastructure required','aws required','azure required','devops experience required','kubernetes required','software engineering background','engineering degree required','computer science degree required','programming experience required','investment banking','private equity experience','hedge fund','banking experience required','legal experience required','bar exam','attorney required','j.d. required','government clearance required','security clearance required','manufacturing experience required','real estate license required'];

// INDUSTRY SCORING
const IND=[
  {p:['peo','professional employer','background screening','background check','employer services','unemployment cost','workforce solutions','i-9','e-verify','first advantage','sterling check','cccverify','hireright'],s:30},
  {p:['hr tech','hrtech','human resources technology','hcm','payroll platform','workforce management','hris','benefits administration','talent management','compliance technology','hr software','hr saas'],s:22},
  {p:['saas','b2b software','enterprise software','fintech','partner ecosystem','employment platform'],s:15},
  {p:['software','technology','platform','cloud'],s:8}
];

function parseSal(t){if(!t)return null;const c=(t||'').replace(/,/g,'').toLowerCase();const m=c.match(/\$?(\d+)k?/g);if(!m)return null;const n=m.map(x=>{const v=parseFloat(x.replace(/[$k]/g,''));return x.includes('k')||v<1000?v*1000:v;}).filter(v=>v>=30000&&v<=2000000);if(!n.length)return null;return{min:Math.min(...n),max:Math.max(...n)};}
function scoreSal(sal,snip){const p=parseSal(sal)||parseSal(snip);if(!p)return 5;if(p.max<80000)return 0;if(p.min>=150000)return 20;if(p.min>=120000)return 17;if(p.min>=100000)return 14;if(p.min>=80000)return 10;return 5;}

function score(job){
  const ti=(job.title||'').toLowerCase(),sn=(job.snippet||'').toLowerCase(),tx=ti+' '+sn;
  for(const d of DQ)if(tx.includes(d))return{score:0,tier:'DQ',skip:true,rank:{total:0}};
  let is=0,il='General';
  for(const{p,s}of IND){if(p.some(x=>tx.includes(x))){is=s;il=s===30?'HR Tech/PEO':s===22?'HR SaaS':s===15?'B2B SaaS':'Tech';break;}}
  const mk=KW.filter(k=>tx.includes(k));
  const ks=Math.min(20,Math.round(mk.length*3*0.4));
  const ts=/\bvp\b|vice.?pres/.test(ti)?25:/senior.?director/.test(ti)?23:/\bdirector\b/.test(ti)?20:/head.?of/.test(ti)?20:/senior.?manager/.test(ti)?12:8;
  const cs=Math.min(12,Math.round(scoreSal(job.salary,sn)*0.6));
  const tot=Math.min(100,is+ts+ks+cs);
  const tier=tot>=80?'🔥 Must Apply':tot>=65?'⭐ Strong Match':tot>=50?'👍 Good Fit':'👀 Worth a Look';
  return{score:tot,tier,industry:il,rank:{total:tot,breakdown:{industry:{score:is,max:30},title:{score:ts,max:25},keywords:{score:ks,max:20,matchRate:Math.round(mk.length/KW.length*100),totalHits:mk.length,totalKeywords:KW.length,usedFullDesc:sn.length>200,topMatches:mk.slice(0,8)},comp:{score:cs,max:12}}}};
}

const TITLE_OK=/\bvp\b|vice.?pres|(?:senior\s+)?director|head\s+of|chief|senior\s+manager/i;
const FUNC_OK=/partner|alliance|channel|reseller|customer.?success|revenue.?ops|revops|business.?dev|gtm|go.to.market|account.?executive|sales.?director|sales.?manager|account.?manager|hcm|payroll.?sales|payroll.?manager|payroll.?director|workforce.?sales/i;
const REJECT=/\bengineer\b|\bdeveloper\b|\bdevops\b|data.?scientist|\bdesigner\b|product.?manager|product.?marketing|field.?marketing|partner.?marketing|\bmedia\b|demand.?gen|social.?media|\bcontent\b|\bseo\b|accountant|\bfinance\b|\blegal\b|\brecruiter\b|talent.?acquisition|it.?director|infrastructure|technical.?account|associate.?customer|supply.?chain/i;
const FL=['stuart','port st. lucie','port saint lucie','fort pierce','vero beach','jupiter','palm beach gardens','west palm beach','lake worth','boynton beach','hobe sound','jensen beach','palm city','boca raton','delray beach','florida',', fl'];

function ok(job){const t=job.title||'';return TITLE_OK.test(t)&&FUNC_OK.test(t)&&!REJECT.test(t);}
function remote(job){const l=(job.location||'').toLowerCase(),w=(job.workType||'').toLowerCase(),s=(job.snippet||'').toLowerCase();if(w==='remote'||l.includes('remote'))return true;if(s.includes('fully remote')||s.includes('100% remote')||s.includes('remote position')||s.includes('remote-first')||s.includes('work from anywhere'))return true;if(FL.some(c=>l.includes(c)))return true;if((job.source==='Greenhouse'||job.source==='Lever')&&(l==='united states'||l===''||l==='usa'||l==='north america'))return true;return false;}

// GREENHOUSE API
async function fetchGreenhouse(){
  const cos=['rippling','gusto','justworks','trinet','bamboohr','namely','paycor','paylocity','paycom','isolved','ceridian','ukg','dayforce','adp','leapsome','lattice','hibob','cultureamp','15five','personio','factorial','betterworks','cornerstone','remote','oysterhr','papayaglobal','velocityglobal','deel','multiplier','horizons','remofirst','omnipresent','safeguardglobal','insperity','oasis','checkr','firstadvantage','sterlingcheck','accurate','veriff','truework','hireright','experian','equifax','partnerstack','crossbeam','impartner','tackle','cleverbridge','allbound','workato','boomi','zapier','celigo','impact','partnerize','everflow','salesloft','outreach','gong','clari','mindtickle','highspot','seismic','gainsight','totango','churnzero','planhat','clientsuccess','vitally','hubspot','zendesk','freshworks','intercom','drift','qualified','navan','expensify','brex','ramp','airbase','fivetran','hightouch','census','segment','amplitude','vanta','drata','secureframe','thoropass','businessolver','benefitfocus','bennie','guideline','vestwell','sana-benefits','ease','benefitmall','wonolo','instawork','workrise','cornerstone','docebo','trainual','workramp','mineral'];
  const RE=/partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|account.?executive|sales.?manager|sales.?director|vp\b|vice.?pres|director|head.?of|senior.?manager/i;
  const jobs=[];
  for(const co of cos){try{const r=await fetch(`https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`,{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;const d=await r.json();const rel=(d.jobs||[]).filter(j=>RE.test(j.title));for(const j of rel){const loc=(j.location?.name||'').toLowerCase();const content=clean(j.content||'');const isR=loc.includes('remote')||content.toLowerCase().includes('remote')||loc==='united states'||loc===''||loc==='usa'||loc==='north america';if(!isR)continue;jobs.push({title:j.title,company:co.charAt(0).toUpperCase()+co.slice(1),location:loc.includes('remote')?'Remote':'United States',workType:'Remote',salary:'Not Listed',posted:j.updated_at?new Date(j.updated_at).toLocaleDateString():'Recent',url:j.absolute_url,source:'Greenhouse',verified:true,snippet:content.substring(0,500)});}if(rel.length)console.log(`   ✅ GH ${co}: ${rel.length}`);}catch(e){}}
  return jobs;
}

// LEVER API
async function fetchLever(){
  const cos=['rippling','gusto','justworks','bamboohr','namely','paycor','paylocity','isolved','leapsome','lattice','hibob','cultureamp','15five','personio','factorial','betterworks','remote','oysterhr','deel','papayaglobal','velocityglobal','multiplier','remofirst','omnipresent','insperity','checkr','firstadvantage','sterlingcheck','accurate','veriff','truework','hireright','partnerstack','crossbeam','impartner','tackle','impact','partnerize','everflow','allbound','workato','boomi','zapier','celigo','salesloft','outreach','gong','clari','mindtickle','highspot','seismic','gainsight','totango','churnzero','planhat','vitally','hubspot','zendesk','freshworks','intercom','drift','qualified','navan','expensify','brex','ramp','airbase','fivetran','hightouch','vanta','drata','secureframe','servicenow','salesforce','experian','mineral','wonolo','instawork','workrise','cornerstone','docebo','trainual','workramp'];
  const RE=/partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|account.?executive|sales.?manager|sales.?director|vp\b|vice.?pres|director|head.?of|senior.?manager/i;
  const jobs=[];
  for(const co of cos){try{const r=await fetch(`https://api.lever.co/v0/postings/${co}?mode=json&state=published`,{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;const data=await r.json();const rel=(Array.isArray(data)?data:[]).filter(j=>RE.test(j.text));for(const j of rel){const loc=(j.categories?.location||'').toLowerCase();const desc=(j.descriptionPlain||'');const isR=loc.includes('remote')||desc.toLowerCase().includes('remote')||loc===''||loc==='united states';if(!isR)continue;jobs.push({title:j.text,company:co.charAt(0).toUpperCase()+co.slice(1),location:loc.includes('remote')?'Remote':'United States',workType:'Remote',salary:'Not Listed',posted:j.createdAt?new Date(j.createdAt).toLocaleDateString():'Recent',url:j.hostedUrl,source:'Lever',verified:true,snippet:desc.substring(0,500)});}if(rel.length)console.log(`   ✅ LV ${co}: ${rel.length}`);}catch(e){}}
  return jobs;
}

// ISOLVED HIRE - Regional payroll/HR/PEO companies
async function fetchIsolvedHire(){
  const cos=[{name:'MP Wired for HR',slug:'masspay'},{name:'Payroll Network',slug:'payrollnetwork'},{name:'Paragon HCM',slug:'paragonhcm'},{name:'Apex HCM',slug:'apexhcm'},{name:'Proliant',slug:'proliant'},{name:'GenesisHR',slug:'genesishr'},{name:'FrankCrum',slug:'frankcrum'},{name:'CoAdvantage',slug:'coadvantage'},{name:'Questco',slug:'questco'},{name:'PrestigePEO',slug:'prestigepeo'},{name:'Infiniti HR',slug:'infinithr'},{name:'Extensis',slug:'extensis'},{name:'ConnectPay',slug:'connectpayonline'},{name:'Ovation Payroll',slug:'ovationpayroll'},{name:'Heartland Payroll',slug:'heartlandpayroll'},{name:'National PEO',slug:'nationalpeo'},{name:'Alcott HR',slug:'alcotthr'},{name:'HR Works',slug:'hrworks'},{name:'Tesseon',slug:'tesseon'},{name:'Engage PEO',slug:'engagepeo'},{name:'Tandem HR',slug:'tandemhr'},{name:'Abel HR',slug:'abelhr'},{name:'GTM Payroll',slug:'gtmpayroll'},{name:'Group Management Services',slug:'groupmanagement'},{name:'Oasis Outsourcing',slug:'oasis'},{name:'PayNW',slug:'paynw'},{name:'Payroll Solutions',slug:'payrollsolutionshcm'},{name:'Asure Software',slug:'asuresoftware'},{name:'BenefitMall',slug:'benefitmall'},{name:'SyncHR',slug:'synchr'},{name:'isolved',slug:'isolved'},{name:'Payday HCM',slug:'paydayhcm'}];
  const RE=/partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|account.?executive|sales.?manager|sales.?director|vp\b|vice.?pres|director|head.?of|senior.?manager/i;
  const jobs=[];
  for(const co of cos){try{const r=await fetch(`https://${co.slug}.isolvedhire.com/jobs/getListings`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json,text/html'},body:'keywords=&isInternal=0&showPayFrequency=1&showLocation=1&showEmploymentType=1',signal:AbortSignal.timeout(8000)});if(!r.ok)continue;let data;try{data=await r.json();}catch{continue;}const listings=data.data||data.jobs||(Array.isArray(data)?data:[]);const rel=listings.filter(j=>RE.test(j.title||j.name||''));for(const j of rel){const title=j.title||j.name||'';const loc=(j.city?j.city+', '+(j.state_abbreviation||''):j.location||'').toLowerCase();const sal=j.pay_minimum&&j.pay_maximum?`$${j.pay_minimum} - $${j.pay_maximum}`:'Not Listed';jobs.push({title,company:co.name,location:'Remote',workType:'Remote',salary:sal,posted:j.date_posted?new Date(j.date_posted).toLocaleDateString():'Recent',url:`https://${co.slug}.isolvedhire.com/jobs/${j.id}.html`,source:'iSolvedHire',verified:false,snippet:clean(j.short_description||j.description||'').substring(0,400)});}if(rel.length)console.log(`   ✅ iSolved ${co.name}: ${rel.length}`);}catch(e){}}
  return jobs;
}

// WORKDAY API - Major payroll/PEO companies
async function fetchWorkday(){
  const cos=[{name:'ADP',slug:'adp',n:'5'},{name:'Paychex',slug:'paychex',n:'5'},{name:'UKG',slug:'ukg',n:'5'},{name:'Ceridian',slug:'ceridian',n:'5'},{name:'Insperity',slug:'insperity',n:'5'},{name:'TriNet',slug:'trinet',n:'5'},{name:'Paycor',slug:'paycor',n:'5'},{name:'Paylocity',slug:'paylocity',n:'5'},{name:'Paycom',slug:'paycom',n:'5'},{name:'CoAdvantage',slug:'coadvantage',n:'5'},{name:'Vensure',slug:'vensure',n:'5'},{name:'PrismHR',slug:'prismhr',n:'5'},{name:'Alight Solutions',slug:'alight',n:'5'},{name:'Conduent',slug:'conduent',n:'5'},{name:'Mercer',slug:'mercer',n:'5'},{name:'Greenshades',slug:'greenshades',n:'5'}];
  const RE=/partner|alliance|channel|reseller|business.?dev|revenue.?ops|customer.?success|account.?executive|sales.?manager|sales.?director|vp\b|vice.?pres|director|head.?of/i;
  const jobs=[];
  for(const co of cos){for(const n of['5','1','3']){try{const url=`https://${co.slug}.wd${n}.myworkdayjobs.com/wday/cxs/${co.slug}/jobs`;const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({appliedFacets:{},limit:20,offset:0,searchText:'partnerships director vp alliance channel sales'}),signal:AbortSignal.timeout(8000)});if(!r.ok)continue;const d=await r.json();const rel=(d.jobPostings||[]).filter(j=>RE.test(j.title||''));for(const j of rel){const loc=(j.locationsText||'').toLowerCase();if(loc&&!loc.includes('remote')&&!loc.includes('united states')&&loc!=='')continue;jobs.push({title:j.title,company:co.name,location:loc.includes('remote')?'Remote':'United States',workType:'Remote',salary:'Not Listed',posted:'Recent',url:`https://${co.slug}.wd${n}.myworkdayjobs.com/en-US/${co.slug}job/${j.externalPath||''}`,source:'Workday',verified:true,snippet:clean(j.jobDescription||j.briefDescription||'').substring(0,400)});}if(rel.length){console.log(`   ✅ Workday ${co.name}: ${rel.length}`);break;}break;}catch(e){}}}
  return jobs;
}

// REMOTIVE
async function fetchRemotive(){
  const jobs=[];
  const qs=['partnerships director','alliances vp','channel director','customer success vp','revenue operations director','business development director','hcm account executive','payroll sales'];
  for(const q of qs){try{const r=await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=20`,{signal:AbortSignal.timeout(10000)});if(!r.ok)continue;const d=await r.json();for(const j of(d.jobs||[]))jobs.push({title:j.title,company:j.company_name,location:'Remote',workType:'Remote',salary:j.salary||'Not Listed',posted:j.publication_date?new Date(j.publication_date).toLocaleDateString():'Recent',url:j.url,source:'Remotive',snippet:clean(j.description||'').substring(0,500)});if((d.jobs||[]).length)console.log(`   ✅ Remotive "${q}": ${(d.jobs||[]).length}`);}catch(e){console.log(`   ❌ Remotive "${q}": ${e.message}`);}}
  return jobs;
}

// WWR
async function fetchWWR(){
  const jobs=[];
  for(const cat of['executive','sales','business']){try{const r=await fetch(`https://weworkremotely.com/categories/remote-${cat}-jobs.rss`,{signal:AbortSignal.timeout(10000)});if(!r.ok)continue;const xml=await r.text();const items=xml.match(/<item>([\s\S]*?)<\/item>/g)||[];for(const item of items){const t=((item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)||[])[1]||'').replace(/^[^:]+:\s*/,'');const co=((item.match(/<company><!\[CDATA\[(.*?)\]\]><\/company>/)||[])[1]||'');const lk=((item.match(/<link>(.*?)<\/link>/)||[])[1]||'');const desc=clean(((item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)||[])[1]||''));if(t)jobs.push({title:t,company:co,location:'Remote',workType:'Remote',salary:'Not Listed',posted:'Recent',url:lk.startsWith('http')?lk:`https://weworkremotely.com${lk}`,source:'WWR',snippet:desc.substring(0,500)});}if(items.length)console.log(`   ✅ WWR ${cat}: ${items.length}`);}catch(e){console.log(`   ❌ WWR ${cat}: ${e.message}`);}}
  return jobs;
}

async function main(){
  const dateStr=new Date().toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',year:'numeric',month:'long',day:'numeric'});
  console.log('='.repeat(60));console.log('NICK STEPHEN JOB SEARCH v15');console.log(`DATE: ${dateStr}`);console.log('='.repeat(60));
  if(!fs.existsSync(RESULTS_DIR))fs.mkdirSync(RESULTS_DIR,{recursive:true});
  if(!fs.existsSync(DOCS_RESULTS_DIR))fs.mkdirSync(DOCS_RESULTS_DIR,{recursive:true});
  const seenUrls=loadSeenUrls();
  const prevPicks=loadTopPicks();
  const isBulk=seenUrls.size===0;
  console.log(`\nSeen: ${seenUrls.size} | ${isBulk?'🗂️ BULK RUN':'Daily'} | Prev picks: ${prevPicks.length}`);
  console.log('\n📡 Fetching from all sources...');
  const [ghJobs,lvJobs,isJobs,wdJobs,rmJobs,wwJobs]=await Promise.all([fetchGreenhouse(),fetchLever(),fetchIsolvedHire(),fetchWorkday(),fetchRemotive(),fetchWWR()]);
  const all=[...ghJobs,...lvJobs,...isJobs,...wdJobs,...rmJobs,...wwJobs];
  console.log(`\n📊 Raw: ${all.length}`);
  const urlSet=new Set(),tcSet=new Set();
  const deduped=all.filter(j=>{if(!j.url||urlSet.has(j.url))return false;urlSet.add(j.url);const k=(j.title+'|'+j.company).toLowerCase().replace(/\s+/g,'');if(tcSet.has(k))return false;tcSet.add(k);return true;});
  console.log(`📊 Deduped: ${deduped.length}`);
  const qualified=deduped.filter(j=>{if(!ok(j))return false;if(!remote(j)){console.log(`   📍 ${j.title} @ ${j.company} (${j.location})`);return false;}return true;});
  console.log(`✅ Qualified: ${qualified.length}`);
  const newJobs=isBulk?qualified:qualified.filter(j=>!seenUrls.has(j.url));
  console.log(`🆕 ${isBulk?'Bulk':'New'}: ${newJobs.length}`);
  const scored=[];let dq=0;
  for(const j of newJobs){const s=score(j);if(s.skip){console.log(`   🚫 DQ: ${j.title} @ ${j.company}`);dq++;continue;}scored.push({...j,score:s.score,tier:s.tier,industry:s.industry||'',rank:s.rank});}
  scored.sort((a,b)=>b.score-a.score);
  console.log(`\n   🔥 Must Apply (80+): ${scored.filter(j=>j.score>=80).length}`);
  console.log(`   ⭐ Strong Match (65+): ${scored.filter(j=>j.score>=65&&j.score<80).length}`);
  console.log(`   👍 Good Fit (50+): ${scored.filter(j=>j.score>=50&&j.score<65).length}`);
  console.log(`   👀 Worth a Look: ${scored.filter(j=>j.score<50).length}`);
  console.log(`   🚫 DQ: ${dq}`);
  if(scored.length){console.log('\n🏆 Top 5:');scored.slice(0,5).forEach((j,i)=>console.log(`   ${i+1}. [${j.score}] ${j.title} @ ${j.company}`));}
  const nu=new Set(scored.map(j=>j.url));
  saveSeenUrls(seenUrls,nu);
  const picks=scored.filter(j=>j.score>=65).slice(0,5);
  if(scored.length)saveTopPicks(picks.length?picks:scored.slice(0,3));
  const out={date:dateStr,count:scored.length,jobs:scored,topPicks:prevPicks,currentTopPicks:picks};
  fs.writeFileSync(TODAY_PATH,JSON.stringify(out,null,2));
  fs.writeFileSync(DOCS_TODAY_PATH,JSON.stringify(out,null,2));
  console.log(`\n✅ Done! ${scored.length} jobs saved.`);
}
main().catch(err=>{console.error('Fatal:',err.message);if(!fs.existsSync(RESULTS_DIR))fs.mkdirSync(RESULTS_DIR,{recursive:true});fs.writeFileSync(TODAY_PATH,JSON.stringify({date:new Date().toLocaleDateString(),count:0,jobs:[],topPicks:[],error:err.message},null,2));process.exit(1);});
