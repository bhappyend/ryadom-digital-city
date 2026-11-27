import test from 'node:test';
import assert from 'node:assert/strict';
import {choose35} from '../src/showcase';
test('showcase is deterministic, unique, 35 actual inputs, max3/city and category diverse',()=>{
  const input=Array.from({length:100},(_,i)=>({id:'test-'+i,slug:'test-'+i,cityId:'city-'+Math.floor(i/3),name:'TEST ONLY',cityName:'TEST',region:'region-'+i%10,categoryIds:[['cafe','shopping','services','auto','hotel'][i%5]!],address:'Адрес не указан в OSM',phone:null,website:null,recordId:'node/'+(100+i)}));
  const a=choose35(input),b=choose35([...input].reverse());assert.deepEqual(a,b);assert.equal(a.length,35);assert.equal(new Set(a.map(p=>p.id)).size,35);assert.equal(new Set(a.flatMap(p=>p.categoryIds)).size,5);for(const p of a)assert.ok(a.filter(x=>x.cityId===p.cityId).length<=3);
});
