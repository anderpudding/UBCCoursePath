import {courseKey,freshness,validatePlan,overlaps,bundles} from '/lib/core.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=[['#315cd6','#eaf0ff','#23469c'],['#267d79','#e3f3ed','#1d6561'],['#ad5334','#fbece4','#8d432a'],['#755ca3','#eee8f8','#5b4284'],['#986114','#fff3d9','#785012'],['#a14d79','#f8e9f1','#843b62']];
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],dayNames=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const time=n=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n<720?'am':'pm'}`;
const timeRange=(a,b)=>(a<720)===(b<720)?`${time(a).slice(0,-3)}–${time(b)}`:`${time(a)}–${time(b)}`;
const HOUR=60;
const meetingText=m=>`${m.days.map(d=>days[d]).join(', ')} · ${time(m.start)}–${time(m.end)}`;
const STORAGE='coursepath-plans-v1';
let dataset=null,active=null,filter='all',selected=[],selection={},locks={},blocked=[],earliest=480,latest=1260,gradeRows=[],gradeRequest=0,loadRequest=0,worker=null,busy=false,plans={},preview={},storageError=false,savedAt=null,revealNext=false;
try{const p=JSON.parse(localStorage.getItem(STORAGE)||'{}');if(p&&typeof p==='object'&&!Array.isArray(p))plans=p;}catch{storageError=true;}
async function api(url){
  let r,data;
  try{r=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch(e){throw Error(e.name==='TimeoutError'?'The server took too long to respond.':'Couldn’t reach the Coursepath server. Check your connection.');}
  try{data=await r.json();}catch{throw Error(`The server sent an unexpected response (${r.status}).`);}
  if(!r.ok)throw Error(data.error||`Data could not be loaded (${r.status}).`);return data;
}
function planKey(){return `${dataset.mode}:${dataset.source.name}:${dataset.term.id}`;}
function courses(){return dataset?.term.courses||[];}
function planned(){return courses().filter(c=>selected.includes(courseKey(c)));}
function color(c){const i=courses().findIndex(x=>courseKey(x)===courseKey(c));return palette[Math.max(0,i)%palette.length];}
function setBusy(on){busy=on;for(const id of ['generate','generate-mobile']){$(id).setAttribute('aria-disabled',String(on));$(id).classList.toggle('is-busy',on);}}
function cancelGeneration(){if(worker){worker.terminate();worker=null;}setBusy(false);}
function saveLabel(){$('save-status').textContent=storageError?'Saving unavailable in this browser':savedAt?`Saved on this device · ${time(savedAt.getHours()*60+savedAt.getMinutes())}`:'Saved on this device';}
function renderBlockCount(){const n=blocked.reduce((n,b)=>n+b.days.length,0);$('block-count').textContent=n?`${n} blocked ${n===1?'period':'periods'}`:'';}
function reveal(){const head=document.querySelector('.calendar-heading'),r=$('plan-message').getBoundingClientRect(),bar=$('generate').offsetParent?0:80;if(r.top<0||r.bottom>innerHeight-bar)head.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
function focusGenerate(){($('generate').offsetParent?$('generate'):$('generate-mobile')).focus();}
function save(){
  if(!dataset)return;
  plans[planKey()]={selected,selection,locks,blocked,earliest,latest};
  try{localStorage.setItem(STORAGE,JSON.stringify(plans));storageError=false;savedAt=new Date();}catch{storageError=true;}
  saveLabel();
}
function restore(){
  const p=plans[planKey()];preview={};
  if(!p){selected=[];selection={};locks={};blocked=[];earliest=480;latest=1260;return false;}
  selected=Array.isArray(p.selected)?p.selected.filter(x=>typeof x==='string').slice(0,30):[];
  selection=recordOfArrays(p.selection);locks=recordOfArrays(p.locks);
  blocked=Array.isArray(p.blocked)?p.blocked.filter(b=>b&&Array.isArray(b.days)&&b.days.length&&b.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&Number.isInteger(b.start)&&Number.isInteger(b.end)&&b.start>=0&&b.end<=1440&&b.start<b.end&&typeof b.id==='string'&&typeof b.label==='string').slice(0,50):[];
  earliest=[480,540,600,660,720].includes(p.earliest)?p.earliest:480;latest=[1260,1080,1020,960].includes(p.latest)?p.latest:1260;
  return true;
}
function recordOfArrays(value){return Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([k,v])=>k.startsWith('UBCV:')&&Array.isArray(v)).map(([k,v])=>[k,v.filter(x=>typeof x==='string').slice(0,10)]));}
const tone=t=>t==='info'?'plan-info':t?'plan-success':'plan-warning';
function message(text,ok=false,undo=null){$('plan-message').innerHTML=text?`<p class="${tone(ok)}">${escape(text)}${undo?' <button type="button" class="undo">Undo</button>':''}</p>`:'';if(text&&undo)$('plan-message').querySelector('.undo').onclick=undo;}
function snapshot(){return {term:dataset?.term.id,state:structuredClone({selected,selection,locks,blocked,preview})};}
function undoTo(snap,what){return ()=>{
  if(!dataset||dataset.term.id!==snap.term){message('Undo is no longer available because the term changed.');return;}
  cancelGeneration();({selected,selection,locks,blocked,preview}=structuredClone(snap.state));save();render();validate();$('plan-message').insertAdjacentHTML('afterbegin',`<p class="plan-info">Undid ${escape(what)}.</p>`);focusGenerate();
};}
const schedulable=new WeakMap();
function canSchedule(c){if(!schedulable.has(c))schedulable.set(c,bundles(c).length>0);return schedulable.get(c);}
function meetingIssues(m,others){
  const out=[];
  if(m.start<earliest)out.push(`starts before ${time(earliest)}`);
  if(m.end>latest)out.push(`ends after ${time(latest)}`);
  const b=blocked.find(x=>overlaps(m,x));if(b)out.push(`overlaps blocked time “${b.label}”`);
  const o=others.find(x=>x.m!==m&&overlaps(m,x.m));if(o)out.push(`overlaps ${o.name}`);
  return out;
}
function validate(){
  const missing=selected.filter(k=>!courses().some(c=>courseKey(c)===k));
  const unplaced=planned().filter(c=>!(selection[courseKey(c)]||[]).length);
  const errors=validatePlan(planned().filter(c=>!unplaced.includes(c)),selection,blocked,earliest,latest);
  if(missing.length) errors.unshift('A saved course is no longer offered this term. Remove it from your list, then generate again.');
  const names=unplaced.map(c=>`${c.subject} ${c.code}`),waiting=names.length?`${names.length>1?`${names.slice(0,-1).join(', ')} and ${names.at(-1)} aren't`:`${names[0]} isn't`} in your week yet. Generate schedule to place ${names.length>1?'them':'it'}.`:'';
  const again=errors.length&&!missing.length?' <button type="button" class="inline-action" data-regenerate>Generate again with these settings</button>':'';
  $('plan-message').innerHTML=[...errors.map((e,i)=>`<p class="plan-warning">${escape(e)}${i===errors.length-1?again:''}</p>`),waiting&&`<p class="plan-info">${escape(waiting)}</p>`,!errors.length&&!waiting&&selected.length?`<p class="plan-success">All ${selected.length} ${selected.length>1?'courses fit':'course fits'} with no conflicts.</p>`:''].filter(Boolean).join('');
  $('plan-message').querySelector('[data-regenerate]')?.addEventListener('click',()=>{if(!busy){revealNext=true;generate();}});
  planStatus(planStatusText(errors,names));
  return errors;
}
async function load(term,initial=false){
  const id=++loadRequest;cancelGeneration();$('term').disabled=true;
  try{
    const data=await api(`/api/courses${term?`?term=${encodeURIComponent(term)}`:''}`);if(id!==loadRequest)return;
    const same=dataset&&dataset.term.id===data.term.id&&dataset.mode===data.mode&&dataset.source.name===data.source.name;
    dataset=data;
    $('term').innerHTML=data.terms.map(t=>`<option value="${escape(t.id)}" ${t.id===data.term.id?'selected':''}>${escape(t.label)}</option>`).join('');
    if(!same){const had=restore();active=courses().find(c=>selected.includes(courseKey(c)))||courses()[0]||null;
      if(initial&&!had&&data.mode==='demo'){selected=courses().slice(0,3).map(courseKey);active=courses()[1]||active;}
      render();validate();fetchGrades();if(initial&&!had&&data.mode==='demo')generate();
    }else{active=courses().find(c=>courseKey(c)===courseKey(active||{}))||courses()[0]||null;render();validate();}
    sourceBanner();
  }catch(e){if(id!==loadRequest)return;if(dataset)$('term').value=dataset.term.id;
    const retry=term;const banner=$('source-banner');banner.classList.remove('approved');
    banner.innerHTML=`<span>${dataset?`${dataset.mode==='demo'?'<strong>Example schedule</strong> · Times, instructors, and seats are fictional. ':''}Couldn’t load ${term&&term!==dataset.term.id?'that term':'new course data'}. ${escape(e.message)} You’re still seeing the previous snapshot.`:`<strong>Course data unavailable.</strong> ${escape(e.message)}`}</span><button id="banner-retry">Try again</button>`;
    $('banner-retry').onclick=()=>load(retry,initial);
    if(dataset)validate();else planStatus('Course data is unavailable right now.');}
  finally{if(id===loadRequest)$('term').disabled=false;}
}
function sourceBanner(){
  const banner=$('source-banner');banner.classList.toggle('approved',dataset.mode==='approved'&&!dataset.error);
  const status=dataset.mode==='demo'?'<strong>Example schedule</strong> · Times, instructors, and seats are fictional. Grade history comes from UBCGrades.':`<strong>${escape(dataset.source.name)}</strong> · ${dataset.error?escape(dataset.error):'Seat freshness is checked separately for every section.'}`;
  banner.innerHTML=`<span>${status}</span><button id="banner-data">Data sources</button>`;$('banner-data').onclick=openData;
}
function render(){if(!dataset)return;renderCatalog();renderCalendar();renderDetail();renderRegister();$('earliest').value=earliest;$('latest').value=latest;renderBlockCount();$('course-count').textContent=`${selected.length} in plan`;saveLabel();}
const LIST_LIMIT=40;
function renderCatalog(){
  const was=document.activeElement,keep=was?.closest?.('#course-list')?(was.dataset.add?`[data-add="${CSS.escape(was.dataset.add)}"]`:was.dataset.course?`[data-course="${CSS.escape(was.dataset.course)}"]`:null):null;
  const query=$('search').value.trim().toLowerCase().replace(/\s+/g,' ');
  const visible=courses().filter(c=>(filter!=='selected'||selected.includes(courseKey(c)))&&(`${c.subject} ${c.code} ${c.title}`.toLowerCase().includes(query)||`${c.subject}${c.code}`.toLowerCase().includes(query.replace(/\s/g,''))));
  $('course-list').innerHTML=visible.slice(0,LIST_LIMIT).map(c=>{const key=courseKey(c),added=selected.includes(key);return `<div class="course-item ${active&&courseKey(active)===key?'active':''}"><button class="course-open" data-course="${escape(key)}" aria-label="View ${escape(c.subject+' '+c.code)} details"><span class="course-code"><i class="course-dot" style="background:${color(c)[0]}"></i>${escape(c.subject)} ${escape(c.code)}</span><span class="course-name">${escape(c.title)}</span><span class="course-meta">${escape(c.credits)} credits · ${escape(c.requiredComponents.join(' + '))}</span>${canSchedule(c)?'':'<span class="course-meta course-blocked">No open sections to schedule this term</span>'}</button><button class="add-course ${added?'selected':''}" data-add="${escape(key)}" ${!added&&!canSchedule(c)?'disabled title="No open sections to schedule"':''} aria-label="${added?'Remove':!canSchedule(c)?'Cannot add':'Add'} ${escape(c.subject+' '+c.code)}${!added&&!canSchedule(c)?': no open sections this term':''}">${added?'✓':'+'}</button></div>`;}).join('')||`<p class="no-results">${filter==='selected'&&!query?'No courses in your plan yet. Add some from All courses.':`No courses match “${escape($('search').value.trim())}”. ${dataset?.mode==='demo'?`This example term only includes ${escape([...new Set(courses().map(c=>c.subject))].join(', ').replace(/, ([^,]+)$/,' and $1'))} courses.`:'Search by subject and number, like CPSC 110, or try another term.'}`}</p>`;
  if(visible.length>LIST_LIMIT)$('course-list').insertAdjacentHTML('beforeend',`<p class="no-results">Showing ${LIST_LIMIT} of ${visible.length} courses. Search to narrow the list.</p>`);
  for(const key of selected.filter(k=>!courses().some(c=>courseKey(c)===k))) $('course-list').insertAdjacentHTML('beforeend',`<div class="course-item"><span class="course-name">Unavailable: ${escape(key)}</span><button class="quiet" data-add="${escape(key)}">Remove</button></div>`);
  $('course-list').querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{active=courses().find(c=>courseKey(c)===b.dataset.course);renderCatalog();renderDetail();fetchGrades();});
  $('course-list').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    cancelGeneration();const key=b.dataset.add;
    if(selected.includes(key)){selected=selected.filter(k=>k!==key);delete selection[key];delete locks[key];}
    else{if(selected.length>=15){message('You can plan up to 15 courses at once. Remove one to add another.');return;}selected.push(key);active=courses().find(c=>courseKey(c)===key);}
    save();render();validate();fetchGrades();
  });
  if(keep)$('course-list').querySelector(keep)?.focus();
  return visible.length;
}
function renderCalendar(){
  const scheduled=planned().flatMap(c=>(selection[courseKey(c)]||[]).map(id=>({course:c,section:c.sections.find(s=>s.id===id)})).filter(x=>x.section&&x.section.status!=='cancelled'));
  const meetings=scheduled.flatMap(x=>x.section.meetings);
  const owned=scheduled.flatMap(({course:c,section:s})=>s.meetings.map(m=>({m,name:`${c.subject} ${c.code} ${s.component} ${s.label}`})));
  const end=Math.ceil(Math.max(latest,...meetings.map(m=>m.end),...blocked.map(b=>b.end))/60)*60;const start=Math.floor(Math.min(earliest,...meetings.map(m=>m.start),...blocked.map(b=>b.start))/60)*60;
  const dayCount=[...meetings,...blocked].some(m=>m.days.some(d=>d>4))?7:5;const height=(end-start)/60*HOUR;
  $('day-header').style.gridTemplateColumns=`46px repeat(${dayCount},1fr)`;$('day-header').innerHTML='<span></span>'+days.slice(0,dayCount).map(d=>`<span>${d}</span>`).join('');
  $('week-grid').style.gridTemplateColumns=`repeat(${dayCount},1fr)`;$('week-grid').parentElement.style.height=`${height}px`;
  $('time-labels').innerHTML=Array.from({length:Math.ceil((end-start)/60)},(_,i)=>`<span class="time-label" style="top:${i*HOUR}px">${time(start+i*60).replace(':00','')}</span>`).join('');
  $('week-grid').innerHTML=Array.from({length:dayCount},(_,d)=>`<div class="day-column" data-day="${d}">${scheduled.flatMap(({course:c,section:s})=>s.meetings.filter(m=>m.days.includes(d)).map(m=>{const col=color(c),issues=meetingIssues(m,owned);return `<button class="event${issues.length?' conflict':''}" aria-label="${escape(`${c.subject} ${c.code} ${s.component} ${s.label}, ${dayNames[d]} ${timeRange(m.start,m.end)}${m.location?`, ${m.location}`:''}${issues.length?`. Problem: ${issues.join('; ')}`:''}`)}" data-event="${escape(courseKey(c))}" style="top:${(m.start-start)/60*HOUR}px;height:${(m.end-m.start)/60*HOUR}px;--event-color:${col[0]};--event-bg:${col[1]};--event-ink:${col[2]}" title="${escape(`${c.subject} ${c.code} ${s.component} ${s.label}: ${meetingText(m)}${m.startDate?' · '+m.startDate+' to '+m.endDate:''}${issues.length?` · ${issues.join('; ')}`:''}`)}">${issues.length?'<span class="event-flag" aria-hidden="true">!</span>':''}<strong>${escape(c.subject)} ${escape(c.code)}</strong><span class="event-sub">${escape(s.component)} ${escape(s.label)}</span>${m.end-m.start>=70?`<span class="event-sub">${timeRange(m.start,m.end)}</span>`:''}${m.end-m.start>=80?`<span class="event-sub event-place">${escape(m.location||'Location unknown')}</span>`:''}</button>`;})).join('')}${blocked.filter(b=>b.days.includes(d)).map(b=>`<button class="event block" data-block="${escape(b.id)}" style="top:${(b.start-start)/60*HOUR}px;height:${(b.end-b.start)/60*HOUR}px" title="Edit ${escape(b.label)}" aria-label="Blocked time: ${escape(b.label)}, ${dayNames[d]} ${timeRange(b.start,b.end)}. Edit blocked time"><strong><bdi>${escape(b.label)}</bdi></strong><span>${timeRange(b.start,b.end)}</span></button>`).join('')}</div>`).join('');
  $('week-grid').insertAdjacentHTML('afterbegin',[earliest>start?`<div class="off-hours off-before" style="top:0;height:${(earliest-start)/60*HOUR}px"><span>Before ${time(earliest)}</span></div>`:'',latest<end?`<div class="off-hours off-after" style="top:${(latest-start)/60*HOUR}px;bottom:0"><span>After ${time(latest)}</span></div>`:''].join(''));
  if(!scheduled.length)$('week-grid').insertAdjacentHTML('beforeend',`<div class="empty-calendar"><strong>Your week starts here.</strong>Add courses, then choose Generate schedule.</div>`);
  $('week-grid').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{active=courses().find(c=>courseKey(c)===b.dataset.event);renderCatalog();renderDetail();fetchGrades();});
  $('week-grid').querySelectorAll('[data-block]').forEach(b=>b.onclick=openBlocks);
  $('legend').innerHTML=planned().map(c=>`<span><i style="background:${color(c)[0]}"></i>${escape(c.subject)} ${escape(c.code)}</span>`).join('');
  const count=planned().length,placed=new Set(scheduled.map(x=>courseKey(x.course))).size,credits=planned().reduce((n,c)=>n+c.credits,0);const total=meetings.reduce((sum,m)=>sum+(m.end-m.start)*m.days.length,0)/60;
  $('schedule-summary').textContent=count?`${placed===count?`${count} ${count>1?'courses':'course'}`:`${placed} of ${count} courses placed`} · ${credits} ${credits===1?'credit':'credits'} · ${Math.round(total*10)/10} hours of class a week${dataset.mode==='demo'?' · example timetable':''}`:'Choose courses to get started.';
}
function chosenSection(c,type){return c.sections.find(s=>(preview[courseKey(c)]?.[type]||(selection[courseKey(c)]||[]).find(id=>c.sections.find(s=>s.id===id)?.component===type))===s.id)||c.sections.find(s=>s.component===type&&s.status!=='cancelled')||c.sections.find(s=>s.component===type);}
function renderDetail(){
  if(!active){$('course-detail').innerHTML='<p class="detail-empty">Select a course to compare sections.</p>';return;}
  const c=active,key=courseKey(c),added=selected.includes(key);
  $('course-detail').innerHTML=`<div class="detail-heading"><span class="course-code" style="color:${color(c)[0]}">${escape(c.subject)} ${escape(c.code)}</span><h3>${escape(c.title)}</h3><p>${escape(c.credits)} credits · ${escape(c.campus)}${dataset.mode==='demo'?' · example sections':''}</p><p class="detail-grade" id="detail-grade"></p></div><div class="section-list">${c.requiredComponents.map(type=>{
    const s=chosenSection(c,type);if(!s)return '';
    const fresh=freshness(s,Date.now(),dataset.mode);
    return `<div class="component-row"><div class="component-top"><strong>${escape(type)}</strong>${added&&selection[key]?.includes(s.id)?`<label class="lock-label"><input type="checkbox" data-lock="${escape(s.id)}" ${locks[key]?.includes(s.id)?'checked':''}>Lock section</label>`:''}</div><select class="section-picker" data-component="${escape(type)}" aria-label="${escape(type)} section">${c.sections.filter(x=>x.component===type).map(x=>`<option value="${escape(x.id)}" ${x.id===s.id?'selected':''} ${x.status==='cancelled'?'disabled':''}>${escape(x.label)} · ${escape(x.status)}${x.instructor?' · '+escape(x.instructor):''}</option>`).join('')}</select><div class="section-info">${s.meetings.map(m=>`${escape(meetingText(m))}<br>${escape(m.location||'Location not published')}${m.startDate?'<br>'+escape(m.startDate+' to '+m.endDate):''}`).join('<br>')||(s.asynchronous?'Asynchronous; no scheduled meeting.':'Meeting times not published.')}<div class="seat-info"><span>Enrolled <strong>${escape(s.enrolled??'—')} / ${escape(s.capacity??'—')}</strong></span><span>Waitlist <strong>${escape(s.waitlisted??'—')} / ${escape(s.waitlistCapacity??'—')}</strong></span></div>${s.reservationNote?`<p class="seat-note">${escape(s.reservationNote)}</p>`:''}<p data-freshness="${escape(s.id)}" class="freshness ${fresh.state}">${escape(fresh.label)}${s.sourceObservedAt?` · ${escape(new Date(s.sourceObservedAt).toLocaleString())}`:''}</p></div></div>`;
  }).join('')}<p class="seat-note">Capacity does not confirm your eligibility. Check reservations and waitlists in Workday.</p>${!added?'<p class="section-info">Add this course to your plan to schedule and lock sections.</p>':''}</div>`;
  $('course-detail').querySelectorAll('[data-lock]').forEach(b=>b.onchange=()=>{cancelGeneration();locks[key]=b.checked?[...(locks[key]||[]),b.dataset.lock]:(locks[key]||[]).filter(id=>id!==b.dataset.lock);save();renderRegister();});
  detailGrade();
  $('course-detail').querySelectorAll('[data-component]').forEach(b=>b.onchange=()=>{
    const type=b.dataset.component,id=b.value;
    if(!added){preview[key]={...(preview[key]||{}),[type]:id};renderDetail();return;}
    const chosen=c.sections.find(s=>s.id===id);
    const otherLocks=(locks[key]||[]).filter(x=>c.sections.find(s=>s.id===x)?.component!==type);
    const nextLocks=locks[key]?.some(x=>c.sections.find(s=>s.id===x)?.component===type)?{...locks,[key]:[...otherLocks,id]}:locks;
    generate({...locks,[key]:[...otherLocks,chosen.id]},nextLocks);
  });
}
function planStatus(text){$('plan-status').textContent=text;}
function planStatusText(errors=[],names=planned().filter(c=>!(selection[courseKey(c)]||[]).length)){return errors.length?'Your week needs attention.':names.length?`${names.length} ${names.length>1?'courses':'course'} not placed yet.`:selected.length?'Every course is placed.':'Add courses, then generate your week.';}
function changes(before,after){
  const label=c=>`${c.subject} ${c.code}`,placed=[],moved=[];
  for(const c of planned()){const key=courseKey(c),was=before[key]||[],now=after[key]||[];if(!was.length&&now.length)placed.push(label(c));else if(was.join()!==now.join())moved.push(label(c));}
  const list=n=>n.length>1?`${n.slice(0,-1).join(', ')} and ${n.at(-1)}`:n[0];
  if(!placed.length&&!moved.length)return 'Your current sections already fit. Nothing changed.';
  return [placed.length&&`Placed ${list(placed)}.`,moved.length&&`Changed sections for ${list(moved)}.`,'No conflicts.'].filter(Boolean).join(' ');
}
function generate(temporaryLocks=locks,nextLocks=locks){
  cancelGeneration();if(!selected.length){selection={};save();render();message('Add at least one course to generate a timetable.');if(revealNext)reveal();revealNext=false;return;}
  if(selected.some(key=>!courses().some(c=>courseKey(c)===key))){message('Remove the course that’s no longer offered, then generate again.');renderDetail();return;}
  setBusy(true);message('Finding sections that fit…','info');planStatus('Finding sections that fit…');const before=structuredClone(selection),undoSnap=snapshot();
  worker=new Worker('/worker.js',{type:'module'});
  worker.onmessage=({data})=>{cancelGeneration();if(data.ok){selection=data.selection;locks=nextLocks;preview={};save();render();if(!validate().length){const text=changes(before,selection);message(text,true,text.startsWith('Your current')?null:undoTo(undoSnap,'the last generate'));}}else{renderDetail();message(data.reason);planStatus('Couldn’t fit every course.');}if(revealNext)reveal();revealNext=false;};
  worker.onerror=()=>{cancelGeneration();message('The schedule generator stopped unexpectedly. Reload the page and try again.');planStatus('Generation stopped. Reload and try again.');};
  worker.postMessage({courses:planned(),options:{locks:temporaryLocks,blocked,earliest,latest}});
}
const SMALL_SAMPLE=30;
let gradeMeta={},gradeSort={key:'section',dir:1},gradeSelected='OVERALL',gradeCourse=null,gradeSession=null,gradeLoading=false;
function gradeAnnounce(text){$('grade-status').textContent=text;}
async function fetchGrades(){
  const id=++gradeRequest;gradeRows=[];gradeLoading=true;
  if(!active){gradeCourse=null;gradeLoading=false;$('grade-heading').textContent='Grade history';$('grade-content').innerHTML='<p class="grade-empty">Select a course to view its history.</p>';return;}
  const c=active,session=$('grade-session').value;
  if(gradeCourse!==courseKey(c)||gradeSession!==session)gradeSelected='OVERALL';
  gradeCourse=courseKey(c);gradeSession=session;$('grade-heading').textContent=`${c.subject} ${c.code} grade history`;detailGrade();
  $('grade-content').innerHTML=`<div class="compare-skeleton" aria-hidden="true">${'<span></span>'.repeat(6)}</div>`;gradeAnnounce('Loading historical grades…');
  $('grade-source').href='https://ubcgrades.com/';
  try{
    const data=await api(`/api/grades?subject=${encodeURIComponent(c.subject)}&code=${encodeURIComponent(c.code)}&session=${encodeURIComponent(session)}`);
    if(id!==gradeRequest)return;
    gradeRows=data.rows;gradeLoading=false;
    if(!gradeRows.some(r=>r.section===gradeSelected))gradeSelected='OVERALL';
    $('grade-source').href=safeURL(data.sourceUrl,'https://ubcgrades.com/');
    renderGrades(data);detailGrade();
    const sections=gradeRows.filter(r=>r.section!=='OVERALL').length;
    gradeAnnounce(gradeRows.length?`${session}: ${sections} historical ${sections===1?'section':'sections'}.`:`No grade history for ${session}.`);
  }catch(e){if(id!==gradeRequest)return;gradeLoading=false;$('grade-content').innerHTML=`<p class="grade-empty">${escape(e.message)}</p><button id="retry-grade" class="quiet">Retry grade history</button>`;$('retry-grade').onclick=fetchGrades;gradeAnnounce(e.message);detailGrade(e.message);}
}
function detailGrade(error=null){
  const el=$('detail-grade');if(!el||!active)return;
  if(gradeCourse!==courseKey(active)){el.textContent='';return;}
  const session=$('grade-session').value,overall=gradeRows.find(r=>r.section==='OVERALL');
  el.innerHTML=error||gradeLoading?'':!gradeRows.length?`No ${escape(session)} grade history published.`:overall?.average!=null?`${escape(session)} course average <strong>${overall.average.toFixed(1)}%</strong> · ${overall.reported?.toLocaleString('en-CA')??'—'} students · <a href="#grade-heading">Compare past sections</a>`:'';
}
function instructors(row,full){
  const names=String(row.educators||'').split(';').map(x=>x.trim()).filter(Boolean);
  if(!names.length)return row.section==='OVERALL'?'All sections combined':'Instructors not listed';
  return full||names.length<=2?names.join(', '):`${names.slice(0,2).join(', ')} +${names.length-2} more`;
}
function sortedSections(){
  const {key,dir}=gradeSort,rows=gradeRows.filter(r=>r.section!=='OVERALL');
  const code=(a,b)=>a.section.localeCompare(b.section,undefined,{numeric:true});
  const small=r=>r.reported!==null&&r.reported<SMALL_SAMPLE;
  return rows.sort((a,b)=>{
    if(key==='section')return dir*code(a,b);
    if(key==='average'&&small(a)!==small(b))return small(a)?1:-1;
    const x=a[key],y=b[key];
    if(x===null&&y===null)return code(a,b);if(x===null)return 1;if(y===null)return -1;
    return dir*(x-y)||code(a,b);
  });
}
function renderGrades(meta=gradeMeta,focus=null){
  gradeMeta=meta;
  if(!gradeRows.length){$('grade-content').innerHTML='<p class="grade-empty">No grade history is published for this course in this session. Try another historical session.</p>';return;}
  const session=$('grade-session').value,overall=gradeRows.find(r=>r.section==='OVERALL'),sections=sortedSections();
  const averages=gradeRows.map(r=>r.average).filter(Number.isFinite);
  const lo=Math.floor(Math.min(...averages)/10)*10,hi=Math.max(lo+10,Math.ceil(Math.max(...averages)/10)*10);
  const at=v=>`${((v-lo)/(hi-lo)*100).toFixed(1)}%`;
  const plot=r=>r.average===null?'':`<span class="dot-track" aria-hidden="true">${overall?.average!=null?`<i class="dot-baseline" style="left:${at(overall.average)}"></i>`:''}<i class="dot${r.reported!==null&&r.reported<SMALL_SAMPLE?' dot-small':''}" style="left:${at(r.average)}"></i></span>`;
  const sortHead=(key,label,cls='')=>{const on=gradeSort.key===key;return `<th scope="col" class="${cls}" ${on?`aria-sort="${gradeSort.dir>0?'ascending':'descending'}"`:''}><button type="button" data-sort="${key}">${label}<svg class="sort-icon${on?' on':''}${on&&gradeSort.dir<0?' down':''}" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5 5 3.5 8 6.5"/></svg></button></th>`;};
  const row=r=>{
    const isOverall=r.section==='OVERALL',small=!isOverall&&r.reported!==null&&r.reported<SMALL_SAMPLE,picked=r.section===gradeSelected;
    return `<tr class="compare-row${isOverall?' is-overall':''}${small?' is-small':''}${picked?' is-picked':''}"><th scope="row"><button type="button" class="section-pick" data-pick="${escape(r.section)}" aria-pressed="${picked}"><span class="pick-code">${isOverall?'Overall course':`<span class="hist-code"><span class="hist-session">${escape(session)}</span>${escape(r.section)}</span>`}${small?'<span class="small-tag">Small sample</span>':''}${picked?'<span class="picked-tag">Shown below</span>':''}</span><span class="pick-team">${escape(instructors(r,picked))}</span></button></th><td class="avg-cell"><span class="avg-num">${r.average===null?'—':`${r.average.toFixed(1)}<small>%</small>`}</span>${plot(r)}</td><td class="n-cell">${r.reported??'—'}</td></tr>`;
  };
  const pick=gradeRows.find(r=>r.section===gradeSelected)||overall||gradeRows[0];
  const entries=Object.entries(pick.grades||{}).filter(([k,v])=>typeof k==='string'&&Number.isFinite(v)&&v>=0).sort(([a],[b])=>(a.startsWith('<')?-1:parseInt(a))-(b.startsWith('<')?-1:parseInt(b)));
  const max=Math.max(1,...entries.map(([,v])=>v)),pickName=pick.section==='OVERALL'?'Overall course':`${session} section ${pick.section}`;
  $('grade-content').innerHTML=`<p class="grade-explainer">Codes are ${escape(session)} sections. They don’t correspond to this term’s sections, and teaching teams change each year.</p>
<table class="section-compare"><caption class="sr-only">Historical sections of ${escape(active?`${active.subject} ${active.code}`:'this course')}, ${escape(session)}. Average grade and number of students with reported grades.</caption>
<thead><tr>${sortHead('section','Section')}${sortHead('average','Average','avg-cell')}${sortHead('reported','Students','n-cell')}</tr></thead>
<tbody>${overall?row(overall):''}${sections.map(row).join('')}${sections.length?'':'<tr><td colspan="3" class="compare-none">No section breakdown published for this session.</td></tr>'}</tbody></table>
<p class="compare-key" aria-hidden="true"><span><i class="key-dot"></i>Section average</span><span><i class="key-line"></i>Course average</span><span><i class="key-small"></i>Fewer than ${SMALL_SAMPLE} students</span></p>
<h3 class="dist-title">${escape(pickName)} · distribution</h3>
${entries.length?`<div class="grade-chart" role="img" aria-label="Grade distribution for ${escape(pickName)}, ${escape(session)}">${entries.map(([label,count])=>`<div class="bar-group" title="${escape(label)}: ${count} students"><div class="bar" style="height:${count/max*100}%"></div><span class="bar-label" aria-hidden="true">${escape(label.replace('%','').split('-')[0])}</span></div>`).join('')}</div><details><summary>View distribution table</summary><table class="grade-table"><caption>${escape(pickName)}, ${escape(session)}</caption><thead><tr><th scope="col">Grade</th><th scope="col">Students</th></tr></thead><tbody>${entries.map(([label,count])=>`<tr><td>${escape(label)}</td><td>${count}</td></tr>`).join('')}</tbody></table></details>`:'<p class="grade-empty">Distribution not published for this section.</p>'}
${meta.cached?`<p class="grade-cache">${escape(meta.error)} Retrieved ${escape(new Date(meta.fetchedAt).toLocaleDateString())}.</p>`:''}`;
  $('grade-content').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{
    const key=b.dataset.sort;gradeSort=gradeSort.key===key?{key,dir:-gradeSort.dir}:{key,dir:key==='section'?1:-1};
    renderGrades(gradeMeta,`[data-sort="${key}"]`);
    gradeAnnounce(`Sorted by ${key==='reported'?'number of students':key}, ${key==='section'?(gradeSort.dir>0?'A to Z':'Z to A'):(gradeSort.dir>0?'lowest first':'highest first')}.${key==='average'?' Small samples are listed last.':''}`);
  });
  $('grade-content').querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
    gradeSelected=b.dataset.pick;renderGrades(gradeMeta,`[data-pick="${CSS.escape(gradeSelected)}"]`);
    gradeAnnounce(`Showing the distribution for ${gradeSelected==='OVERALL'?'the overall course':`${$('grade-session').value} section ${gradeSelected}`}.`);
  });
  if(focus)$('grade-content').querySelector(focus)?.focus();
}
function safeURL(value,fallback){try{const u=new URL(value);return u.protocol==='https:'?u.href:fallback;}catch{return fallback;}}
function openData(){
  const mode=dataset?.mode||'unavailable';const all=courses().flatMap(c=>c.sections);const states=all.map(s=>freshness(s,Date.now(),mode).state);
  $('data-content').innerHTML=`<section class="data-section"><h3>Course schedules and seats</h3><p>${mode==='demo'?'Fictional examples. No approved live course feed is connected.':escape(dataset?.source.name||'Not connected')}</p>${mode==='approved'?`<p>${states.filter(s=>s==='current').length} sections checked within five minutes; ${states.filter(s=>s==='stale').length} out of date; ${states.filter(s=>s==='unknown').length} with unknown freshness.</p><p>Snapshot downloaded: ${escape(dataset.fetchedAt||'Unknown')}. This does not establish when seats were observed.</p>`:'<p>A shared feed from UBCScheduler or UBC is needed before current seats can be offered.</p>'}</section><section class="data-section"><h3>Historical grades</h3><p>Retrieved from the public UBCGrades v3 API. Historical sessions and sample sizes are shown separately from the current course term.</p></section><section class="data-section"><h3>Your plan</h3><p>Saved only in this browser. Course lookups go to UBCGrades through this app’s server. Your saved plan and Workday credentials are not sent to UBCGrades.</p></section>`;
  $('data-dialog').showModal();
}
function blockError(kind,text){$(`${kind}-error`).textContent=text;const fields=kind==='day'?[...document.querySelectorAll('[name=day]')]:kind==='time'?[$('block-start'),$('block-end')]:[];fields.forEach(f=>text?f.setAttribute('aria-invalid','true'):f.removeAttribute('aria-invalid'));}
function openBlocks(){for(const k of ['day','time','block'])blockError(k,'');renderBlocks();$('block-dialog').showModal();}
function renderBlocks(){$('block-list').innerHTML=blocked.map(b=>`<div class="block-row"><span><bdi>${escape(b.label)}</bdi><br><small>${escape(meetingText(b))}</small></span><button type="button" class="quiet" data-remove-block="${escape(b.id)}" aria-label="Remove ${escape(b.label)}">Remove</button></div>`).join('');$('block-list').querySelectorAll('[data-remove-block]').forEach(b=>b.onclick=()=>{cancelGeneration();blocked=blocked.filter(x=>x.id!==b.dataset.removeBlock);save();renderBlocks();renderCalendar();validate();renderBlockCount();$('block-label').focus();});}
$('block-form').onsubmit=e=>{
  e.preventDefault();const chosen=[...document.querySelectorAll('[name=day]:checked')].map(x=>Number(x.value));const toMinutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};const start=toMinutes($('block-start').value),end=toMinutes($('block-end').value);
  for(const k of ['day','time','block'])blockError(k,'');
  if(!chosen.length){blockError('day','Choose at least one day.');document.querySelector('[name=day]').focus();return;}
  if(start>=end){blockError('time','End time must be after the start time.');$('block-end').focus();return;}
  if(blocked.length>=50){blockError('block','You can block up to 50 times. Remove one to add another.');return;}
  cancelGeneration();blocked.push({id:crypto.randomUUID(),label:$('block-label').value.trim()||'Busy',days:chosen,start,end});save();render();validate();$('block-dialog').close();
};
$('search').oninput=()=>{const n=renderCatalog(),q=$('search').value.trim();$('catalog-status').textContent=q?`${n} ${n===1?'course matches':'courses match'} “${q}”.`:'';};
document.querySelectorAll('[name=day]').forEach(c=>c.addEventListener('change',()=>blockError('day','')));
for(const id of ['block-start','block-end'])$(id).addEventListener('input',()=>blockError('time',''));
$('filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCatalog();});
$('generate').onclick=$('generate-mobile').onclick=()=>{if(busy)return;revealNext=true;generate();};$('term').onchange=()=>{save();load($('term').value);};
for(const id of ['earliest','latest'])$(id).onchange=()=>{cancelGeneration();earliest=Number($('earliest').value);latest=Number($('latest').value);save();render();validate();};
$('grade-session').onchange=fetchGrades;
$('data-button').onclick=openData;$('block-button').onclick=openBlocks;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('clear-plan').onclick=()=>{if(!selected.length&&!blocked.length){message('This plan is already empty.','info');return;}const snap=snapshot();cancelGeneration();selected=[];selection={};locks={};blocked=[];preview={};save();render();validate();message('Cleared this term’s courses, locks, and blocked times.','info',undoTo(snap,'clearing the plan'));reveal();};
function planRows(){return planned().map(c=>{const key=courseKey(c);return {c,key,secs:(selection[key]||[]).map(id=>c.sections.find(s=>s.id===id)).filter(Boolean)};});}
function registerStatus(text){const el=$('register-status');if(el)el.textContent=text;}
function exportPlan(){const value={campus:'UBCV',term:dataset?.term.id,source:dataset?.source,mode:dataset?.mode,selected,selection,locks,blocked,earliest,latest,exportedAt:new Date().toISOString(),notice:'Planning only. Verify courses, times, seats, and eligibility in Workday.'};const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='coursepath-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);registerStatus('Downloaded coursepath-plan.json.');}
async function copyPlan(){
  const demo=dataset.mode==='demo',rows=planRows();
  const text=[`${dataset.term.label}${demo?' (example data, not real sections)':''}`,...rows.map(({c,secs})=>`${c.subject} ${c.code} ${c.title}: ${secs.length?secs.map(s=>`${s.component} ${s.label}`).join(', '):'not placed yet'}`)].join('\n');
  try{await navigator.clipboard.writeText(text);const b=$('copy-plan');b.textContent='Copied';setTimeout(()=>{if(b.isConnected)b.textContent='Copy list';},2000);registerStatus(`Copied ${rows.length} ${rows.length===1?'course':'courses'}.`);}
  catch{registerStatus('Couldn’t copy. Select the list and copy it manually.');}
}
function renderRegister(){
  const el=$('register'),rows=planRows();el.hidden=!rows.length;if(!rows.length){el.innerHTML='';return;}
  const demo=dataset.mode==='demo',cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
  el.innerHTML=`<div class="register-head"><h3 id="register-title">Ready to register</h3><div class="register-actions"><button type="button" id="copy-plan" class="quiet">Copy list</button><button type="button" id="export" class="quiet">Download JSON</button></div></div>
<p class="register-note${demo?' is-demo':''}">${demo?'<strong>Example sections.</strong> These come from fictional data. Don’t register with these codes.':'Seats, reservations, and eligibility are confirmed in Workday when you register.'}</p>
<ul class="register-list">${rows.map(({c,key,secs})=>`<li class="${secs.length?'':'is-unplaced'}"><span class="reg-course"><i style="background:${color(c)[0]}" aria-hidden="true"></i><strong>${escape(c.subject)} ${escape(c.code)}</strong><span class="reg-title">${escape(c.title)}</span></span><span class="reg-sections">${secs.length?secs.map(s=>`<span class="reg-section">${escape(s.component)} <b>${escape(s.label)}</b>${locks[key]?.includes(s.id)?'<span class="reg-tag">Locked</span>':''}${s.status&&s.status!=='open'?`<span class="reg-tag">${escape(cap(s.status))}</span>`:''}</span>`).join(''):'<span class="reg-section reg-missing">Not placed yet</span>'}</span></li>`).join('')}</ul>
<div class="register-foot"><a class="workday-cta" href="https://myworkday.ubc.ca/" target="_blank" rel="noopener">Open Workday to register <span aria-hidden="true">↗</span></a><span id="register-status" class="register-status" role="status" aria-live="polite"></span></div>`;
  $('copy-plan').onclick=copyPlan;$('export').onclick=exportPlan;
}
await load(null,true);
try{const data=await api('/api/grade-sessions');if(data.sessions?.length){const old=$('grade-session').value;$('grade-session').innerHTML=data.sessions.map(s=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');if(old!==data.sessions[0])fetchGrades();}}catch{}
setInterval(()=>{if(dataset&&!document.hidden&&!busy)load(dataset.term.id);},60000);
setInterval(()=>{if(!dataset||document.hidden)return;document.querySelectorAll('[data-freshness]').forEach(el=>{const s=courses().flatMap(c=>c.sections).find(s=>s.id===el.dataset.freshness);if(!s)return;const f=freshness(s,Date.now(),dataset.mode);el.className=`freshness ${f.state}`;el.textContent=f.label+(s.sourceObservedAt?' · '+new Date(s.sourceObservedAt).toLocaleString():'');});},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dataset)load(dataset.term.id);});
