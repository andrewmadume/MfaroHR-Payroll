import 'dotenv/config';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db';
import {removeStoredDocument} from '../lib/document-storage';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
const password=process.env.LOCAL_DEMO_PASSWORD;
const enabled=!!process.env.RUN_INTEGRATION;
let activeOrg='';
after(async()=>{if(enabled)await db.$disconnect();});
const sessions=new Map<string,string>();
async function login(role:string){
 const cached=sessions.get(role);if(cached)return cached;
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email:`${role}@mfaro.example`,password})});
  if(r.status===429&&attempt<2){const seconds=Number(r.headers.get('retry-after')??'11');await r.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,(Number.isFinite(seconds)?Math.min(Math.max(seconds,1),60):11)*1000+250));continue;}
  assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');sessions.set(role,cookie);return cookie;
 }
 throw Error('Sign-in retry limit exceeded');
}
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
  await db.payrollLine.deleteMany({where:{run:{organisationId:fixtureOrg}}});await db.payrollRun.deleteMany({where:{organisationId:fixtureOrg}});await db.record.deleteMany({where:{organisationId:fixtureOrg}});await db.audit.deleteMany({where:{organisationId:fixtureOrg}});await db.salary.deleteMany({where:{employee:{organisationId:fixtureOrg}}});await db.employee.deleteMany({where:{organisationId:fixtureOrg}});await db.membership.deleteMany({where:{organisationId:fixtureOrg}});await db.organisation.delete({where:{id:fixtureOrg}});
 }
});
test('API private attachments persist and enforce ownership and organisation scope',{skip:!enabled},async()=>{
 if(process.env.APP_MODE!=='demo')throw Error('Integration fixtures require demo mode');
 const fixtureOrg='test-documents-'+randomUUID(),own='test-employee-'+randomUUID(),other='test-employee-'+randomUUID(),doc='test-document-'+randomUUID(),otherDoc='test-document-'+randomUUID();activeOrg=fixtureOrg;
 await db.organisation.create({data:{id:fixtureOrg,name:'Disposable attachment test',mode:'demo'}});
 await db.membership.createMany({data:[{organisationId:fixtureOrg,userId:'user-admin',role:'Administrator'},{organisationId:fixtureOrg,userId:'user-employee',role:'Employee',employeeId:own}]});
 for(const id of [own,other])await db.employee.create({data:{id,organisationId:fixtureOrg,number:id,name:'Fictional attachment employee',email:'attachment@example.test',department:'Test',branch:'Test',jobTitle:'Test',startDate:'2026-01-01'}});
 for(const [id,employeeId] of [[doc,own],[otherDoc,other]])await db.record.create({data:{id,organisationId:fixtureOrg,employeeId,module:'Documents',title:'Fictional attachment',status:'Active',data:{category:'Contract'}}});
 try{
  const admin=await login('admin'),employee=await login('employee');const upload=async(cookie:string,id:string,bytes:string)=>{const form=new FormData();form.set('id',id);form.set('file',new File([bytes],'fictional.pdf',{type:'application/pdf'}));return fetch(base+'/api/documents',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost:3000','x-organisation-id':fixtureOrg},body:form});};
  const uploaded=await upload(admin,doc,'%PDF-1.4 fictional private document');assert.equal(uploaded.status,200,await uploaded.clone().text());
  assert.equal((await post(admin,{action:'record.save',module:'Documents',id:doc,title:'Updated attachment description',data:{employeeId:own,category:'Contract',expiryDate:'2030-12-31',notes:'Attachment must survive a metadata edit'}})).status,200);
  assert.equal((await upload(admin,otherDoc,'%PDF-1.4 other employee')).status,200);
  const downloaded=await get(employee,'/api/documents?id='+doc);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'%PDF-1.4 fictional private document');assert.equal(downloaded.headers.get('cache-control'),'private, no-store');
  assert.equal((await get(employee,'/api/documents?id='+otherDoc)).status,404);assert.equal((await get(admin,'/api/documents?id='+doc,{'x-organisation-id':'org-mfaro-demo'})).status,404);
  assert.equal((await upload(employee,doc,'%PDF forbidden write')).status,403);assert.equal((await upload(admin,doc,'<html>invalid signature</html>')).status,400);
 }finally{
  activeOrg='';if(!fixtureOrg.startsWith('test-documents-'))throw Error('Invalid fixture target');
  for(const r of await db.record.findMany({where:{organisationId:fixtureOrg,module:'Documents'}})){const d=r.data as any;if(d.fileKey)await removeStoredDocument(fixtureOrg,d.fileKey,d.fileProvider??'local');}
  await db.record.deleteMany({where:{organisationId:fixtureOrg}});await db.audit.deleteMany({where:{organisationId:fixtureOrg}});await db.employee.deleteMany({where:{organisationId:fixtureOrg}});await db.membership.deleteMany({where:{organisationId:fixtureOrg}});await db.organisation.delete({where:{id:fixtureOrg}});
 }
});

