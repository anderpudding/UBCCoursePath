import {writeFile} from 'node:fs/promises';
import {fetchJSON} from '../lib/providers.js';
import {normalizeGrades} from '../lib/core.js';
const subjects=[['CPSC','110'],['MATH','100'],['DSCI','100'],['CHEM','121'],['ENGL','110'],['CPSC','210'],['MATH','101']];
const snapshots=[];
for(const session of ['2025W','2024W'])for(const [subject,code] of subjects){
  const url=`https://ubcgrades.com/api/v3/grades/UBCV/${session}/${subject}/${code}`;
  try{
    const raw=await fetchJSON(url);const rows=normalizeGrades(raw||[],{campus:'UBCV',subject,code,session});
    snapshots.push({subject,code,session,data:{rows,sourceUrl:url,fetchedAt:new Date().toISOString(),cached:true}});
    console.log(`${subject} ${code} ${session}: ${rows.length} historical reports`);
  }catch(e){console.error(`${subject} ${code} ${session}: ${e.message}`);}
}
if(!snapshots.length)throw Error('No grade data retrieved; existing snapshots preserved.');
await writeFile(new URL('../data/grade-snapshots.json',import.meta.url),JSON.stringify(snapshots,null,2));
console.log('Saved real grade snapshots with retrieval timestamps.');
