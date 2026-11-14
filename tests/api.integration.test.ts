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
  const r=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.BETTER_AUTH_URL??'http://localhost:3000'},body:JSON.stringify({email:`${role}@mfaro.example`,password})});
  if(r.status===429&&attempt<2){const seconds=Number(r.headers.get('retry-after')??'11');await r.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,(Number.isFinite(seconds)?Math.min(Math.max(seconds,1),60):11)*1000+250));continue;}
  assert.equal(r.status,200,await r.clone().text());const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');sessions.set(role,cookie);return cookie;
 }
 throw Error('Sign-in retry limit exceeded');
}
async function get(cookie:string,path='/api/workspace',extra:Record<string,string>={}){return fetch(base+path,{headers:{Cookie:cookie,...(activeOrg?{'x-organisation-id':activeOrg}:{}),...extra}});}
async function post(cookie:string,body:unknown){return fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:cookie,...(activeOrg?{'x-organisation-id':activeOrg}:{}),'Content-Type':'application/json',Origin:process.env.BETTER_AUTH_URL??'http://localhost:3000'},body:JSON.stringify(body)});}
test('API authentication, own-record access, organisation isolation and export protection',{skip:!enabled},async()=>{
 assert.equal((await get('')).status,401);
 const employee=await login('employee');const state=await(await get(employee)).json();assert.equal(state.employees.length,1);assert.equal(state.employees[0].id,'emp-4');assert.ok(state.payslips.every((p:any)=>p.employeeId==='emp-4'));assert.equal(state.runs.length,0);
 assert.equal((await get(employee,'/api/workspace',{'x-organisation-id':'org-isolation-test'})).status,403);
 assert.equal((await post(employee,{action:'employee.archive',id:'emp-2'})).status,403);
 assert.equal((await get(employee,'/api/payslip/line-0-emp-1')).status,404);
 assert.equal((await get(employee,'/api/export?module=Payroll&format=csv')).status,403);
 const spreadsheet=await get(employee,'/api/export?module=Employees&format=xlsx');assert.equal(spreadsheet.status,200);assert.equal(Buffer.from(await spreadsheet.arrayBuffer()).subarray(0,2).toString(),'PK');
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
 assert.equal((await post(approver,{action:'payroll.action',id:duplicate.id,operation:'approve'})).status,200);assert.equal((await post(approver,{action:'payroll.action',id:duplicate.id,operation:'finalise'})).status,409);
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
  const admin=await login('admin'),employee=await login('employee');const upload=async(cookie:string,id:string,bytes:string)=>{const form=new FormData();form.set('id',id);form.set('file',new File([bytes],'fictional.pdf',{type:'application/pdf'}));return fetch(base+'/api/documents',{method:'POST',headers:{Cookie:cookie,Origin:process.env.BETTER_AUTH_URL??'http://localhost:3000','x-organisation-id':fixtureOrg},body:form});};
  const uploaded=await upload(admin,doc,'%PDF-1.4 fictional private document');assert.equal(uploaded.status,200,await uploaded.clone().text());
  assert.equal((await post(admin,{action:'record.save',module:'Documents',id:doc,version:2,title:'Updated attachment description',data:{employeeId:own,category:'Contract',expiryDate:'2030-12-31',notes:'Attachment must survive a metadata edit'}})).status,200);
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

test('repairs preserve profiles, invalidate payroll, reject stale edits and enforce independent review',{skip:!enabled},async()=>{
 const fixtureOrg='test-repairs-'+randomUUID(),own='repair-own-'+randomUUID(),other='repair-other-'+randomUUID();
 activeOrg=fixtureOrg;
 await db.organisation.create({data:{id:fixtureOrg,name:'Disposable security regression fixture',mode:'demo'}});
 await db.membership.createMany({data:[
  {organisationId:fixtureOrg,userId:'user-admin',role:'Administrator'},
  {organisationId:fixtureOrg,userId:'user-payroll',role:'Payroll Officer'},
  {organisationId:fixtureOrg,userId:'user-manager',role:'Department Manager',employeeId:own,department:'Finance'},
  {organisationId:fixtureOrg,userId:'user-employee',role:'Employee',employeeId:other}
 ]});
 for(const id of [own,other])await db.employee.create({data:{id,organisationId:fixtureOrg,number:id,name:'Security Test Employee',email:id+'@example.test',department:'Finance',branch:'Test',jobTitle:'Tester',startDate:'2026-01-01',profile:{bankAccount:'APPROVED-ACCOUNT',bankName:'Approved Bank',leaveBalance:27,taxReference:'EXISTING-TAX'}}});
 const run=await db.payrollRun.create({data:{organisationId:fixtureOrg,period:'2026-11',currency:'USD',preparedBy:'user-payroll',approvedBy:'user-approver',status:'Approved'}});
 try{
  const admin=await login('admin'),manager=await login('manager'),officer=await login('payroll'),employee=await login('employee');
  const saved=await post(admin,{action:'employee.save',id:own,data:{name:'Updated Employee',email:'updated@example.test',number:'REPAIR-OWN',department:'Finance',branch:'Test',jobTitle:'New title',startDate:'2026-01-01',currency:'USD',basic:1000,effectiveFrom:'2026-01-01',taxReference:''}});
  assert.equal(saved.status,200,await saved.clone().text());
  const profile=(await db.employee.findUniqueOrThrow({where:{id:own}})).profile as any;
  assert.equal(profile.bankAccount,'APPROVED-ACCOUNT');assert.equal(profile.bankName,'Approved Bank');assert.equal(profile.leaveBalance,27);assert.equal(profile.taxReference,'EXISTING-TAX');
  assert.equal((await db.payrollRun.findUniqueOrThrow({where:{id:run.id}})).status,'Draft');
  await db.payrollRun.update({where:{id:run.id},data:{status:'Approved',approvedBy:'user-approver'}});
  assert.equal((await post(admin,{action:'employee.archive',id:other})).status,200);
  assert.equal((await db.payrollRun.findUniqueOrThrow({where:{id:run.id}})).status,'Draft');
  // Recreate the employee membership revoked by archiving, solely in this disposable fixture.
  await db.membership.create({data:{organisationId:fixtureOrg,userId:'user-employee',role:'Employee',employeeId:other}});
  await db.payrollRun.update({where:{id:run.id},data:{status:'Approved',approvedBy:'user-approver'}});
  const imported=await fetch(base+'/api/import',{method:'POST',headers:{Cookie:admin,'x-organisation-id':fixtureOrg,Origin:process.env.BETTER_AUTH_URL??'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({save:true,rows:[{name:'Imported Test',email:'imported@example.test',number:'IMPORT-REPAIR',department:'Finance',branch:'Test',jobTitle:'Tester',startDate:'2026-01-01',effectiveFrom:'2026-01-01',currency:'USD',basic:1000}]})});
  assert.equal(imported.status,200,await imported.clone().text());assert.equal((await db.payrollRun.findUniqueOrThrow({where:{id:run.id}})).status,'Draft');
  const loan=await db.record.create({data:{organisationId:fixtureOrg,employeeId:own,module:'Loans & Benefits',title:'Loan',status:'Pending',data:{type:'Loan',amount:100,instalment:10,balance:100}}});
  assert.equal((await post(admin,{action:'record.action',id:loan.id,operation:'disburse'})).status,409);
  const edit={action:'record.save',module:'Loans & Benefits',id:loan.id,version:loan.version,title:'Loan edited',data:{employeeId:own,type:'Loan',amount:100,instalment:10}};
  const concurrent=await Promise.all([post(admin,edit),post(admin,edit)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  // The admin created the edit, not the request; approval is permitted and stale versions stay blocked.
  assert.equal((await post(admin,{action:'record.action',id:loan.id,operation:'approve'})).status,200);
  assert.equal((await post(admin,edit)).status,409);
  assert.equal((await post(admin,{action:'record.action',id:loan.id,operation:'disburse'})).status,200);
  const ownAttendance=await db.record.create({data:{organisationId:fixtureOrg,employeeId:own,module:'Attendance',title:'Own overtime',status:'Pending',data:{date:'2026-11-03',overtimeHours:2,overtimeRate:10}}});
  assert.equal((await post(manager,{action:'record.action',id:ownAttendance.id,operation:'approve'})).status,403);
  const created=await post(officer,{action:'record.save',module:'Loans & Benefits',title:'Requested loan',data:{employeeId:own,type:'Loan',amount:100,instalment:10}});assert.equal(created.status,200,await created.clone().text());
  const requestedId=(await created.json()).id;
  assert.equal((await post(admin,{action:'record.action',id:requestedId,operation:'approve'})).status,200);
  assert.equal((await post(admin,{action:'record.action',id:requestedId,operation:'disburse'})).status,200);
  const ownRequest=await post(admin,{action:'record.save',module:'Leave',title:'Created by approver',data:{employeeId:own,type:'Annual',startDate:'2026-11-23',endDate:'2026-11-23',fraction:'Full day'}});assert.equal(ownRequest.status,200);
  assert.equal((await post(admin,{action:'record.action',id:(await ownRequest.json()).id,operation:'approve'})).status,403);
  await db.employee.createMany({data:Array.from({length:105},(_,i)=>({id:'repair-page-'+randomUUID(),organisationId:fixtureOrg,number:'PAGE-'+i,name:'Pagination Test '+i,email:'page'+i+'@example.test',department:i===104?'Outside':'Finance',branch:'Test',jobTitle:'Tester',startDate:'2026-01-01'}))});
  await db.record.createMany({data:Array.from({length:105},(_,i)=>({organisationId:fixtureOrg,employeeId:other,module:'Attendance',title:'Page '+i,status:'Pending',data:{date:'2026-11-03'}}))});
  const first=await(await get(admin)).json();assert.equal(first.employees.length,100);assert.equal(first.records.length,100);assert.ok(first.pagination.employees);assert.ok(first.pagination.records);
  const second=await(await get(admin,'/api/workspace?employees='+first.pagination.employees+'&records='+first.pagination.records)).json();assert.ok(second.employees.length>0);assert.ok(second.records.length>0);assert.ok(!second.employees.some((e:any)=>first.employees.some((f:any)=>f.id===e.id)));
  const ownState=await(await get(employee)).json();assert.equal(ownState.employees.length,1);assert.ok(ownState.records.every((r:any)=>r.employeeId===other));
  const deptState=await(await get(manager)).json();assert.ok(deptState.employees.every((e:any)=>e.department==='Finance'));
  const exported=await get(admin,'/api/export?module=Attendance&format=csv');assert.equal(exported.status,200);assert.equal((await exported.text()).split('\r\n').length,107);
  const oversized=await post(admin,{action:'unknown',padding:'x'.repeat(260*1024)});assert.equal(oversized.status,413);
 }finally{
  activeOrg='';await db.payrollLine.deleteMany({where:{run:{organisationId:fixtureOrg}}});await db.payrollRun.deleteMany({where:{organisationId:fixtureOrg}});await db.record.deleteMany({where:{organisationId:fixtureOrg}});await db.audit.deleteMany({where:{organisationId:fixtureOrg}});await db.salary.deleteMany({where:{employee:{organisationId:fixtureOrg}}});await db.membership.deleteMany({where:{organisationId:fixtureOrg}});await db.employee.deleteMany({where:{organisationId:fixtureOrg}});await db.organisation.delete({where:{id:fixtureOrg}});
 }
});
