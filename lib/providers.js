import { readFile } from 'node:fs/promises';
import {normalizeFeed,normalizeGrades} from './core.js';
import {demoFeed} from './demo.js';
const API='https://ubcgrades.com/api/v3';
export async function fetchJSON(url,{token,timeout=12000}={}) {
  const response=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},redirect:'error'});
  if(response.status===404) return null;
  if(!response.ok) throw Error(`Data provider returned HTTP ${response.status}.`);
  const content=await response.text();
  if(content.length>20_000_000) throw Error('Provider response is too large.');
  return JSON.parse(content);
}
export function createCourseProvider({url,approved=false,token,refreshMs=60000,fetcher=fetchJSON}={}) {
  let last=null,fetchedAt=null,error=null,pending=null,nextAttempt=0;
  async function get(force=false) {
    if(!url) return {mode:'demo',feed:demoFeed,fetchedAt:null,error:null};
    if(!approved) throw Error('Course feed is configured but redistribution and caching approval have not been confirmed.');
    if(!/^https:\/\//.test(url)) throw Error('The shared feed must use HTTPS.');
    if(pending) return pending;
    if(!force&&Date.now()<nextAttempt) return snapshot();
    pending=(async()=>{
      try{last=normalizeFeed(await fetcher(url,{token}));fetchedAt=new Date().toISOString();error=null;}
      catch(e){error='Course provider unavailable or returned an invalid feed. Last validated snapshot retained.';console.error('Course feed refresh failed:',e.message);}
      finally{pending=null;nextAttempt=Date.now()+Math.max(1000,refreshMs);}
      return snapshot();
    })();return pending;
  }
  function snapshot(){
    if(!last) throw Error('No validated course snapshot is available. Check the configured provider.');
    return {mode:'approved',feed:last,fetchedAt,error};
  }
  return {get};
}
export function createGradeProvider({fetcher=fetchJSON,cacheMs=86400000,snapshots=new Map()}={}) {
  const cache=new Map();const inflight=new Map();let sessionsCache=null;
  let active=0;const queue=[];
  async function limitedFetch(url){
    if(active>=3) await new Promise(resolve=>queue.push(resolve));
    active++;
    try{return await fetcher(url);}finally{active--;queue.shift()?.();}
  }
  async function sessions(){
    if(sessionsCache&&Date.now()-sessionsCache.time<cacheMs) return sessionsCache.data;
    const rows=await limitedFetch(`${API}/yearsessions/UBCV`);
    if(!Array.isArray(rows)) throw Error('Unexpected yearsession response.');
    const values=rows.map(r=>typeof r==='string'?r:r.yearsession).filter(s=>/^\d{4}[WS]$/.test(s));
    if(!values.length) throw Error('No grade sessions returned.');
    values.sort((a,b)=>b.localeCompare(a));sessionsCache={time:Date.now(),data:values};return values;
  }
  async function grades(subject,code,session){
    if(!/^[A-Z]{2,4}$/.test(subject)||!/^\d{3}[A-Z]?$/.test(code)||!/^\d{4}[WS]$/.test(session)) throw Error('Invalid grade query.');
    const key=`${subject}/${code}/${session}`;
    if(cache.has(key)&&Date.now()-cache.get(key).time<cacheMs) return cache.get(key).data;
    if(inflight.has(key)) return inflight.get(key);
    const url=`${API}/grades/UBCV/${session}/${subject}/${code}`;
    const task=(async()=>{
      try{
        const rows=await limitedFetch(url);
        const data={rows:normalizeGrades(rows||[],{campus:'UBCV',subject,code,session}),sourceUrl:url,fetchedAt:new Date().toISOString(),cached:false};
        cache.set(key,{time:Date.now(),data});if(cache.size>300) cache.delete(cache.keys().next().value);return data;
      }catch(e){
        const old=cache.get(key)?.data||snapshots.get(key);
        if(old) return {...old,cached:true,error:'Showing previously retrieved grade data. Refresh is unavailable.'};
        throw Error('UBCGrades is unavailable. Try again later.');
      }finally{inflight.delete(key);}
    })();inflight.set(key,task);return task;
  }
  return {grades,sessions};
}
export async function loadGradeSnapshots(){
  try{const values=JSON.parse(await readFile(new URL('../data/grade-snapshots.json',import.meta.url),'utf8'));return new Map(values.map(x=>[`${x.subject}/${x.code}/${x.session}`,x.data]));}catch{return new Map();}
}
