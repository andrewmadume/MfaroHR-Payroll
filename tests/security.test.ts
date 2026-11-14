import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTransition} from '../lib/record-workflow';
import {PublicError} from '../lib/errors';
import {apiError} from '../lib/context';
import {readJson} from '../lib/request-policy';
test('loan approval cannot be skipped and transitions are module-specific',()=>{
 assert.throws(()=>recordTransition('Loans & Benefits','Pending','disburse'),PublicError);
 assert.equal(recordTransition('Loans & Benefits','Pending','approve'),'Approved');
 assert.equal(recordTransition('Loans & Benefits','Approved','disburse'),'Disbursed');
 assert.throws(()=>recordTransition('Attendance','Pending','disburse'));
 assert.throws(()=>recordTransition('Leave','Approved','approve'));
 assert.equal(recordTransition('Leave','Approved','cancel'),'Cancelled');
});
test('unexpected failures are generic 500 responses without exception details',async()=>{
 const original=console.error;const logs:unknown[]=[];console.error=(...args)=>{logs.push(args);};
 try{const response=apiError(new Error('private/database/path and secret detail'));assert.equal(response.status,500);const body=await response.json();assert.ok(body.requestId);assert.ok(!JSON.stringify(body).includes('private'));assert.ok(!JSON.stringify(logs).includes('secret detail'));}finally{console.error=original;}
 assert.equal(apiError(new PublicError(409,'Refresh and retry')).status,409);
 assert.equal(apiError({code:'P2002'}).status,409);
});
test('JSON size limits work without trusting content-length',async()=>{
 await assert.rejects(()=>readJson(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({large:'x'.repeat(100)})}),32),(e:unknown)=>e instanceof PublicError&&e.status===413);
 await assert.rejects(()=>readJson(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})),(e:unknown)=>e instanceof PublicError&&e.status===415);
});
