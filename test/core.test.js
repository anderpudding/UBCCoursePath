import test from 'node:test';
import assert from 'node:assert/strict';
import {freshness,normalizeFeed,normalizeGrades,solve,validatePlan,courseKey,overlaps} from '../lib/core.js';
import {demoFeed} from '../lib/demo.js';
const clone=()=>structuredClone(demoFeed);
test('demo feed validates and produces required lecture/lab/tutorial combinations without conflicts',()=>{
  const feed=normalizeFeed(clone());const courses=feed.terms[0].courses.slice(0,3);const result=solve(courses);assert.equal(result.ok,true);assert.deepEqual(validatePlan(courses,result.selection),[]);
  for(const c of courses)assert.equal(result.selection[courseKey(c)].length,c.requiredComponents.length);
});
test('locked lecture restricts linked labs',()=>{
  const c=clone().terms[0].courses[0];const key=courseKey(c);
  const result=solve([c],{locks:{[key]:['cpsc110-102']}});assert.equal(result.ok,true);assert.deepEqual(result.selection[key],['cpsc110-102','cpsc110-l2a']);
  assert.equal(solve([c],{locks:{[key]:['cpsc110-102','cpsc110-l1a']}}).ok,false);
});
test('missing locked section, cancelled section, and unknown meeting times cannot silently generate',()=>{
  const c=clone().terms[0].courses[0],key=courseKey(c);assert.equal(solve([c],{locks:{[key]:['deleted']}}).ok,false);
  c.sections[0].status='cancelled';assert.equal(solve([c],{locks:{[key]:[c.sections[0].id]}}).ok,false);
  c.sections.forEach(s=>s.meetings=[]);assert.equal(solve([c]).ok,false);
  c.sections.forEach(s=>s.asynchronous=true);assert.equal(solve([c]).ok,true);
});
test('blocked time and earliest start move to another valid section combination',()=>{
  const c=clone().terms[0].courses[0];const result=solve([c],{earliest:720});assert.equal(result.ok,false); // Every lecture pairing requires an earlier lab.
  const alternative=solve([c],{blocked:[{days:[0],start:600,end:660}]});assert.equal(alternative.ok,true);assert.ok(alternative.selection[courseKey(c)].includes('cpsc110-102'));
});
test('conflicting courses fail and stored plans are revalidated after schedule changes',()=>{
  const a=clone().terms[0].courses[1];a.sections=a.sections.slice(0,1);
  const b=structuredClone(a);b.subject='TEST';b.sections[0].id='test-101';
  assert.equal(solve([a,b]).ok,false);
  const result=solve([a]);a.sections[0].status='cancelled';assert.match(validatePlan([a],result.selection)[0],/cancelled/);
});
test('seat freshness uses observation timestamp, including the exact five-minute boundary',()=>{
  const now=Date.parse('2026-10-05T00:00:00Z');
  assert.equal(freshness({sourceObservedAt:new Date(now-300000).toISOString()},now).state,'current');
  assert.equal(freshness({sourceObservedAt:new Date(now-300001).toISOString(),fetchedAt:new Date(now).toISOString()},now).state,'stale');
  assert.equal(freshness({},now).state,'unknown');assert.equal(freshness({sourceObservedAt:new Date(now+1).toISOString()},now).state,'unknown');
  assert.equal(freshness({sourceObservedAt:new Date(now).toISOString()},now,'demo').state,'example');
});
test('historical matching preserves campus, session, and full course suffix',()=>{
  const row={campus:'UBCV',subject:'TEST',course:'199',detail:'A',year:'2024',session:'W',section:'OVERALL',average:76,reported:10,grades:{'90-100%':1}};
  const query={campus:'UBCV',subject:'TEST',code:'199A',session:'2024W'};
  assert.equal(normalizeGrades([row,{...row,detail:'B'},{...row,campus:'UBCO'},{...row,year:'2023'}],query).length,1);
  assert.equal(normalizeGrades([row],{...query,code:'199'}).length,0);
});
test('duplicate course/section identifiers and invalid feed relationships are rejected',()=>{
  let feed=clone();feed.terms[0].courses.push(feed.terms[0].courses[0]);assert.throws(()=>normalizeFeed(feed),/Duplicate course/);
  feed=clone();feed.terms[0].courses[0].sections[0].compatibleWith=['not-real'];assert.throws(()=>normalizeFeed(feed),/Unknown compatible/);
  feed=clone();feed.terms[0].courses[0].sections[0].sourceObservedAt='yesterday';assert.throws(()=>normalizeFeed(feed),/timestamp/);
  feed=clone();feed.terms[0].courses[0].sections[0].sourceObservedAt='2026-10-04T09:00:00';assert.throws(()=>normalizeFeed(feed),/timestamp/);
  feed=clone();feed.terms[0].courses[0].code=110;assert.throws(()=>normalizeFeed(feed),/course/);
  feed=clone();feed.terms[0].courses[0].sections[0].meetings[0].startDate='2026-02-30';feed.terms[0].courses[0].sections[0].meetings[0].endDate='2026-12-01';assert.throws(()=>normalizeFeed(feed),/date/);
  feed=clone();feed.terms[0].courses[0].sections[0].meetings[0].end=599;assert.throws(()=>normalizeFeed(feed),/meeting/);
});
test('back-to-back times and disjoint date ranges do not conflict',()=>{
  assert.equal(overlaps({days:[0],start:600,end:650},{days:[0],start:650,end:700}),false);
  assert.equal(overlaps({days:[0],start:600,end:650,startDate:'2026-09-01',endDate:'2026-10-01'},{days:[0],start:600,end:650,startDate:'2026-10-02',endDate:'2026-12-01'}),false);
});
test('bounded search reports failure instead of returning an incomplete plan',()=>{
  const courses=clone().terms[0].courses.slice(0,3);const result=solve(courses,{limit:1});assert.equal(result.ok,false);assert.match(result.reason,/limit/);
});
