import {fetchJSON} from '../lib/providers.js';
const args=process.argv.slice(2);const value=(flag,otherwise)=>{const i=args.indexOf(flag);return i<0?otherwise:args[i+1];};
const subject=value('--subject','CPSC'),code=value('--code','110'),term=value('--term','1'),session=value('--session','W');
if(!/^[A-Z]{2,4}$/.test(subject)||!/^\d{3}[A-Z]?$/.test(code)||!['1','2'].includes(term)||!['W','S'].includes(session))throw Error('Invalid course, term, or session.');
const url=new URL('https://coursescheduler-api-eight.vercel.app/api/sections');url.search=new URLSearchParams({subject,number:code,term,session,campus:'V'}).toString();
const data=await fetchJSON(url);
if(!Array.isArray(data?.sections))throw Error('Unexpected scheduler response. No integration assumptions made.');
const fields=[...new Set(data.sections.flatMap(s=>Object.keys(s)))].sort();
console.log(JSON.stringify({checkedAt:new Date().toISOString(),endpoint:url.href,sectionCount:data.sections.length,fields,activities:[...new Set(data.sections.map(s=>s.activity))],upstreamSeatFreshnessProven:false,academicYearConfirmed:false,redistributionPermissionConfirmed:false,limits:'A single response establishes endpoint availability only. Confirm field semantics, academic year, coverage, timestamp meanings, and permitted use with the maintainer.'},null,2));
