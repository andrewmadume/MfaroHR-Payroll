import {context,guardOrigin,apiError} from '@/lib/context';
import {db} from '@/lib/db';
import {canView,canWrite} from '@/lib/permissions';
import {randomUUID} from 'node:crypto';
import {documentLimit,inspectDocument} from '@/lib/document-policy';
import {storeDocument,retrieveDocument,removeStoredDocument,DocumentProvider} from '@/lib/document-storage';
export const runtime='nodejs';
export const maxDuration=60;
async function record(c:Awaited<ReturnType<typeof context>>,id:string){if(!canView(c.membership.role,'Documents'))throw Error('403: Document access denied');const r=await db.record.findFirst({where:{id,organisationId:c.org.id,module:'Documents',...(c.membership.role==='Employee'?{employeeId:c.membership.employeeId??'none'}:{})}});if(!r)throw Error('404: Document not found');return r;}
export async function POST(request:Request){try{
 guardOrigin(request);const c=await context(request);if(!canWrite(c.membership.role,'Documents'))throw Error('403: Upload access denied');
 const limit=documentLimit();if(Number(request.headers.get('content-length')??0)>limit+128*1024)throw Error(`Maximum document size is ${limit/1024/1024} MB`);
 const form=await request.formData();const r=await record(c,String(form.get('id')));const file=form.get('file');if(!(file instanceof File)||file.size>limit||file.size===0)throw Error(`Choose a file between 1 byte and ${limit/1024/1024} MB`);
 const data=new Uint8Array(await file.arrayBuffer());const type=inspectDocument(data,limit);const key=randomUUID();const storage=await storeDocument(c.org.id,key,data,type);
 try{await db.$transaction(async tx=>{const changed=await tx.record.updateMany({where:{id:r.id,organisationId:c.org.id,version:r.version},data:{data:{...(r.data as any),fileKey:key,fileProvider:storage,fileName:file.name.slice(0,180),fileType:type,fileSize:file.size},version:{increment:1}}});if(changed.count!==1)throw Error('Document changed; refresh and retry the upload');await tx.audit.create({data:{organisationId:c.org.id,actorId:c.user.id,action:'Private document uploaded',entityId:r.id}});});}
 catch(e){await removeStoredDocument(c.org.id,key,storage).catch(()=>{});throw e;}
 const previous=r.data as any;if(previous.fileKey&&['local','vercel-blob'].includes(previous.fileProvider??'local'))await removeStoredDocument(c.org.id,previous.fileKey,previous.fileProvider??'local').catch(()=>{});
 return Response.json({ok:true});
 }catch(e){return apiError(e);}}
export async function GET(request:Request){try{const c=await context(request);const r=await record(c,new URL(request.url).searchParams.get('id')??'');const d=r.data as any;if(!/^[a-f0-9-]{36}$/.test(d.fileKey??'')||!['local','vercel-blob'].includes(d.fileProvider??'local'))throw Error('404: No file attached');const bytes=await retrieveDocument(c.org.id,d.fileKey,(d.fileProvider??'local') as DocumentProvider);return new Response(bytes,{headers:{'Content-Type':d.fileType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return apiError(e);}}
