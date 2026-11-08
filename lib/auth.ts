import {betterAuth} from 'better-auth';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {db} from './db';
export const auth=betterAuth({database:prismaAdapter(db,{provider:'postgresql'}),secret:process.env.BETTER_AUTH_SECRET,baseURL:process.env.BETTER_AUTH_URL,emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12},rateLimit:{enabled:true,window:60,max:30,storage:'database'},advanced:{useSecureCookies:process.env.BETTER_AUTH_URL?.startsWith('https:')??false},trustedOrigins:[process.env.BETTER_AUTH_URL??'http://localhost:3000']});
