import test from 'node:test';
import assert from 'node:assert/strict';
import {decideFreshness} from '../src/fresh.js';

test('unknown without prior seen time',()=>{const r=decideFreshness({observations:[]});assert.equal(r.decision,'UNKNOWN')});

test('reuse with recent stable shared observations',()=>{const now=Date.now();const observations=[1,2,3].map(i=>({observedAt:new Date(now-i*60000).toISOString(),etag:'same'}));const r=decideFreshness({lastSeenAt:new Date(now-120000).toISOString(),toleranceSeconds:3600,observations});assert.equal(r.decision,'REUSE')});

test('refetch old content when shared history changed',()=>{const now=Date.now();const observations=[{observedAt:new Date(now-10*86400000).toISOString(),etag:'a'},{observedAt:new Date(now-5*86400000).toISOString(),etag:'b'},{observedAt:new Date(now-1*86400000).toISOString(),etag:'c'}];const r=decideFreshness({lastSeenAt:new Date(now-20*86400000).toISOString(),toleranceSeconds:3600,observations});assert.equal(r.decision,'REFETCH')});
