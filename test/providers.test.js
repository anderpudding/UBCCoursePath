import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseProvider,createGradeProvider} from '../lib/providers.js';
import {freshness} from '../lib/core.js';
import {demoFeed} from '../lib/demo.js';
test('configured feed needs operator approval and HTTPS',async()=>{
  await assert.rejects(createCourseProvider({url:'https://example.com'}).get(),/approval/);
  await assert.rejects(createCourseProvider({url:'http://example.com',approved:true}).get(),/HTTPS/);
  assert.equal((await createCourseProvider().get()).mode,'demo');
});
test('feed outage retains validated data and does not reset upstream observation time',async()=>{
  const feed=structuredClone(demoFeed);feed.terms[0].courses[0].sections[0].sourceObservedAt='2020-01-01T00:00:00Z';
  let fails=false;const provider=createCourseProvider({url:'https://example.com/feed',approved:true,fetcher:async()=>{if(fails)throw Error('offline');return feed;}});
  const first=await provider.get();assert.equal(freshness(first.feed.terms[0].courses[0].sections[0]).state,'stale');
  fails=true;const second=await provider.get(true);assert.ok(second.error);assert.equal(second.fetchedAt,first.fetchedAt);assert.equal(second.feed,first.feed);
});
test('invalid first feed is unavailable and never substitutes demo records',async()=>{
  const provider=createCourseProvider({url:'https://example.com/feed',approved:true,fetcher:async()=>({})});await assert.rejects(provider.get(),/No validated/);
});
test('grade queries validate parameters, exact-match identities, and cache requests',async()=>{
  let calls=0;const provider=createGradeProvider({fetcher:async()=>{calls++;return [{campus:'UBCV',subject:'MATH',course:'100',detail:'',year:'2024',session:'W',section:'OVERALL',average:70,reported:100,grades:{'<50%':10}}];}});
  const data=await provider.grades('MATH','100','2024W');assert.equal(data.rows[0].reported,100);await provider.grades('MATH','100','2024W');assert.equal(calls,1);
  await assert.rejects(provider.grades('../secret','100','2024W'),/Invalid/);
});
test('missing grade history is empty; outages use only explicitly labelled real snapshots',async()=>{
  const p=createGradeProvider({fetcher:async()=>null});assert.deepEqual((await p.grades('MATH','100','2024W')).rows,[]);
  const cached={rows:[],sourceUrl:'https://ubcgrades.com/api/v3/grades/UBCV/2024W/MATH/100',fetchedAt:'2026-10-05T00:00:00Z'};
  const q=createGradeProvider({fetcher:async()=>{throw Error('offline');},snapshots:new Map([['MATH/100/2024W',cached]])});assert.equal((await q.grades('MATH','100','2024W')).cached,true);
  await assert.rejects(q.grades('MATH','101','2024W'),/unavailable/);
});
