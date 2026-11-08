import {headers} from 'next/headers';
import {auth} from './auth';
import {db} from './db';
export async function context(request?:Request){
 const h=request?.headers??await headers();
 const session=await auth.api.getSession({headers:h});if(!session)throw new Error('401: Sign in to continue');
 const org=h.get('x-organisation-id');
 const membership=await db.membership.findFirst({where:{userId:session.user.id,...(org?{organisationId:org}:{})},include:{organisation:true}});
 if(!membership)throw Error('403: Organisation access denied');
 return {user:session.user,membership,org:membership.organisation};
}
export function guardOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin&&origin!==process.env.BETTER_AUTH_URL)throw Error('403: Cross-origin action rejected');}
export function apiError(error:unknown){const message=error instanceof Error?error.message:'Request failed';const status=message.startsWith('401:')?401:message.startsWith('403:')?403:message.startsWith('404:')?404:400;return Response.json({error:message.includes('Invalid `')?'The record could not be saved. Check your values and try again.':message},{status});}
