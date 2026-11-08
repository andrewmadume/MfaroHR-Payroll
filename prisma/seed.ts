import 'dotenv/config';
import {hashPassword} from 'better-auth/crypto';
import {db} from '../lib/db';
import {demoData} from '../lib/seed-data';
const password=process.env.LOCAL_DEMO_PASSWORD;
if(process.env.APP_MODE!=='demo'||!password||password.length<12)throw Error('Seeding requires APP_MODE=demo and a LOCAL_DEMO_PASSWORD of at least 12 characters');
const data=demoData();
if(await db.organisation.findUnique({where:{id:data.organisation.id}})){console.log('Demo organisation already exists; no records overwritten');await db.$disconnect();process.exit(0);}
await db.$transaction(async tx=>{
 await tx.organisation.create({data:data.organisation});
 for(const [index,[key,role]] of [['admin','Administrator'],['hr','HR Manager'],['payroll','Payroll Officer'],['approver','Payroll Approver'],['manager','Department Manager'],['employee','Employee']].entries()){
  const id=`user-${key}`;await tx.user.create({data:{id,name:key==='admin'?'Tendai Moyo':key==='employee'?'Nyasha Ncube':`${role} Demo`,email:`${key}@mfaro.example`,emailVerified:true}});
  await tx.account.create({data:{id:`account-${key}`,accountId:id,providerId:'credential',userId:id,password:await hashPassword(password)}});
  await tx.membership.create({data:{userId:id,organisationId:data.organisation.id,role,employeeId:index===5?'emp-4':index===0?'emp-1':null,department:role==='Department Manager'?'Technology':null}});
 }
 for(const e of data.employees){const {salaries,...employee}=e;await tx.employee.create({data:employee});for(const s of salaries)await tx.salary.create({data:{...s,employeeId:e.id}});}
 for(const r of data.records)await tx.record.create({data:r});
 for(const r of data.runs){const {lines,snapshot,totals,...run}=r;await tx.payrollRun.create({data:{...run,...(snapshot?{snapshot,totals:totals!}:{})}});for(const l of lines)await tx.payrollLine.create({data:{...l,regularKey:`${data.organisation.id}:${l.employeeId}:${l.period}:USD`}});}
 await tx.audit.createMany({data:data.audits.map(a=>({...a,organisationId:data.organisation.id}))});
 await tx.organisation.create({data:{id:'org-isolation-test',name:'Isolation Test Organisation',currency:'USD',mode:'demo'}});
},{timeout:120000});
console.log('Seeded 18 fictional employees, six role accounts and complete demonstration records.');await db.$disconnect();
