import {betterAuth} from 'better-auth';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {db} from './db';
const baseURL=process.env.BETTER_AUTH_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:'http://localhost:3000');
export const auth=betterAuth({database:prismaAdapter(db,{provider:'postgresql'}),secret:process.env.BETTER_AUTH_SECRET,baseURL,emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12},rateLimit:{enabled:true,window:60,max:30,storage:'database'},advanced:{useSecureCookies:baseURL.startsWith('https:')},trustedOrigins:[baseURL]});
