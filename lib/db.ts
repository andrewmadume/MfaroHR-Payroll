import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {databaseConnection} from './database-connection';
const globalDb=globalThis as unknown as {mfaroDb?:PrismaClient};
export const db=globalDb.mfaroDb??new PrismaClient({adapter:new PrismaPg({...databaseConnection(process.env.DATABASE_URL,process.env.DATABASE_SSL_CA),max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true})});
globalDb.mfaroDb=db;
