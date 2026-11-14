import {Prisma} from '@prisma/client';
import {db} from './db';
import {context} from './context';
import {canView,canWrite,canPrepare,canApprove,visibleEmployee} from './permissions';
import {calculate,calculateEffective,sum,transition,workingDays,overlaps,money,Calculation} from './payroll';
import {schemas,employeeFields} from './modules';
import Decimal from 'decimal.js';
import {z} from 'zod';
import {documentLimit} from './document-policy';
import {organisationMutation,invalidatePayroll} from './mutation';
import {recordTransition} from './record-workflow';
import {PublicError} from './errors';
type Ctx=Awaited<ReturnType<typeof context>>;
type Tx=Prisma.TransactionClient;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const obj=(v:unknown)=>(v??{}) as Record<string,any>;
function denied(){throw new PublicError(400,'403: You do not have permission for this action');}
function scope(c:Ctx,e:{id:string;department:string}){if(!visibleEmployee(c.membership.role,c.membership.department,c.membership.employeeId,e))denied();}
export async function audit(tx:Tx,c:Ctx,action:string,id:string){await tx.audit.create({data:{organisationId:c.org.id,actorId:c.user.id,action,entityId:id}});}
async function employeeFor(c:Ctx,id:string,tx:Tx=db){const e=await tx.employee.findFirst({where:{id,organisationId:c.org.id}});if(!e)throw new PublicError(400,'404: Employee not found');scope(c,e);return e;}

