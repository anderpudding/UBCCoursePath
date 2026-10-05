export const FRESHNESS_MS = 5 * 60 * 1000;
export function courseKey(c) { return `${c.campus}:${c.subject}:${c.code}`; }
export function freshness(section, now = Date.now(), mode = 'approved') {
  if (mode === 'demo') return {state:'example', label:'Example seats'};
  const timestamp = Date.parse(section.sourceObservedAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return {state:'unknown', label:'Freshness unknown'};
  const age = now - timestamp;
  return {state: age <= FRESHNESS_MS ? 'current' : 'stale', label: age <= FRESHNESS_MS ? 'Checked within 5 minutes' : 'Out of date', age};
}
export function overlaps(a,b) {
  // Meeting patterns include effective date ranges, so alternate half-term classes can coexist.
  if (a.startDate && b.endDate && a.startDate > b.endDate) return false;
  if (b.startDate && a.endDate && b.startDate > a.endDate) return false;
  return a.days.some(d => b.days.includes(d)) && a.start < b.end && b.start < a.end;
}
export function compatibleSections(sections) {
  for(let i=0;i<sections.length;i++) for(let j=i+1;j<sections.length;j++) {
    const a=sections[i], b=sections[j];
    if (a.compatibleWith && !a.compatibleWith.includes(b.id)) return false;
    if (b.compatibleWith && !b.compatibleWith.includes(a.id)) return false;
    if(a.meetings.some(x => b.meetings.some(y=>overlaps(x,y)))) return false;
  }
  return true;
}
export function bundles(course, locks = [], budget = {remaining:200000}) {
  const out=[];
  if(locks.some(id=>!course.sections.some(s=>s.id===id))) return out;
  const groups=course.requiredComponents.map(type=>course.sections.filter(s=>s.component===type && s.status!=='cancelled' && (s.meetings.length>0||s.asynchronous===true) && (!locks.some(id=>course.sections.find(x=>x.id===id)?.component===type) || locks.includes(s.id))));
  if(locks.some(id=>!course.requiredComponents.includes(course.sections.find(s=>s.id===id)?.component))) return out;
  function walk(i,chosen) {
    if(--budget.remaining<0) return;
    if(i===groups.length) {out.push(chosen); return;}
    for(const s of groups[i]) if(compatibleSections([...chosen,s])) walk(i+1,[...chosen,s]);
  }
  walk(0,[]);return out;
}
const clock=n=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n<720?'am':'pm'}`;
const SEARCH_LIMIT='Reached the search limit before finding a timetable. Lock a section or two, or plan fewer courses, then generate again.';
function misses(m,{blocked,earliest,latest}) {
  const out=[];
  if(m.start<earliest) out.push('early');
  if(m.end>latest) out.push('late');
  const block=blocked.find(x=>overlaps(m,x));
  if(block) out.push(`block:${block.label||'Busy'}`);
  return out;
}
function explain(course,all,locked,options) {
  const name=`${course.subject} ${course.code}`;
  if(!all.length) return locked
    ? `${name}: the sections you locked can't be taken together, or one is no longer offered. Unlock a section, then generate again.`
    : `${name} has no complete set of open sections with published times. Remove it from your plan or choose another term.`;
  const sets=all.map(b=>new Set(b.flatMap(s=>s.meetings.flatMap(m=>misses(m,options)))));
  const shared=[...sets[0]].filter(x=>sets.every(set=>set.has(x)));
  const reasons=shared.length?shared:[...new Set(sets.flatMap(set=>[...set]))];
  const join=words=>words.length>1?`${words.slice(0,-1).join(', ')} and ${words.at(-1)}`:words[0];
  if(shared.length) return `${name} can't fit: every option ${join(reasons.map(r=>r==='early'?`starts before ${clock(options.earliest)}`:r==='late'?`ends after ${clock(options.latest)}`:`overlaps your blocked time “${r.slice(6)}”`))}. ${reasons.length>1?'Change one of these settings':reasons[0]==='early'?'Set “Start after” earlier':reasons[0]==='late'?'Set “Finish by” later':'Edit that blocked time'}, or remove the course.`;
  return `${name} can't fit: no option works with your ${join(reasons.map(r=>r==='early'?`${clock(options.earliest)} start`:r==='late'?`${clock(options.latest)} finish`:`blocked time “${r.slice(6)}”`))} together. Loosen one of these or remove the course.`;
}
export function solve(courses, {locks={},blocked=[],earliest=480,latest=1260,limit=200000}={}) {
  const budget={remaining:limit},options={blocked,earliest,latest};
  const candidates=courses.map(c=>{const locked=locks[courseKey(c)]||[],all=bundles(c,locked,budget);return {key:courseKey(c),course:c,locked:locked.length>0,all,choices:all.filter(b=>b.every(s=>s.meetings.every(m=>!misses(m,options).length)))};});
  if(budget.remaining<0) return {ok:false,reason:SEARCH_LIMIT};
  const stuck=candidates.find(x=>!x.choices.length);
  if(stuck) return {ok:false,reason:explain(stuck.course,stuck.all,stuck.locked,options)};
  candidates.sort((a,b)=>a.choices.length-b.choices.length);
  let answer=null;
  function search(i,selected,meetings) {
    if(--budget.remaining<0||answer) return;
    if(i===candidates.length) {answer=selected;return;}
    const c=candidates[i];
    for(const b of c.choices) {
      const next=b.flatMap(s=>s.meetings);
      if(next.some(m=>meetings.some(x=>overlaps(m,x)))) continue;
      search(i+1,{...selected,[c.key]:b.map(s=>s.id)},[...meetings,...next]);
    }
  }
  search(0,{},[]);
  return answer ? {ok:true,selection:answer} : {ok:false,reason:budget.remaining<0?SEARCH_LIMIT:`Each course fits on its own, but no combination of all ${courses.length} avoids overlapping classes. Unlock a section or remove a course, then generate again.`};
}
export function validatePlan(courses, selection, blocked=[], earliest=480, latest=1260) {
  const errors=[]; const all=[];
  for(const c of courses) {
    const ids=selection[courseKey(c)]||[];
    const selected=ids.map(id=>c.sections.find(s=>s.id===id));
    if(selected.some(s=>!s)||selected.some(s=>s.status==='cancelled')) {errors.push(`${c.subject} ${c.code}: a section in your plan was changed or cancelled. Generate again to pick a replacement.`);continue;}
    if(selected.some(s=>!s.meetings.length&&s.asynchronous!==true)) errors.push(`${c.subject} ${c.code}: a chosen section has no published meeting times yet.`);
    if(ids.length!==c.requiredComponents.length || c.requiredComponents.some(type=>selected.filter(s=>s.component===type).length!==1) || !compatibleSections(selected)) errors.push(`${c.subject} ${c.code}: the chosen sections don't make a complete set. Pick one ${c.requiredComponents.join(', ')} that go together, or generate again.`);
    for(const s of selected) for(const m of s.meetings) {
      for(const miss of misses(m,{blocked,earliest,latest})) errors.push(`${c.subject} ${c.code} ${s.component} ${s.label} ${miss==='early'?`starts before ${clock(earliest)}`:miss==='late'?`ends after ${clock(latest)}`:`overlaps your blocked time “${miss.slice(6)}”`}.`);
      if(all.some(x=>overlaps(m,x))) errors.push(`${c.subject} ${c.code} ${s.component} ${s.label} overlaps another class in your plan.`);
      all.push(m);
    }
  }
  return [...new Set(errors)];
}
export function normalizeFeed(raw) {
  if(!raw||raw.campus!=='UBCV'||!raw.source?.name||!Array.isArray(raw.terms)||!raw.terms.length) throw Error('Feed must include UBCV, source.name, and terms.');
  const termIds=new Set();
  for(const term of raw.terms) {
    if(!/^[A-Za-z0-9-]{1,40}$/.test(term.id)||termIds.has(term.id)||typeof term.label!=='string'||!Array.isArray(term.courses)) throw Error('Invalid or duplicate term.');
    termIds.add(term.id);const keys=new Set();const sectionIds=new Set();
    for(const c of term.courses) {
      if(c.campus!=='UBCV'||typeof c.subject!=='string'||!/^[A-Z]{2,4}$/.test(c.subject)||typeof c.code!=='string'||!/^\d{3}[A-Z]?$/.test(c.code)||typeof c.title!=='string'||!Number.isFinite(c.credits)||c.credits<=0||!Array.isArray(c.sections)||!Array.isArray(c.requiredComponents)||!c.requiredComponents.length||c.requiredComponents.some(t=>typeof t!=='string'||!t.length)||new Set(c.requiredComponents).size!==c.requiredComponents.length) throw Error('Invalid course or components.');
      if(keys.has(courseKey(c))) throw Error('Duplicate course.'); keys.add(courseKey(c));
      const local=new Set(c.sections.map(s=>s.id));
      for(const s of c.sections) {
        if(typeof s.id!=='string'||!s.id||sectionIds.has(s.id)||typeof s.label!=='string'||!c.requiredComponents.includes(s.component)||!['open','waitlist','closed','cancelled'].includes(s.status)||!Array.isArray(s.meetings)) throw Error('Invalid or duplicate section.');
        sectionIds.add(s.id);
        if(s.compatibleWith && (!Array.isArray(s.compatibleWith)||s.compatibleWith.some(id=>!local.has(id)))) throw Error('Unknown compatible section.');
        for(const field of ['enrolled','capacity','waitlisted','waitlistCapacity']) if(s[field]!=null&&(!Number.isInteger(s[field])||s[field]<0)) throw Error('Invalid seat count.');
        if(s.sourceObservedAt!=null&&(typeof s.sourceObservedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s.sourceObservedAt)||!Number.isFinite(Date.parse(s.sourceObservedAt)))) throw Error('Invalid source timestamp.');
        for(const m of s.meetings) {
          if(!Array.isArray(m.days)||!m.days.length||m.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<0||m.start>=m.end||m.end>1440) throw Error('Invalid meeting.');
          const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
          if((m.startDate||m.endDate)&&(!validDate(m.startDate)||!validDate(m.endDate)||m.startDate>m.endDate)) throw Error('Invalid meeting date range.');
        }
      }
      if(c.requiredComponents.some(type=>!c.sections.some(s=>s.component===type))) throw Error('Missing required component.');
    }
  }
  return raw;
}
export function normalizeGrades(rows,{campus,subject,code,session}) {
  if(!Array.isArray(rows)) throw Error('Unexpected grade response.');
  return rows.filter(r=>r.campus===campus&&r.subject===subject&&`${r.course}${r.detail||''}`===code&&`${r.year}${r.session}`===session).map(r=>({section:r.section,session,average:Number.isFinite(r.average)?r.average:null,reported:Number.isFinite(r.reported)?r.reported:null,educators:r.educators||null,grades:r.grades||{}}));
}
