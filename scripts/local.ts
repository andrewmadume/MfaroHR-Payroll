import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import dotenv from 'dotenv';
import {Client} from 'pg';
mkdirSync('.local',{recursive:true});
if(!existsSync('.env')){const password=randomBytes(24).toString('hex');const demo=randomBytes(14).toString('base64url')+'Aa1!';writeFileSync('.env',`DATABASE_URL=postgresql://mfaro:${password}@127.0.0.1:55432/mfaro\nBETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\nBETTER_AUTH_URL=http://localhost:3000\nAPP_MODE=demo\nLOCAL_DEMO_PASSWORD=${demo}\nDOCUMENT_DIRECTORY=.local/documents\n`);writeFileSync('.local/credentials.txt',`LOCAL DEMONSTRATION ONLY\nAccounts: admin, hr, payroll, approver, manager, employee @ mfaro.example\nPassword: ${demo}\n`);}
dotenv.config({quiet:true});
const url=new URL(process.env.DATABASE_URL!);
const platformPackage=`@embedded-postgres/${process.platform==='win32'?'windows':process.platform}-${process.arch}`;
const binaries=await import(platformPackage);
const pgCtl=resolve(dirname(binaries.postgres),process.platform==='win32'?'pg_ctl.exe':'pg_ctl');
class LocalPostgres extends EmbeddedPostgres {
 override async stop(){
  if(!existsSync('.local/postgres/postmaster.pid'))return;
  await new Promise<void>((ok,bad)=>{const p=spawn(pgCtl,['stop','-D',resolve('.local/postgres'),'-m','fast','-w','-t','15'],{stdio:'ignore',windowsHide:true});p.on('error',bad);p.on('exit',code=>code===0||!existsSync('.local/postgres/postmaster.pid')?ok():bad(Error('Could not stop the local PostgreSQL cluster gracefully')));});
 }
}
const pg=new LocalPostgres({databaseDir:resolve('.local/postgres'),port:Number(url.port),user:url.username,password:url.password,persistent:true,autoRehydrateSymlinks:true,initdbFlags:['--encoding=UTF8'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
if(!existsSync('.local/postgres/PG_VERSION'))await pg.initialise();
console.log('Starting the local PostgreSQL database…');
const starting=pg.start();
async function ready(){for(let attempt=0;attempt<40;attempt++){const check=new Client({host:'127.0.0.1',port:Number(url.port),user:url.username,password:url.password,database:'postgres',connectionTimeoutMillis:1000});try{await check.connect();await check.end();return;}catch{await check.end().catch(()=>{});await new Promise(r=>setTimeout(r,250));}}throw Error('PostgreSQL did not become ready within the startup timeout');}
await Promise.race([starting,ready()]);
console.log('PostgreSQL connection ready.');
const client=pg.getPgClient('postgres','127.0.0.1');await client.connect();
if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='mfaro'")).rowCount)await client.query("CREATE DATABASE mfaro TEMPLATE template0 ENCODING 'UTF8'");
await client.end();
const run=(args:string[])=>new Promise<void>((ok,bad)=>{const p=spawn(process.execPath,args,{stdio:'inherit',env:process.env});p.on('exit',c=>c===0?ok():bad(Error(`Command exited ${c}`)));});
try{
 if(process.argv[2]==='setup'){await run(['node_modules/prisma/build/index.js','generate']);await run(['node_modules/prisma/build/index.js','migrate','deploy']);await run(['node_modules/tsx/dist/cli.mjs','prisma/seed.ts']);console.log('Setup complete. Local credentials: .local/credentials.txt');}
 else{console.log('Mfaro local PostgreSQL is running. Sign-in details: .local/credentials.txt');await run(['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1']);}
}finally{await pg.stop();}