export const WORKSPACE_PAGE_SIZE=100;
export type WorkspaceCursors={employees?:string;records?:string;runs?:string;payslips?:string};
export function employeeScope(c:Ctx):Prisma.EmployeeWhereInput{
 const base={organisationId:c.org.id};
 return c.membership.role==='Employee'?{...base,id:c.membership.employeeId??'none'}:c.membership.role==='Department Manager'?{...base,department:c.membership.department??'__no_department__'}:base;
}
export async function recordScope(c:Ctx,options:{module?:string;department?:string;after?:string;limit?:number}={}):Promise<Prisma.RecordWhereInput>{
 const allowed=Object.keys(schemas).filter(m=>canView(c.membership.role,m)&&(!options.module||m===options.module));
 if(!allowed.length)return {organisationId:c.org.id,id:'__none__'};
 if(c.membership.role==='Employee')return {organisationId:c.org.id,module:{in:allowed},employeeId:c.membership.employeeId??'none'};
 const department=c.membership.role==='Department Manager'?c.membership.department:options.department;
 if(c.membership.role==='Department Manager'&&!department)return {organisationId:c.org.id,id:'__none__'};
 if(department){const ids=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT r.id FROM public."Record" r JOIN public."Employee" e ON e.id=r."employeeId" AND e."organisationId"=r."organisationId" WHERE r."organisationId"=${c.org.id} AND e.department=${department} AND r.module IN (${Prisma.join(allowed)}) AND r.id>${options.after??''} ORDER BY r.id LIMIT ${options.limit??WORKSPACE_PAGE_SIZE+1}`);return {organisationId:c.org.id,id:{in:ids.map(r=>r.id)}};}
 return {organisationId:c.org.id,module:{in:allowed}};
}
const after=(cursor?:string)=>cursor?{id:{gt:cursor}}:{};
function windowOf<T extends {id:string}>(rows:T[],size=WORKSPACE_PAGE_SIZE){const items=rows.slice(0,size);return {items,next:rows.length>size?items.at(-1)!.id:null};}
export async function runLines(c:Ctx,id:string,cursor?:string){
 if(!canView(c.membership.role,'Payroll'))denied();
 const found=await db.payrollRun.findFirst({where:{id,organisationId:c.org.id},select:{id:true}});
 if(!found)throw new PublicError(404,'Payroll run not found');
 const page=windowOf(await db.payrollLine.findMany({where:{runId:id,...after(cursor)},orderBy:{id:'asc'},take:WORKSPACE_PAGE_SIZE+1}));
 return json({lines:page.items,next:page.next});
}
export async function state(c:Ctx,cursors:WorkspaceCursors={}){
 const role=c.membership.role;
 const emp=windowOf(await db.employee.findMany({where:{...employeeScope(c),...after(cursors.employees)},include:{salaries:{orderBy:{effectiveFrom:'desc'},take:20},_count:{select:{salaries:true}}},orderBy:{id:'asc'},take:WORKSPACE_PAGE_SIZE+1}));
 const employees=emp.items.map(e=>({...e,salaryHistoryTruncated:e._count.salaries>20,salaries:['Administrator','HR Manager','Payroll Officer','Payroll Approver','Employee'].includes(role)?e.salaries:[],profile:role==='Department Manager'?{}:Object.fromEntries(Object.entries(obj(e.profile)).filter(([k])=>!['bankAccount','taxReference'].includes(k)))}));
 const rec=windowOf(await db.record.findMany({where:{AND:[await recordScope(c,{after:cursors.records}),after(cursors.records)]},orderBy:{id:'asc'},take:WORKSPACE_PAGE_SIZE+1}));
 const records=rec.items.map(r=>({...r,data:obj(r.data).bankAccount?{...obj(r.data),bankAccount:'••••'+String(obj(r.data).bankAccount).slice(-4)}:r.data}));
 const run=windowOf(canView(role,'Payroll')?await db.payrollRun.findMany({where:{organisationId:c.org.id,...after(cursors.runs)},orderBy:{id:'asc'},take:11,select:{id:true,organisationId:true,period:true,currency:true,frequency:true,kind:true,correctionOf:true,status:true,paymentStatus:true,preparedBy:true,approvedBy:true,rejectionReason:true,version:true,totals:true,createdAt:true,updatedAt:true,_count:{select:{lines:true}},lines:{orderBy:{id:'asc'},take:WORKSPACE_PAGE_SIZE+1}}}):[],10);
 const paymentRecords=run.items.length?await db.record.findMany({where:{organisationId:c.org.id,module:'__payment_confirmations',title:{in:run.items.map(r=>r.id)}},take:WORKSPACE_PAGE_SIZE,select:{title:true,data:true}}):[];
 const runs=run.items.map(r=>{const lines=windowOf(r.lines);return {...r,lines:lines.items,lineCount:r._count.lines,lineNext:lines.next,paymentReference:obj(paymentRecords.find(p=>p.title===r.id)?.data).reference??null};});
 const pay=windowOf(canView(role,'Payslips & Payments')?await db.payrollLine.findMany({where:{run:{organisationId:c.org.id,status:'Finalised'},...(role==='Employee'?{employeeId:c.membership.employeeId??'none'}:{}),...after(cursors.payslips)},orderBy:{id:'asc'},take:WORKSPACE_PAGE_SIZE+1,include:{run:{select:{id:true,paymentStatus:true,status:true,period:true,currency:true}}}}):[]);
 const audits=['Administrator','Payroll Officer','Payroll Approver','HR Manager'].includes(role)?await db.audit.findMany({where:{organisationId:c.org.id},orderBy:{createdAt:'desc'},take:20}):[];
 const memberships=await db.membership.findMany({where:{userId:c.user.id},include:{organisation:true},take:100});
 const reads=await db.record.findFirst({where:{organisationId:c.org.id,module:'__notification_reads',title:c.user.id},select:{data:true}});
 return json({user:{name:c.user.name,email:c.user.email},role,organisation:c.org,memberships:memberships.map(m=>({id:m.organisationId,name:m.organisation.name,role:m.role})),employees,records,runs,payslips:pay.items,audits,notificationReadIds:obj(reads?.data).ids??[],employeeId:c.membership.employeeId,pagination:{employees:emp.next,records:rec.next,runs:run.next,payslips:pay.next},limits:{documentUploadBytes:documentLimit()}});
}
const amount=z.coerce.number().min(0).max(100000000);
const date=z.iso.date();
export async function saveEmployee(c:Ctx,input:Record<string,any>,id?:string){
 if(!canWrite(c.membership.role,'Employees'))denied();
 const e=z.object({name:z.string().min(2).max(120),email:z.email(),number:z.string().min(1).max(30),department:z.string().min(1),branch:z.string().min(1),jobTitle:z.string().min(1),startDate:date,currency:z.enum(['USD','ZAR','ZWG']),basic:amount,allowance:amount.default(0),deduction:amount.default(0),contribution:amount.default(0),effectiveFrom:date,frequency:z.enum(['Monthly','Fortnightly','Weekly']).default('Monthly')}).parse(input);
 return organisationMutation(c.org.id,async tx=>{
  const existing=id?await employeeFor(c,id,tx):null;
  const profile={...obj(existing?.profile),...Object.fromEntries(employeeFields.filter(f=>!Object.hasOwn(e,f.key)&&!['bankAccount','bankName'].includes(f.key)&&Object.hasOwn(input,f.key)&&!(f.key==='taxReference'&&!input[f.key])).map(f=>[f.key,String(input[f.key]??'').slice(0,2000)]))};
  const data={name:e.name,email:e.email,number:e.number,department:e.department,branch:e.branch,jobTitle:e.jobTitle,startDate:e.startDate,currency:e.currency,profile:json(profile)};
  const employee=id?await tx.employee.update({where:{id},data}):await tx.employee.create({data:{...data,organisationId:c.org.id}});
  await tx.salary.upsert({where:{employeeId_effectiveFrom:{employeeId:employee.id,effectiveFrom:e.effectiveFrom}},create:{employeeId:employee.id,effectiveFrom:e.effectiveFrom,basic:e.basic,allowance:e.allowance,deduction:e.deduction,contribution:e.contribution,frequency:e.frequency},update:{basic:e.basic,allowance:e.allowance,deduction:e.deduction,contribution:e.contribution,frequency:e.frequency}});
  await invalidatePayroll(tx,c.org.id);
  if(input.bankAccount)await tx.record.create({data:{organisationId:c.org.id,module:'Documents',employeeId:employee.id,title:'Bank detail change request',status:'Pending',data:json({category:'Bank change',bankAccount:String(input.bankAccount).slice(0,100),bankName:String(input.bankName??'').slice(0,200),requestedBy:c.user.id})}});
  await audit(tx,c,id?'Employee updated':'Employee created',employee.id);return employee.id;
 });
}
function validateFields(module:string,input:Record<string,any>){
 const config=Object.hasOwn(schemas,module)?schemas[module]:null;if(!config)throw new PublicError(400,'Unknown module');
 const data:Record<string,any>={};
 for(const f of config.fields){let value=input[f.key]??'';if(f.required&&!String(value).trim())throw new PublicError(400,`${f.label} is required`);if(value!==''&&f.type==='number')value=amount.parse(value);if(value!==''&&f.type==='date')date.parse(value);if(value!==''&&f.type==='email')z.email().parse(value);if(f.options&&value&&!f.options.includes(value))throw new PublicError(400,`Invalid ${f.label}`);data[f.key]=typeof value==='string'?value.slice(0,4000):value;}
 return data;
}
export async function saveRecord(c:Ctx,module:string,title:string,input:Record<string,any>,id?:string,expectedVersion?:number){
 if(!canWrite(c.membership.role,module))denied();
 const data=validateFields(module,input);const employeeId=data.employeeId||null;
 if(typeof title!=='string'||!title.trim()||title.length>200)throw new PublicError(400,'A title of 1–200 characters is required');
 return organisationMutation(c.org.id,async tx=>{
  if(employeeId)await employeeFor(c,employeeId,tx);
  const old=id?await tx.record.findFirst({where:{id,organisationId:c.org.id,module}}):null;
  if(id&&!old)throw new PublicError(404,'Record not found');
  if(old){
   if(!Number.isInteger(expectedVersion)||expectedVersion!==old.version)throw new PublicError(409,'Record changed; refresh and try again');
   if(['Approved','Disbursed','Completed','Closed','Archived','Cancelled'].includes(old.status))throw new PublicError(409,'Create a new request to change processed records');
   if(old.employeeId)await employeeFor(c,old.employeeId,tx);
   if(module==='Documents')for(const key of ['fileKey','fileProvider','fileName','fileType','fileSize'])if(obj(old.data)[key]!==undefined)data[key]=obj(old.data)[key];
  }
  if(c.membership.role==='Employee'&&['Performance','Onboarding'].includes(module)){
   if(!old)denied();const response=data.response;Object.assign(data,obj(old!.data));if(module==='Performance')data.response=response;
  }
  if(module==='Leave'){
   const settings=obj(c.org.settings);data.days=workingDays(data.startDate,data.endDate,settings.holidays??[])*(data.fraction==='Half day'?.5:1);if(!data.days)throw new PublicError(400,'The request contains no working days');
   const existing=await tx.record.findMany({where:{organisationId:c.org.id,module:'Leave',employeeId,status:{in:['Pending','Approved']},...(id?{id:{not:id}}:{})}});
   if(existing.some(r=>overlaps(data.startDate,data.endDate,obj(r.data).startDate,obj(r.data).endDate)))throw new PublicError(400,'This request overlaps existing leave');
   const opening=Number(obj((await employeeFor(c,employeeId,tx)).profile).leaveBalance??21);
   const used=existing.filter(r=>obj(r.data).type==='Annual').reduce((s,r)=>s+Number(obj(r.data).days||0),0);
   if(data.type==='Annual'&&data.days>opening-used)throw new PublicError(400,'Insufficient annual leave balance');
  }
  if(module==='Attendance'){
   if(data.clockIn&&data.clockOut&&new Date(data.clockOut)<=new Date(data.clockIn))throw new PublicError(400,'Clock-out must follow clock-in; use the following date for overnight shifts');
   if(data.clockIn)data.clockInUTC=new Date(data.clockIn+timezoneOffset(c.org.timezone)).toISOString();
   if(data.clockOut)data.clockOutUTC=new Date(data.clockOut+timezoneOffset(c.org.timezone)).toISOString();
  }
  if(module==='Loans & Benefits'){data.balance=data.amount;if(Number(data.instalment)>Number(data.amount))throw new PublicError(400,'Repayment exceeds the amount');}
  const recordData={title:title.trim(),data:json(data),employeeId,status:schemas[module].statuses[0]};
  let record;
  if(old){const changed=await tx.record.updateMany({where:{id:old.id,organisationId:c.org.id,version:old.version,status:old.status},data:{...recordData,version:{increment:1}}});if(changed.count!==1)throw new PublicError(409,'Record changed; refresh and try again');record={id:old.id};}
  else record=await tx.record.create({data:{...recordData,module,organisationId:c.org.id}});
  if(['Attendance','Leave','Loans & Benefits'].includes(module))await invalidatePayroll(tx,c.org.id);
  await audit(tx,c,`${module}: ${id?'updated':'created'}`,record.id);return record.id;
 });
}
function timezoneOffset(tz:string){if(['Africa/Harare','Africa/Johannesburg'].includes(tz))return '+02:00';if(tz==='UTC')return 'Z';throw new PublicError(400,'Configure a supported attendance timezone (UTC, Africa/Harare or Africa/Johannesburg)');}
export async function recordAction(c:Ctx,id:string,action:string,reason?:string){
 return organisationMutation(c.org.id,async tx=>{
 const r=await tx.record.findFirst({where:{id,organisationId:c.org.id}});if(!r)throw new PublicError(404,'Record not found');
 if(r.employeeId)await employeeFor(c,r.employeeId,tx);
 const role=c.membership.role;
 if(!canWrite(role,r.module))denied();
 if(role==='Employee'&&!(action==='cancel'&&['Leave','Loans & Benefits'].includes(r.module))&&!(action==='complete'&&['Onboarding','Performance'].includes(r.module)))denied();
 if(action==='reject'&&!reason?.trim())throw new PublicError(400,'A rejection reason is required');
 if(['approve','reject','disburse'].includes(action)){
  if(!['Administrator','HR Manager','Department Manager'].includes(role))denied();
  if(r.module==='Loans & Benefits'&&role!=='Administrator')denied();
  const ownEmployee=r.employeeId?await tx.membership.findFirst({where:{userId:c.user.id,organisationId:c.org.id,employeeId:r.employeeId}}):null;
  const ownRequest=obj(r.data).requestedBy===c.user.id||await tx.audit.findFirst({where:{organisationId:c.org.id,actorId:c.user.id,entityId:r.id,action:r.module+': created'}});
  if(ownEmployee||ownRequest)throw new PublicError(403,'A different authorized reviewer must decide your own request');
 }
 const nextStatus=recordTransition(r.module,r.status,action);
  const updated=await tx.record.updateMany({where:{id,organisationId:c.org.id,version:r.version},data:{status:nextStatus,data:json({...obj(r.data),...(reason?{decisionReason:reason.slice(0,1000)}:{})}),version:{increment:1}}});if(updated.count!==1)throw new PublicError(400,'Record changed; refresh and try again');
  if(r.module==='Documents'&&obj(r.data).category==='Bank change'&&action==='approve'){
   if(role!=='Administrator')denied();const employee=await employeeFor(c,r.employeeId!,tx);await tx.employee.update({where:{id:employee.id},data:{profile:json({...obj(employee.profile),bankAccount:obj(r.data).bankAccount,bankName:obj(r.data).bankName})}});
  }
  if(['Attendance','Leave','Loans & Benefits'].includes(r.module))await invalidatePayroll(tx,c.org.id);
  await audit(tx,c,`${r.module}: ${action}`,id);
 });
}
export async function createRun(c:Ctx,input:Record<string,any>){
 if(!canPrepare(c.membership.role))denied();
 const parsed=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),currency:z.enum(['USD','ZAR','ZWG']),frequency:z.enum(['Monthly','Fortnightly','Weekly']).default('Monthly'),kind:z.enum(['Regular','Off-cycle']).default('Regular')}).parse(input);
 if(parsed.frequency!=='Monthly')throw new PublicError(400,'Weekly and fortnightly run date boundaries are not implemented yet; use Monthly');
 return db.$transaction(async tx=>{const run=await tx.payrollRun.create({data:{...parsed,organisationId:c.org.id,preparedBy:c.user.id}});await audit(tx,c,'Payroll created',run.id);return run.id;});
}
export async function payrollAction(c:Ctx,id:string,action:string,reason?:string){
 return organisationMutation(c.org.id,async tx=>{
  const run=await tx.payrollRun.findFirst({where:{id,organisationId:c.org.id},include:{lines:true}});if(!run)throw new PublicError(400,'404: Payroll run not found');
  if(action==='reverse'){
   if(!canPrepare(c.membership.role))denied();if(run.status!=='Finalised'||run.kind==='Reversal')throw new PublicError(400,'Only an original finalised run can be reversed');
   const previous=await tx.payrollRun.findFirst({where:{organisationId:c.org.id,correctionOf:id,kind:'Reversal'}});if(previous)return;
   const reversal=await tx.payrollRun.create({data:{organisationId:c.org.id,period:run.period,currency:run.currency,frequency:run.frequency,kind:'Reversal',correctionOf:id,preparedBy:c.user.id,status:'Calculated',totals:json(Object.fromEntries(Object.entries(obj(run.totals)).map(([k,v])=>[k,money(new Decimal(v).negated())])))}});
   for(const line of run.lines){const snapshot=obj(line.snapshot),result={...snapshot.result};for(const key of ['basic','allowance','overtime','loan','otherDeductions','gross','deductions','net','employer','cost'])result[key]=money(new Decimal(result[key]).negated());result.explanation=`Linked reversal of ${id}. Every amount offsets the original immutable snapshot. Loan repayments are credited only when this reversal is finalised.`;await tx.payrollLine.create({data:{runId:reversal.id,employeeId:line.employeeId,period:line.period,currency:line.currency,snapshot:json({...snapshot,result,repayments:(snapshot.repayments??[]).map((r:any)=>({...r,amount:money(new Decimal(r.amount).negated())}))})}});}
   await audit(tx,c,'Linked payroll reversal created',reversal.id);return;
  }
  if(action==='mark-paid'){
   if(!canApprove(c.membership.role)||run.status!=='Finalised')denied();if(!reason?.trim())throw new PublicError(400,'Payment confirmation reference is required');
   if(run.paymentStatus==='Paid')return;
   await tx.record.create({data:{organisationId:c.org.id,module:'__payment_confirmations',title:id,status:'Confirmed',data:{reference:reason.trim().slice(0,1000),confirmedAt:new Date().toISOString(),confirmedBy:c.user.id,currency:run.currency,net:obj(run.totals).net}}});
   await tx.payrollRun.update({where:{id},data:{paymentStatus:'Paid'}});await audit(tx,c,'Payment reconciled',id);return;
  }
  if(action==='finalise'&&run.status==='Finalised'){if(!canApprove(c.membership.role))denied();return;}
  if(['calculate','submit'].includes(action)&&!canPrepare(c.membership.role))denied();
  if(['approve','reject','finalise'].includes(action)&&!canApprove(c.membership.role))denied();
  if(action==='approve'&&run.preparedBy===c.user.id)throw new PublicError(400,'A different user must approve this payroll');
  if(action==='reject'&&!reason?.trim())throw new PublicError(400,'A rejection reason is required');
  const status=transition(run.status,action);
  let totals:Prisma.InputJsonValue|Prisma.JsonValue=run.totals;
  if(action==='calculate'){
   if(run.kind==='Reversal')throw new PublicError(400,'A reversal preserves the original calculation and cannot be recalculated');
   if(run.kind==='Off-cycle')throw new PublicError(400,'Off-cycle adjustment inputs are not yet supported. Use a linked reversal to correct a finalised run.');
   const employees=await tx.employee.findMany({where:{organisationId:c.org.id,status:'Active',currency:run.currency},include:{salaries:{where:{effectiveFrom:{lte:`${run.period}-31`}},orderBy:{effectiveFrom:'desc'}}}});
   if(!employees.length)throw new PublicError(400,'No active employees in this currency');
   await tx.payrollLine.deleteMany({where:{runId:id}});
   const results:Calculation[]=[];
   const end=new Date(Number(run.period.slice(0,4)),Number(run.period.slice(5,7)),0).getDate();const endDate=`${run.period}-${end}`;const first=`${run.period}-01`;
   const days=workingDays(first,endDate,obj(c.org.settings).holidays??[]);
   for(const e of employees){
    if(e.startDate>endDate)continue;
    const salary=e.salaries.find(s=>s.frequency===run.frequency);if(!salary)throw new PublicError(400,`Missing effective salary for ${e.number}`);
    const records=await tx.record.findMany({where:{organisationId:c.org.id,employeeId:e.id}});
    const attendance=records.filter(r=>r.module==='Attendance'&&r.status==='Approved'&&String(obj(r.data).date).startsWith(run.period));
    const ot=attendance.reduce((s,r)=>s.plus(new Decimal(obj(r.data).overtimeHours||0).mul(obj(r.data).overtimeRate||0)),new Decimal(0));
    const unpaid=records.filter(r=>r.module==='Leave'&&r.status==='Approved'&&obj(r.data).type==='Unpaid'&&obj(r.data).startDate<=endDate&&obj(r.data).endDate>=first).reduce((s,r)=>{const l=obj(r.data);return s+workingDays(l.startDate<first?first:l.startDate,l.endDate>endDate?endDate:l.endDate,obj(c.org.settings).holidays??[])*(l.fraction==='Half day'?.5:1);},0);
    const loans=records.filter(r=>r.module==='Loans & Benefits'&&r.status==='Disbursed'&&obj(r.data).type!=='Benefit');
    const repayments=loans.map(l=>({id:l.id,amount:money(Decimal.min(obj(l.data).balance??0,obj(l.data).instalment??0))}));
    const repay=repayments.reduce((s,l)=>s.plus(l.amount),new Decimal(0)).toFixed(2);
    const result=calculateEffective({salaries:e.salaries.filter(s=>s.frequency===run.frequency).map(s=>({basic:s.basic.toString(),allowance:s.allowance.toString(),deduction:s.deduction.toString(),contribution:s.contribution.toString(),effectiveFrom:s.effectiveFrom})),period:run.period,employmentStart:e.startDate,holidays:obj(c.org.settings).holidays??[],unpaid:records.filter(r=>r.module==='Leave'&&r.status==='Approved'&&obj(r.data).type==='Unpaid').map(r=>({startDate:obj(r.data).startDate,endDate:obj(r.data).endDate,halfDay:obj(r.data).fraction==='Half day'})),overtime:ot.toString(),loan:repay,currency:run.currency});
    results.push(result);await tx.payrollLine.create({data:{runId:id,employeeId:e.id,period:run.period,currency:run.currency,snapshot:json({employee:{id:e.id,name:e.name,number:e.number,department:e.department,jobTitle:e.jobTitle,branch:e.branch},result,repayments})}});
   }
   if(!results.length)throw new PublicError(400,'No eligible employees');totals=json(sum(results));
  }
  if(action==='finalise'){
   if(c.org.mode!=='demo')throw new PublicError(400,'Live payroll is blocked: verified country-specific statutory rules have not been implemented');
   for(const line of run.lines){
    if(run.kind==='Regular')await tx.payrollLine.update({where:{id:line.id},data:{regularKey:`${c.org.id}:${line.employeeId}:${run.period}:${run.currency}`}});
    for(const repayment of obj(line.snapshot).repayments??[]){
     const loan=await tx.record.findFirst({where:{id:repayment.id,organisationId:c.org.id,module:'Loans & Benefits'}});if(!loan)throw new PublicError(400,'Loan no longer available');
     const data=obj(loan.data);const balance=new Decimal(data.balance).minus(repayment.amount);if(balance.isNegative())throw new PublicError(400,'Loan balance changed; recalculate the payroll');
     await tx.record.update({where:{id:loan.id},data:{data:json({...data,balance:balance.toFixed(2)}),status:balance.isZero()?'Closed':run.kind==='Reversal'?'Disbursed':loan.status,version:{increment:1}}});
    }
   }
  }
  await tx.payrollRun.update({where:{id},data:{status,totals:totals??undefined,...(action==='calculate'?{preparedBy:c.user.id}:{}),approvedBy:action==='approve'?c.user.id:action==='reject'?null:run.approvedBy,rejectionReason:action==='reject'?reason:null,version:{increment:1},...(action==='finalise'?{snapshot:json({organisation:{name:c.org.name,currency:run.currency},rules:{label:'Demo only — not approved for live payroll.',verified:false,source:'Manual demonstration components'},finalisedAt:new Date().toISOString(),lines:run.lines.map(l=>l.snapshot),totals:run.totals})}:{})}});
  await audit(tx,c,`Payroll ${action}`,id);
 });
}
