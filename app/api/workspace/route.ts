import {context,apiError,guardOrigin} from '@/lib/context';
import {state,saveEmployee,saveRecord,recordAction,createRun,payrollAction,audit} from '@/lib/service';
import {db} from '@/lib/db';
import {canWrite} from '@/lib/permissions';
export async function GET(request:Request){try{return Response.json(await state(await context(request)));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 guardOrigin(request);const c=await context(request);const b=await request.json();let id;
 switch(b.action){
 case 'notifications.read':{const ids=(await db.record.findMany({where:{organisationId:c.org.id,status:'Pending'}})).map(r=>r.id);const previous=await db.record.findFirst({where:{organisationId:c.org.id,module:'__notification_reads',title:c.user.id}});if(previous)await db.record.update({where:{id:previous.id},data:{data:{ids}}});else await db.record.create({data:{organisationId:c.org.id,module:'__notification_reads',title:c.user.id,status:'Read',data:{ids}}});break;}
 case 'employee.save':id=await saveEmployee(c,b.data,b.id);break;
 case 'employee.archive':{if(!canWrite(c.membership.role,'Employees'))throw Error('403: Access denied');const e=await db.employee.findFirst({where:{id:b.id,organisationId:c.org.id}});if(!e)throw Error('404: Employee not found');await db.$transaction(async tx=>{await tx.employee.update({where:{id:e.id},data:{status:'Archived'}});await tx.membership.deleteMany({where:{organisationId:c.org.id,employeeId:e.id}});await audit(tx,c,'Employee archived and membership revoked',e.id);});break;}
 case 'record.save':id=await saveRecord(c,b.module,b.title,b.data,b.id);break;
 case 'record.action':await recordAction(c,b.id,b.operation,b.reason);break;
 case 'payroll.create':id=await createRun(c,b.data);break;
 case 'payroll.action':await payrollAction(c,b.id,b.operation,b.reason);break;
 case 'settings.save':{if(c.membership.role!=='Administrator')throw Error('403: Access denied');const {name,timezone,currency}=b.data;if(typeof name!=='string'||name.length<2||!['USD','ZAR','ZWG'].includes(currency)||!['Africa/Harare','Africa/Johannesburg','UTC'].includes(timezone))throw Error('Invalid organisation settings');await db.$transaction(async tx=>{await tx.organisation.update({where:{id:c.org.id},data:{name:name.slice(0,120),timezone,currency}});await audit(tx,c,'Organisation settings updated',c.org.id);});break;}
 default:throw Error('Unknown action');
 }
 return Response.json({ok:true,id,state:await state(await context(request))});
 }catch(e){return apiError(e);}}
