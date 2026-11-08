import {context,guardOrigin,apiError} from '@/lib/context';
import {db} from '@/lib/db';
import {canView,canWrite} from '@/lib/permissions';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
async function record(c:Awaited<ReturnType<typeof context>>,id:string){if(!canView(c.membership.role,'Documents'))throw Error('403: Document access denied');const r=await db.record.findFirst({where:{id,organisationId:c.org.id,module:'Documents',...(c.membership.role==='Employee'?{employeeId:c.membership.employeeId??'none'}:{})}});if(!r)throw Error('404: Document not found');return r;}
export async function POST(request:Request){try{
 guardOrigin(request);const c=await context(request);if(!canWrite(c.membership.role,'Documents'))throw Error('403: Upload access denied');
 if(Number(request.headers.get('content-length')??0)>6*1024*1024)throw Error('Maximum file size is 5 MB');
 const form=await request.formData();const r=await record(c,String(form.get('id')));const file=form.get('file');if(!(file instanceof File)||file.size>5*1024*1024||file.size===0)throw Error('Choose a file between 1 byte and 5 MB');
 const data=new Uint8Array(await file.arrayBuffer());const hex=Buffer.from(data.subarray(0,8)).toString('hex');const type=hex.startsWith('25504446')?'application/pdf':hex.startsWith('89504e470d0a1a0a')?'image/png':hex.startsWith('ffd8ff')?'image/jpeg':null;if(!type)throw Error('Only PDF, PNG and JPEG files with valid signatures are accepted');
 const dir=resolve(process.env.DOCUMENT_DIRECTORY??'.local/documents');await mkdir(dir,{recursive:true});const key=randomUUID();await writeFile(join(dir,key),data,{flag:'wx'});
 await db.$transaction(async tx=>{await tx.record.update({where:{id:r.id},data:{data:{...(r.data as any),fileKey:key,fileName:file.name.slice(0,180),fileType:type,fileSize:file.size},version:{increment:1}}});await tx.audit.create({data:{organisationId:c.org.id,actorId:c.user.id,action:'Private document uploaded',entityId:r.id}});});return Response.json({ok:true});
 }catch(e){return apiError(e);}}
export async function GET(request:Request){try{const c=await context(request);const r=await record(c,new URL(request.url).searchParams.get('id')??'');const d=r.data as any;if(!/^[a-f0-9-]{36}$/.test(d.fileKey??''))throw Error('404: No file attached');const bytes=await readFile(join(resolve(process.env.DOCUMENT_DIRECTORY??'.local/documents'),d.fileKey));return new Response(bytes,{headers:{'Content-Type':d.fileType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return apiError(e);}}
