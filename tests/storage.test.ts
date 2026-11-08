import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {storeDocument,retrieveDocument,removeStoredDocument} from '../lib/document-storage';
test('local development attachments persist and can be removed without exposing a public path',async()=>{
 const previous={storage:process.env.DOCUMENT_STORAGE,directory:process.env.DOCUMENT_DIRECTORY,vercel:process.env.VERCEL};await mkdir('.local',{recursive:true});const directory=await mkdtemp(resolve('.local/storage-test-'));process.env.DOCUMENT_STORAGE='local';process.env.DOCUMENT_DIRECTORY=directory;delete process.env.VERCEL;
 try{const key=randomUUID(),bytes=Buffer.from('%PDF-1.4 fictional test file');assert.equal(await storeDocument('org-test',key,bytes,'application/pdf'),'local');assert.deepEqual(await retrieveDocument('org-test',key,'local'),bytes);await removeStoredDocument('org-test',key,'local');await assert.rejects(()=>retrieveDocument('org-test',key,'local'));}
 finally{for(const [key,value] of Object.entries({DOCUMENT_STORAGE:previous.storage,DOCUMENT_DIRECTORY:previous.directory,VERCEL:previous.vercel})){if(value===undefined)delete process.env[key];else process.env[key]=value;}if(!directory.startsWith(resolve('.local')+requireSeparator()))throw Error('Invalid test cleanup path');await rm(directory,{recursive:true,force:true});}
});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
test('Vercel cannot silently fall back to local document storage',async()=>{
 const previous={storage:process.env.DOCUMENT_STORAGE,vercel:process.env.VERCEL,token:process.env.BLOB_READ_WRITE_TOKEN};process.env.VERCEL='1';process.env.DOCUMENT_STORAGE='local';delete process.env.BLOB_READ_WRITE_TOKEN;
 try{await assert.rejects(()=>storeDocument('org-test',randomUUID(),Buffer.from('%PDF'),'application/pdf'),/requires private persistent Blob/);delete process.env.DOCUMENT_STORAGE;await assert.rejects(()=>storeDocument('org-test',randomUUID(),Buffer.from('%PDF'),'application/pdf'),/not configured/);await assert.rejects(()=>retrieveDocument('org-test',randomUUID(),'local'),/stored locally/);}
 finally{for(const [key,value] of Object.entries({DOCUMENT_STORAGE:previous.storage,VERCEL:previous.vercel,BLOB_READ_WRITE_TOKEN:previous.token})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
