import {writeFile} from 'node:fs/promises';
import {fetchJSON} from '../lib/providers.js';
import {normalizeFeed,freshness} from '../lib/core.js';
const args=process.argv.slice(2);const opt=(name,otherwise)=>{const i=args.indexOf(name);return i<0?otherwise:args[i+1];};
const sampleCount=Number(opt('--samples',3));const intervalSeconds=Number(opt('--interval-seconds',60));const output=opt('--output',null);
if(!Number.isInteger(sampleCount)||sampleCount<1||sampleCount>60||!Number.isFinite(intervalSeconds)||intervalSeconds<1)throw Error('Use 1–60 samples and an interval of at least one second.');
if(!process.env.COURSE_FEED_URL||process.env.COURSE_FEED_APPROVED!=='true'){
  console.error('BLOCKED: An approved shared feed is not configured. Live-seat freshness has not been demonstrated. See docs/access-inquiries.md.');process.exit(2);
}
if(!process.env.COURSE_FEED_URL.startsWith('https://'))throw Error('Feed must use HTTPS.');
const report={source:null,targetMinutes:5,observations:[],limits:'This checks supplied timestamps. Provider timestamp semantics, coverage, and permissions must be independently confirmed.'};
for(let i=0;i<sampleCount;i++){
  try{
    const feed=normalizeFeed(await fetchJSON(process.env.COURSE_FEED_URL,{token:process.env.COURSE_FEED_TOKEN}));
    report.source=feed.source;const observedAt=new Date().toISOString();const counts={current:0,stale:0,unknown:0};
    const sections=feed.terms.flatMap(t=>t.courses.flatMap(c=>c.sections));
    for(const s of sections)counts[freshness(s,Date.parse(observedAt),'approved').state]++;
    report.observations.push({observedAt,terms:feed.terms.map(t=>({id:t.id,courses:t.courses.length})),sections:sections.length,...counts});
    console.log(`Sample ${i+1}: ${counts.current} current, ${counts.stale} stale, ${counts.unknown} unknown.`);
  }catch(e){report.observations.push({observedAt:new Date().toISOString(),error:e.message});console.error(`Sample ${i+1}: provider failure.`);}
  if(i+1<sampleCount)await new Promise(resolve=>setTimeout(resolve,intervalSeconds*1000));
}
report.passed=report.observations.every(x=>!x.error&&x.sections>0&&x.stale===0&&x.unknown===0);
if(output)await writeFile(output,JSON.stringify(report,null,2));
console.log(report.passed?'Timestamp checks passed; confirm against Workday before launch.':'Live-seat freshness checks failed.');process.exitCode=report.passed?0:1;
