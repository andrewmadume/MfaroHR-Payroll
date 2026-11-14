import {randomUUID} from 'node:crypto';
import {db} from './db';
import {PublicError} from './errors';
export async function readJson(request:Request,limit=256*1024){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new PublicError(415,'Use application/json');
 if(Number(request.headers.get('content-length')??0)>limit)throw new PublicError(413,'Request is too large');
 const reader=request.body?.getReader();if(!reader)throw new PublicError(400,'A request body is required');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new PublicError(413,'Request is too large');}chunks.push(value);}}finally{reader.releaseLock();}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new PublicError(400,'A JSON object is required');return value;
}
// One durable counter per member/organization, shared by all business POST routes.
export async function throttleAction(userId:string,organisationId:string){
 const now=BigInt(Date.now()),key=`business:${organisationId}:${userId}`;
 const rows=await db.$queryRaw<{count:number}[]>`INSERT INTO public."rateLimit" (id,key,count,"lastRequest") VALUES (${randomUUID()},${key},1,${now}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN public."rateLimit"."lastRequest" < ${now-60000n} THEN 1 ELSE public."rateLimit".count+1 END,"lastRequest"=CASE WHEN public."rateLimit"."lastRequest" < ${now-60000n} THEN ${now} ELSE public."rateLimit"."lastRequest" END WHERE public."rateLimit"."lastRequest" < ${now-60000n} OR public."rateLimit".count < 60 RETURNING count`;
 if(!rows.length)throw new PublicError(429,'Too many actions. Wait a minute and try again.');
}
