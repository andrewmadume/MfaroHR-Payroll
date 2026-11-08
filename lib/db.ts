import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
const globalDb=globalThis as unknown as {mfaroDb?:PrismaClient};
export const db=globalDb.mfaroDb??new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true})});
globalDb.mfaroDb=db;
