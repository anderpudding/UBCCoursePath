import {courseKey,freshness,validatePlan} from '/lib/core.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=[['#315cd6','#eaf0ff','#23469c'],['#267d79','#e3f3ed','#1d6561'],['#ad5334','#fbece4','#8d432a'],['#755ca3','#eee8f8','#5b4284'],['#986114','#fff3d9','#785012'],['#a14d79','#f8e9f1','#843b62']];
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const time=n=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n<720?'am':'pm'}`;
const meetingText=m=>`${m.days.map(d=>days[d]).join(', ')} · ${time(m.start)}–${time(m.end)}`;
const STORAGE='coursepath-plans-v1';
let dataset=null,active=null,filter='all',selected=[],selection={},locks={},blocked=[],earliest=480,latest=1260,gradeRows=[],gradeRequest=0,loadRequest=0,worker=null,busy=false,plans={},preview={},storageError=false;
try{const p=JSON.parse(localStorage.getItem(STORAGE)||'{}');if(p&&typeof p==='object'&&!Array.isArray(p))plans=p;}catch{storageError=true;}
async function api(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Data could not be loaded.');return data;}
function planKey(){return `${dataset.mode}:${dataset.source.name}:${dataset.term.id}`;}
function courses(){return dataset?.term.courses||[];}
function planned(){return courses().filter(c=>selected.includes(courseKey(c)));}
function color(c){const i=courses().findIndex(x=>courseKey(x)===courseKey(c));return palette[Math.max(0,i)%palette.length];}
function cancelGeneration(){if(worker){worker.terminate();worker=null;}busy=false;$('generate').disabled=false;}
function save(){
  if(!dataset)return;
  plans[planKey()]={selected,selection,locks,blocked,earliest,latest};
  try{localStorage.setItem(STORAGE,JSON.stringify(plans));storageError=false;}catch{storageError=true;}
  $('save-status').textContent=storageError?'Saving unavailable in this browser':'Saved on this device';
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
function message(text,ok=false){$('plan-message').innerHTML=text?`<p class="${ok?'plan-success':'plan-warning'}">${escape(text)}</p>`:'';}
function validate(){
  const missing=selected.filter(k=>!courses().some(c=>courseKey(c)===k));
  const errors=validatePlan(planned(),selection,blocked,earliest,latest);
  if(missing.length) errors.unshift('A saved course is no longer in this term. Remove it from your plan or clear the plan.');
  if(errors.length)message(errors.join(' '));else message(selected.length?'No timetable conflicts. Check seat eligibility in Workday.':'',true);
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
  }catch(e){if(id!==loadRequest)return;if(dataset)$('term').value=dataset.term.id;message(e.message);$('source-banner').textContent=dataset?'Refresh unavailable. Showing the previous course snapshot; check timestamps.':e.message;}
  finally{if(id===loadRequest)$('term').disabled=false;}
}
function sourceBanner(){
  const banner=$('source-banner');banner.classList.toggle('approved',dataset.mode==='approved'&&!dataset.error);
  const status=dataset.mode==='demo'?'<strong>Example schedule</strong> · Times, instructors, and seats are fictional. Grade history comes from UBCGrades.':`<strong>${escape(dataset.source.name)}</strong> · ${dataset.error?escape(dataset.error):'Seat freshness is checked separately for every section.'}`;
  banner.innerHTML=`<span>${status}</span><button id="banner-data">View sources</button>`;$('banner-data').onclick=openData;
}
function render(){if(!dataset)return;renderCatalog();renderCalendar();renderDetail();$('earliest').value=earliest;$('latest').value=latest;$('block-count').textContent=blocked.length?`${blocked.length} blocked`:'';$('course-count').textContent=selected.length;$('credit-count').textContent=`${planned().reduce((n,c)=>n+c.credits,0)} credits`;$('save-status').textContent=storageError?'Saving unavailable in this browser':'Saved on this device';}
function renderCatalog(){
  const query=$('search').value.trim().toLowerCase().replace(/\s+/g,' ');
  const visible=courses().filter(c=>(filter!=='selected'||selected.includes(courseKey(c)))&&(`${c.subject} ${c.code} ${c.title}`.toLowerCase().includes(query)||`${c.subject}${c.code}`.toLowerCase().includes(query.replace(/\s/g,''))));
  $('course-list').innerHTML=visible.map(c=>{const key=courseKey(c),added=selected.includes(key);return `<div class="course-item ${active&&courseKey(active)===key?'active':''}"><button class="course-open" data-course="${escape(key)}" aria-label="View ${escape(c.subject+' '+c.code)} details"><span class="course-code"><i class="course-dot" style="background:${color(c)[0]}"></i>${escape(c.subject)} ${escape(c.code)}</span><span class="course-name">${escape(c.title)}</span><span class="course-meta">${escape(c.credits)} credits · ${escape(c.requiredComponents.join(' + '))}</span></button><button class="add-course ${added?'selected':''}" data-add="${escape(key)}" aria-label="${added?'Remove':'Add'} ${escape(c.subject+' '+c.code)}">${added?'✓':'+'}</button></div>`;}).join('')||'<p class="no-results">No courses match. Try a subject code or another term.</p>';
  for(const key of selected.filter(k=>!courses().some(c=>courseKey(c)===k))) $('course-list').insertAdjacentHTML('beforeend',`<div class="course-item"><span class="course-name">Unavailable: ${escape(key)}</span><button class="quiet" data-add="${escape(key)}">Remove</button></div>`);
  $('course-list').querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{active=courses().find(c=>courseKey(c)===b.dataset.course);renderCatalog();renderDetail();fetchGrades();});
  $('course-list').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    cancelGeneration();const key=b.dataset.add;
    if(selected.includes(key)){selected=selected.filter(k=>k!==key);delete selection[key];delete locks[key];}
    else{if(selected.length>=15){message('Plan up to 15 courses at a time.');return;}selected.push(key);active=courses().find(c=>courseKey(c)===key);}
    save();render();validate();fetchGrades();
  });
}
function renderCalendar(){
  const scheduled=planned().flatMap(c=>(selection[courseKey(c)]||[]).map(id=>({course:c,section:c.sections.find(s=>s.id===id)})).filter(x=>x.section&&x.section.status!=='cancelled'));
  const meetings=scheduled.flatMap(x=>x.section.meetings);
  const end=Math.max(1260,...meetings.map(m=>m.end),...blocked.map(b=>b.end));const start=Math.min(480,...meetings.map(m=>m.start),...blocked.map(b=>b.start));
  const dayCount=[...meetings,...blocked].some(m=>m.days.some(d=>d>4))?7:5;const height=(end-start)/60*52;
  $('day-header').style.gridTemplateColumns=`46px repeat(${dayCount},1fr)`;$('day-header').innerHTML='<span></span>'+days.slice(0,dayCount).map(d=>`<span>${d}</span>`).join('');
  $('week-grid').style.gridTemplateColumns=`repeat(${dayCount},1fr)`;$('week-grid').parentElement.style.height=`${height}px`;
  $('time-labels').innerHTML=Array.from({length:Math.ceil((end-start)/60)},(_,i)=>`<span class="time-label" style="top:${i*52}px">${time(start+i*60).replace(':00','')}</span>`).join('');
  $('week-grid').innerHTML=Array.from({length:dayCount},(_,d)=>`<div class="day-column" data-day="${d}">${scheduled.flatMap(({course:c,section:s})=>s.meetings.filter(m=>m.days.includes(d)).map(m=>{const col=color(c);return `<button class="event" data-event="${escape(courseKey(c))}" style="top:${(m.start-start)/60*52}px;height:${(m.end-m.start)/60*52}px;--event-color:${col[0]};--event-bg:${col[1]};--event-ink:${col[2]}" title="${escape(`${c.subject} ${c.code} ${s.component} ${s.label}: ${meetingText(m)}${m.startDate?' · '+m.startDate+' to '+m.endDate:''}`)}"><strong>${escape(c.subject)} ${escape(c.code)}</strong><span class="event-sub">${escape(s.component)} ${escape(s.label)}</span>${time(m.start).replace(' ','')}${m.end-m.start>=80?`<span class="event-sub">${escape(m.location||'Location unknown')}</span>`:''}</button>`;})).join('')}${blocked.filter(b=>b.days.includes(d)).map(b=>`<button class="event block" data-block="${escape(b.id)}" style="top:${(b.start-start)/60*52}px;height:${(b.end-b.start)/60*52}px" title="Edit ${escape(b.label)}"><strong>${escape(b.label)}</strong><span>${time(b.start)}</span></button>`).join('')}</div>`).join('');
  if(!scheduled.length)$('week-grid').insertAdjacentHTML('beforeend',`<div class="empty-calendar"><strong>Your week starts here.</strong>Choose courses on the left, then generate a schedule.</div>`);
  $('week-grid').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{active=courses().find(c=>courseKey(c)===b.dataset.event);renderCatalog();renderDetail();fetchGrades();});
  $('week-grid').querySelectorAll('[data-block]').forEach(b=>b.onclick=openBlocks);
  $('legend').innerHTML=planned().map(c=>`<span><i style="background:${color(c)[0]}"></i>${escape(c.subject)} ${escape(c.code)}</span>`).join('');
  const count=planned().length;const total=meetings.reduce((sum,m)=>sum+(m.end-m.start)*m.days.length,0)/60;
  $('schedule-summary').textContent=count?`${count} courses · ${Math.round(total*10)/10} scheduled hours / week${dataset.mode==='demo'?' · example timetable':''}`:'Choose courses to get started.';
}
function chosenSection(c,type){return c.sections.find(s=>(preview[courseKey(c)]?.[type]||(selection[courseKey(c)]||[]).find(id=>c.sections.find(s=>s.id===id)?.component===type))===s.id)||c.sections.find(s=>s.component===type&&s.status!=='cancelled')||c.sections.find(s=>s.component===type);}
function renderDetail(){
  if(!active){$('course-detail').innerHTML='<p class="detail-empty">Select a course to compare sections.</p>';return;}
  const c=active,key=courseKey(c),added=selected.includes(key);
  $('course-detail').innerHTML=`<div class="detail-heading"><span class="course-code" style="color:${color(c)[0]}">${escape(c.subject)} ${escape(c.code)}</span><h3>${escape(c.title)}</h3><p>${escape(c.credits)} credits · ${escape(c.campus)}${dataset.mode==='demo'?' · example sections':''}</p></div><div class="section-list">${c.requiredComponents.map(type=>{
    const s=chosenSection(c,type);if(!s)return '';
    const fresh=freshness(s,Date.now(),dataset.mode);
    return `<div class="component-row"><div class="component-top"><strong>${escape(type)}</strong><label class="lock-label"><input type="checkbox" data-lock="${escape(s.id)}" ${locks[key]?.includes(s.id)?'checked':''} ${added&&selection[key]?.includes(s.id)?'':'disabled'}>Lock section</label></div><select class="section-picker" data-component="${escape(type)}" aria-label="${escape(type)} section">${c.sections.filter(x=>x.component===type).map(x=>`<option value="${escape(x.id)}" ${x.id===s.id?'selected':''} ${x.status==='cancelled'?'disabled':''}>${escape(x.label)} · ${escape(x.status)}${x.instructor?' · '+escape(x.instructor):''}</option>`).join('')}</select><div class="section-info">${s.meetings.map(m=>`${escape(meetingText(m))}<br>${escape(m.location||'Location not published')}${m.startDate?'<br>'+escape(m.startDate+' to '+m.endDate):''}`).join('<br>')||(s.asynchronous?'Asynchronous; no scheduled meeting.':'Meeting times not published.')}<div class="seat-info"><span>Enrolled <strong>${escape(s.enrolled??'—')} / ${escape(s.capacity??'—')}</strong></span><span>Waitlist <strong>${escape(s.waitlisted??'—')} / ${escape(s.waitlistCapacity??'—')}</strong></span></div>${s.reservationNote?`<p class="seat-note">${escape(s.reservationNote)}</p>`:''}<p data-freshness="${escape(s.id)}" class="freshness ${fresh.state}">${escape(fresh.label)}${s.sourceObservedAt?` · ${escape(new Date(s.sourceObservedAt).toLocaleString())}`:''}</p></div></div>`;
  }).join('')}<p class="seat-note">Capacity does not confirm your eligibility. Check reservations and waitlists in Workday.</p>${!added?'<p class="section-info">Add this course to your plan to schedule and lock sections.</p>':''}</div>`;
  $('course-detail').querySelectorAll('[data-lock]').forEach(b=>b.onchange=()=>{cancelGeneration();locks[key]=b.checked?[...(locks[key]||[]),b.dataset.lock]:(locks[key]||[]).filter(id=>id!==b.dataset.lock);save();});
  $('course-detail').querySelectorAll('[data-component]').forEach(b=>b.onchange=()=>{
    const type=b.dataset.component,id=b.value;
    if(!added){preview[key]={...(preview[key]||{}),[type]:id};renderDetail();return;}
    const chosen=c.sections.find(s=>s.id===id);
    const otherLocks=(locks[key]||[]).filter(x=>c.sections.find(s=>s.id===x)?.component!==type);
    const nextLocks=locks[key]?.some(x=>c.sections.find(s=>s.id===x)?.component===type)?{...locks,[key]:[...otherLocks,id]}:locks;
    generate({...locks,[key]:[...otherLocks,chosen.id]},nextLocks);
  });
}
function generate(temporaryLocks=locks,nextLocks=locks){
  cancelGeneration();if(!selected.length){selection={};save();render();message('Add at least one course to generate a timetable.');return;}
  if(selected.some(key=>!courses().some(c=>courseKey(c)===key))){message('Remove unavailable courses before generating.');renderDetail();return;}
  busy=true;$('generate').disabled=true;message('Finding a set of sections that fits…',true);
  worker=new Worker('/worker.js',{type:'module'});
  worker.onmessage=({data})=>{cancelGeneration();if(data.ok){selection=data.selection;locks=nextLocks;preview={};save();render();validate();}else{renderDetail();message(data.reason);}};
  worker.onerror=()=>{cancelGeneration();message('The planner could not run. Reload the page and try again.');};
  worker.postMessage({courses:planned(),options:{locks:temporaryLocks,blocked,earliest,latest}});
}
async function fetchGrades(){
  const id=++gradeRequest;gradeRows=[];$('grade-section').innerHTML='<option value="OVERALL">Overall course</option>';
  if(!active){$('grade-content').innerHTML='<p class="grade-empty">Select a course to view its history.</p>';return;}
  const c=active,session=$('grade-session').value;
  $('grade-content').innerHTML='<p class="grade-empty">Loading historical grades…</p>';
  $('grade-source').href='https://ubcgrades.com/';
  try{
    const data=await api(`/api/grades?subject=${encodeURIComponent(c.subject)}&code=${encodeURIComponent(c.code)}&session=${encodeURIComponent(session)}`);
    if(id!==gradeRequest)return;
    gradeRows=data.rows;
    const overall=gradeRows.find(r=>r.section==='OVERALL');
    $('grade-section').innerHTML=gradeRows.map(r=>`<option value="${escape(r.section)}" ${r===overall?'selected':''}>${r.section==='OVERALL'?'Overall course':escape(r.section)}</option>`).join('')||'<option value="">No sections</option>';
    $('grade-source').href=safeURL(data.sourceUrl,'https://ubcgrades.com/');
    renderGrades(data);
  }catch(e){if(id===gradeRequest)$('grade-content').innerHTML=`<p class="grade-empty">${escape(e.message)}</p><button id="retry-grade" class="quiet">Retry grade history</button>`;if(id===gradeRequest)$('retry-grade').onclick=fetchGrades;}
}
let gradeMeta={};
function renderGrades(meta=gradeMeta){
  gradeMeta=meta;const row=gradeRows.find(r=>r.section===$('grade-section').value);
  if(!row){$('grade-content').innerHTML='<p class="grade-empty">No grade history is published for this course in this session. Try another historical session.</p>';return;}
  const entries=Object.entries(row.grades).filter(([k,v])=>typeof k==='string'&&Number.isFinite(v)&&v>=0).sort(([a],[b])=>(a.startsWith('<')?-1:parseInt(a))-(b.startsWith('<')?-1:parseInt(b)));
  const max=Math.max(1,...entries.map(([,v])=>v));
  $('grade-content').innerHTML=`<div class="grade-stats"><div><div class="average">${row.average===null?'—':row.average.toFixed(1)}<small>${row.average===null?'':'%'}</small></div><p>Average · ${escape(row.session)} · ${escape(row.section)}</p></div><div class="sample"><strong>${escape(row.reported??'—')}</strong><p>reported grades</p></div></div>${entries.length?`<div class="grade-chart" role="img" aria-label="Historical grade distribution for ${escape(row.session)}"><div class="sr-only"></div>${entries.map(([label,count])=>`<div class="bar-group" title="${escape(label)}: ${count} students"><div class="bar" style="height:${count/max*100}%"></div><span class="bar-label">${escape(label.replace('%',''))}</span></div>`).join('')}</div><details><summary>View distribution table</summary><table class="grade-table"><caption>${escape(row.session)} grade distribution</caption><thead><tr><th scope="col">Grade</th><th scope="col">Students</th></tr></thead><tbody>${entries.map(([label,count])=>`<tr><td>${escape(label)}</td><td>${count}</td></tr>`).join('')}</tbody></table></details>`:'<p class="grade-empty">Distribution not published.</p>'}<p class="teaching-team">Historical teaching team<br><strong>${escape(row.educators||'Not provided for this aggregate')}</strong></p>${meta.cached?`<p class="grade-cache">${escape(meta.error)} Retrieved ${escape(new Date(meta.fetchedAt).toLocaleDateString())}.</p>`:''}`;
}
function safeURL(value,fallback){try{const u=new URL(value);return u.protocol==='https:'?u.href:fallback;}catch{return fallback;}}
function openData(){
  const mode=dataset?.mode||'unavailable';const all=courses().flatMap(c=>c.sections);const states=all.map(s=>freshness(s,Date.now(),mode).state);
  $('data-content').innerHTML=`<section class="data-section"><h3>Course schedules and seats</h3><p>${mode==='demo'?'Fictional examples. No approved live course feed is connected.':escape(dataset?.source.name||'Not connected')}</p>${mode==='approved'?`<p>${states.filter(s=>s==='current').length} sections checked within five minutes; ${states.filter(s=>s==='stale').length} out of date; ${states.filter(s=>s==='unknown').length} with unknown freshness.</p><p>Snapshot downloaded: ${escape(dataset.fetchedAt||'Unknown')}. This does not establish when seats were observed.</p>`:'<p>A shared feed from UBCScheduler or UBC is needed before current seats can be offered.</p>'}</section><section class="data-section"><h3>Historical grades</h3><p>Retrieved from the public UBCGrades v3 API. Historical sessions and sample sizes are shown separately from the current course term.</p></section><section class="data-section"><h3>Your plan</h3><p>Saved only in this browser. Course lookups go to UBCGrades through this app’s server. Your saved plan and Workday credentials are not sent to UBCGrades.</p></section>`;
  $('data-dialog').showModal();
}
function openBlocks(){renderBlocks();$('block-dialog').showModal();}
function renderBlocks(){$('block-list').innerHTML=blocked.map(b=>`<div class="block-row"><span>${escape(b.label)}<br><small>${escape(meetingText(b))}</small></span><button type="button" class="quiet" data-remove-block="${escape(b.id)}" aria-label="Remove ${escape(b.label)}">Remove</button></div>`).join('');$('block-list').querySelectorAll('[data-remove-block]').forEach(b=>b.onclick=()=>{cancelGeneration();blocked=blocked.filter(x=>x.id!==b.dataset.removeBlock);save();renderBlocks();renderCalendar();validate();$('block-count').textContent=blocked.length?`${blocked.length} blocked`:'';});}
$('block-form').onsubmit=e=>{
  e.preventDefault();const chosen=[...document.querySelectorAll('[name=day]:checked')].map(x=>Number(x.value));const toMinutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};const start=toMinutes($('block-start').value),end=toMinutes($('block-end').value);
  if(!chosen.length||start>=end){$('block-error').textContent='Choose at least one day and an end time after the start.';return;}
  if(blocked.length>=50){$('block-error').textContent='Up to 50 blocked periods are supported.';return;}
  cancelGeneration();blocked.push({id:crypto.randomUUID(),label:$('block-label').value.trim()||'Busy',days:chosen,start,end});$('block-error').textContent='';save();render();validate();$('block-dialog').close();
};
$('search').oninput=renderCatalog;
$('filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCatalog();});
$('generate').onclick=()=>generate();$('term').onchange=()=>{save();load($('term').value);};
for(const id of ['earliest','latest'])$(id).onchange=()=>{cancelGeneration();earliest=Number($('earliest').value);latest=Number($('latest').value);save();validate();};
$('grade-session').onchange=fetchGrades;$('grade-section').onchange=()=>renderGrades();
$('data-button').onclick=openData;$('block-button').onclick=openBlocks;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('clear-plan').onclick=()=>{cancelGeneration();selected=[];selection={};locks={};blocked=[];preview={};save();render();message('Plan cleared. Add courses to start again.',true);};
$('export').onclick=()=>{const value={campus:'UBCV',term:dataset?.term.id,source:dataset?.source,mode:dataset?.mode,selected,selection,locks,blocked,earliest,latest,exportedAt:new Date().toISOString(),notice:'Planning only. Verify courses, times, seats, and eligibility in Workday.'};const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='coursepath-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
await load(null,true);
try{const data=await api('/api/grade-sessions');if(data.sessions?.length){const old=$('grade-session').value;$('grade-session').innerHTML=data.sessions.map(s=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');if(old!==data.sessions[0])fetchGrades();}}catch{}
setInterval(()=>{if(dataset&&!document.hidden&&!busy)load(dataset.term.id);},60000);
setInterval(()=>{if(!dataset||document.hidden)return;document.querySelectorAll('[data-freshness]').forEach(el=>{const s=courses().flatMap(c=>c.sections).find(s=>s.id===el.dataset.freshness);if(!s)return;const f=freshness(s,Date.now(),dataset.mode);el.className=`freshness ${f.state}`;el.textContent=f.label+(s.sourceObservedAt?' · '+new Date(s.sourceObservedAt).toLocaleString():'');});},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dataset)load(dataset.term.id);});
