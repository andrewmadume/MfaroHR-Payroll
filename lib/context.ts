import {headers} from 'next/headers';
import {auth} from './auth';
import {db} from './db';
import {PublicError} from './errors';
import {randomUUID} from 'node:crypto';
import {ZodError} from 'zod';
export async function context(request?:Request){
 const h=request?.headers??await headers();
 const session=await auth.api.getSession({headers:h});if(!session)throw new Error('401: Sign in to continue');
 const org=h.get('x-organisation-id');
 const membership=await db.membership.findFirst({where:{userId:session.user.id,...(org?{organisationId:org}:{})},include:{organisation:true}});
 if(!membership)throw Error('403: Organisation access denied');
 return {user:session.user,membership,org:membership.organisation};
}
export function guardOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin&&origin!==process.env.BETTER_AUTH_URL)throw Error('403: Cross-origin action rejected');}
export function apiError(error:unknown){
 const message=error instanceof Error?error.message:'';
 const prefix=message.match(/^(401|403|404):\s*(.*)$/);
 if(prefix)return Response.json({error:prefix[2]},{status:Number(prefix[1]),headers:{'Cache-Control':'private, no-store'}});
 if(error instanceof PublicError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store',...(error.status===429?{'Retry-After':'60'}:{})}});
 if(error instanceof ZodError||error instanceof SyntaxError)return Response.json({error:'Invalid request values. Check the form and try again.'},{status:400});
 const code=(error as {code?:string})?.code;
 if(code==='P2002'||code==='P2034')return Response.json({error:'The record changed or already exists. Refresh and try again.'},{status:409});
 if(code==='P2025')return Response.json({error:'Record not found'},{status:404});
 const requestId=randomUUID();
 console.error('Request failed',{requestId,type:error instanceof Error?error.name:'Unknown',code});
 return Response.json({error:'An internal error occurred. Please try again.',requestId},{status:500,headers:{'Cache-Control':'private, no-store'}});
}
