import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
const password=process.env.LOCAL_DEMO_PASSWORD;
const enabled=!!process.env.RUN_INTEGRATION;
let activeOrg='';
async function login(role:string){const r=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email:`${role}@mfaro.example`,password})});assert.equal(r.status,200,await r.clone().text());return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
async function get(cookie:string,path='/api/workspace',extra:Record<string,string>={}){return fetch(base+path,{headers:{Cookie:cookie,...(activeOrg?{'x-organisation-id':activeOrg}:{}),...extra}});}
async function post(cookie:string,body:unknown){return fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:cookie,...(activeOrg?{'x-organisation-id':activeOrg}:{}),'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify(body)});}
test('API authentication, own-record access, organisation isolation and export protection',{skip:!enabled},async()=>{
 assert.equal((await get('')).status,401);
 const employee=await login('employee');const state=await(await get(employee)).json();assert.equal(state.employees.length,1);assert.equal(state.employees[0].id,'emp-4');assert.ok(state.payslips.every((p:any)=>p.employeeId==='emp-4'));assert.equal(state.runs.length,0);
 assert.equal((await get(employee,'/api/workspace',{'x-organisation-id':'org-isolation-test'})).status,403);
 assert.equal((await post(employee,{action:'employee.archive',id:'emp-2'})).status,403);
 assert.equal((await get(employee,'/api/payslip/line-0-emp-1')).status,404);
 assert.equal((await get(employee,'/api/export?module=Payroll&format=csv')).status,403);
 const pdf=await get(employee,'/api/payslip/line-0-emp-4');assert.equal(pdf.status,200);assert.ok((await pdf.text()).startsWith('%PDF'));
});
test('API payroll segregation, loan timing, immutable snapshots and duplicate prevention',{skip:!enabled},async()=>{
 if(process.env.APP_MODE!=='demo')throw Error('Integration fixtures require demo mode');
 activeOrg='test-integration-'+randomUUID();const fixtureOrg=activeOrg;const employeeId='test-employee-'+randomUUID(),loanId='test-loan-'+randomUUID();
 await db.organisation.create({data:{id:fixtureOrg,name:'Disposable API test fixture',mode:'demo',currency:'USD'}});
 await db.membership.createMany({data:[{userId:'user-payroll',organisationId:fixtureOrg,role:'Payroll Officer'},{userId:'user-approver',organisationId:fixtureOrg,role:'Payroll Approver'}]});
 await db.employee.create({data:{id:employeeId,organisationId:fixtureOrg,number:'TEST-001',name:'Fictional Test Employee',email:'test@example.test',department:'Finance',branch:'Test',jobTitle:'Test',startDate:'2025-01-01',currency:'USD'}});
 await db.salary.create({data:{employeeId,effectiveFrom:'2025-01-01',basic:'1000',allowance:'100',deduction:'10',contribution:'50'}});
 await db.record.create({data:{id:loanId,organisationId:fixtureOrg,module:'Loans & Benefits',employeeId,title:'Test loan',status:'Disbursed',data:{type:'Loan',amount:600,balance:'400.00',instalment:100}}});
 try{
 const officer=await login('payroll'),approver=await login('approver');
 const created=await post(officer,{action:'payroll.create',data:{period:'2026-11',currency:'USD',frequency:'Monthly',kind:'Regular'}});assert.equal(created.status,200,await created.clone().text());const id=(await created.json()).id;
 const act=async(cookie:string,operation:string)=>post(cookie,{action:'payroll.action',id,operation});
 assert.equal((await act(officer,'finalise')).status,403);
 const calc=await act(officer,'calculate');assert.equal(calc.status,200,await calc.clone().text());const before=(await calc.json()).state;const balance=before.records.find((r:any)=>r.id===loanId).data.balance;assert.equal(balance,'400.00');
 assert.equal((await act(officer,'submit')).status,200);assert.equal((await act(officer,'approve')).status,403);assert.equal((await act(approver,'approve')).status,200);
 const concurrent=await Promise.all([act(approver,'finalise'),act(approver,'finalise')]);assert.ok(concurrent.some(r=>r.status===200));
 const final=await(await get(officer)).json();const run=final.runs.find((r:any)=>r.id===id);assert.equal(run.status,'Finalised');assert.equal(final.records.find((r:any)=>r.id===loanId).data.balance,'300.00');
 assert.equal((await act(approver,'finalise')).status,200);assert.equal((await act(officer,'calculate')).status,400);
 assert.equal(run.paymentStatus,'Unpaid');const exported=await get(officer,'/api/export?module=Payroll&format=csv&run='+id);assert.equal(exported.status,200);assert.equal((await(await get(officer)).json()).runs.find((r:any)=>r.id===id).paymentStatus,'Unpaid');
 assert.equal((await post(approver,{action:'payroll.action',id,operation:'mark-paid',reason:'TEST-CONFIRMATION-001'})).status,200);const payment=(await(await get(officer)).json()).runs.find((r:any)=>r.id===id);assert.equal(payment.paymentStatus,'Paid');assert.equal(payment.paymentReference,'TEST-CONFIRMATION-001');
 const totals=run.lines.reduce((s:number,l:any)=>s+Math.round(Number(l.snapshot.result.net)*100),0);assert.equal(totals,Math.round(Number(run.totals.net)*100));
 const duplicate=await(await post(officer,{action:'payroll.create',data:{period:'2026-11',currency:'USD',frequency:'Monthly',kind:'Regular'}})).json();
 for(const operation of ['calculate','submit'])assert.equal((await post(officer,{action:'payroll.action',id:duplicate.id,operation})).status,200);
 assert.equal((await post(approver,{action:'payroll.action',id:duplicate.id,operation:'approve'})).status,200);assert.equal((await post(approver,{action:'payroll.action',id:duplicate.id,operation:'finalise'})).status,400);
 const reverse=await post(officer,{action:'payroll.action',id,operation:'reverse'});assert.equal(reverse.status,200,await reverse.clone().text());const reversal=(await reverse.json()).state.runs.find((r:any)=>r.correctionOf===id);assert.equal(reversal.kind,'Reversal');assert.equal(Number(reversal.totals.net),-Number(run.totals.net));
 assert.equal((await post(officer,{action:'payroll.action',id:reversal.id,operation:'submit'})).status,200);assert.equal((await post(approver,{action:'payroll.action',id:reversal.id,operation:'approve'})).status,200);assert.equal((await post(approver,{action:'payroll.action',id:reversal.id,operation:'finalise'})).status,200);
 const reversed=await(await get(officer)).json();assert.equal(reversed.records.find((r:any)=>r.id===loanId).data.balance,'400.00');assert.equal(reversed.runs.find((r:any)=>r.id===id).totals.net,run.totals.net);
 }finally{
  activeOrg='';if(!fixtureOrg.startsWith('test-integration-'))throw Error('Invalid fixture target');
  await db.payrollLine.deleteMany({where:{run:{organisationId:fixtureOrg}}});await db.payrollRun.deleteMany({where:{organisationId:fixtureOrg}});await db.record.deleteMany({where:{organisationId:fixtureOrg}});await db.audit.deleteMany({where:{organisationId:fixtureOrg}});await db.salary.deleteMany({where:{employee:{organisationId:fixtureOrg}}});await db.employee.deleteMany({where:{organisationId:fixtureOrg}});await db.membership.deleteMany({where:{organisationId:fixtureOrg}});await db.organisation.delete({where:{id:fixtureOrg}});await db.$disconnect();
 }
});
