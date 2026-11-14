import {PublicError} from '@/lib/errors';
import {readJson,throttleAction} from '@/lib/request-policy';
import {context,apiError,guardOrigin} from '@/lib/context';
import {state,runLines,recordScope,saveEmployee,saveRecord,recordAction,createRun,payrollAction,audit} from '@/lib/service';
import {db} from '@/lib/db';
import {canWrite} from '@/lib/permissions';
import {organisationMutation,invalidatePayroll} from '@/lib/mutation';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){try{const c=await context(request),p=new URL(request.url).searchParams;for(const value of p.values())if(value.length>128)throw new PublicError(400,'Invalid pagination cursor');return Response.json(p.has('runId')?await runLines(c,p.get('runId')!,p.get('after')??undefined):await state(c,Object.fromEntries(['employees','records','runs','payslips'].map(k=>[k,p.get(k)??undefined]))),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 guardOrigin(request);const c=await context(request);await throttleAction(c.user.id,c.org.id);const b=await readJson(request);let id;
 switch(b.action){
 case 'notifications.read':{const ids=(await db.record.findMany({where:{AND:[await recordScope(c,{limit:1000}),{status:'Pending'}]},take:1000,select:{id:true}})).map(r=>r.id);const previous=await db.record.findFirst({where:{organisationId:c.org.id,module:'__notification_reads',title:c.user.id}});if(previous)await db.record.update({where:{id:previous.id},data:{data:{ids}}});else await db.record.create({data:{organisationId:c.org.id,module:'__notification_reads',title:c.user.id,status:'Read',data:{ids}}});break;}
 case 'employee.save':id=await saveEmployee(c,b.data,b.id);break;
 case 'employee.archive':{if(!canWrite(c.membership.role,'Employees'))throw new PublicError(400,'403: Access denied');await organisationMutation(c.org.id,async tx=>{const e=await tx.employee.findFirst({where:{id:b.id,organisationId:c.org.id}});if(!e)throw new PublicError(400,'404: Employee not found');await tx.employee.update({where:{id:e.id},data:{status:'Archived'}});await tx.membership.deleteMany({where:{organisationId:c.org.id,employeeId:e.id}});await invalidatePayroll(tx,c.org.id);await audit(tx,c,'Employee archived and membership revoked',e.id);});break;}
 case 'record.save':id=await saveRecord(c,b.module,b.title,b.data,b.id,b.version);break;
 case 'record.action':await recordAction(c,b.id,b.operation,b.reason);break;
 case 'payroll.create':id=await createRun(c,b.data);break;
 case 'payroll.action':await payrollAction(c,b.id,b.operation,b.reason);break;
 case 'settings.save':{if(c.membership.role!=='Administrator')throw new PublicError(400,'403: Access denied');const {name,timezone,currency}=b.data;if(typeof name!=='string'||name.length<2||!['USD','ZAR','ZWG'].includes(currency)||!['Africa/Harare','Africa/Johannesburg','UTC'].includes(timezone))throw new PublicError(400,'Invalid organisation settings');await db.$transaction(async tx=>{await tx.organisation.update({where:{id:c.org.id},data:{name:name.slice(0,120),timezone,currency}});await audit(tx,c,'Organisation settings updated',c.org.id);});break;}
 default:throw new PublicError(400,'Unknown action');
 }
 return Response.json({ok:true,id,state:await state(await context(request))});
 }catch(e){return apiError(e);}}
