import {context,guardOrigin,apiError} from '@/lib/context';
import {canWrite} from '@/lib/permissions';
import {db} from '@/lib/db';
import {z} from 'zod';
export async function POST(request:Request){try{
 guardOrigin(request);const c=await context(request);if(!canWrite(c.membership.role,'Employees'))throw Error('403: Import access denied');
 const b=await request.json();if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>200)throw Error('Provide 1–200 rows');
 const schema=z.object({name:z.string().min(2).max(120),email:z.email(),number:z.string().min(1).max(30),jobTitle:z.string().min(1),department:z.string().min(1),branch:z.string().min(1),startDate:z.iso.date(),effectiveFrom:z.iso.date(),currency:z.enum(['USD','ZAR','ZWG']),basic:z.coerce.number().min(0).max(100000000),allowance:z.coerce.number().min(0).default(0),deduction:z.coerce.number().min(0).default(0),contribution:z.coerce.number().min(0).default(0)});
 const errors:string[]=[],parsed:z.infer<typeof schema>[]=[];const seen=new Set<string>();const existing=await db.employee.findMany({where:{organisationId:c.org.id},select:{number:true}});const numbers=new Set(existing.map(e=>e.number));
 b.rows.forEach((row:unknown,i:number)=>{const r=schema.safeParse(row);if(!r.success){errors.push(`Row ${i+2}: ${r.error.issues.map(e=>e.path.join('.')+' '+e.message).join('; ')}`);return;}if(seen.has(r.data.number)||numbers.has(r.data.number))errors.push(`Row ${i+2}: Employee number ${r.data.number} already exists`);seen.add(r.data.number);parsed.push(r.data);});
 if(errors.length)return Response.json({errors},{status:400});
 if(b.save)await db.$transaction(async tx=>{for(const row of parsed){const {basic,allowance,deduction,contribution,effectiveFrom,...data}=row;const e=await tx.employee.create({data:{...data,organisationId:c.org.id}});await tx.salary.create({data:{employeeId:e.id,basic,allowance,deduction,contribution,effectiveFrom}});}await tx.audit.create({data:{organisationId:c.org.id,actorId:c.user.id,action:'Employee CSV import completed',entityId:c.org.id}});},{timeout:30000});
 return Response.json({ok:true,count:parsed.length});
 }catch(e){return apiError(e);}}
