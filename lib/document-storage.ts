import {get,put,del} from '@vercel/blob';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {documentPath} from './document-policy';
export type DocumentProvider='local'|'vercel-blob';
function provider():DocumentProvider{
 const configured=process.env.DOCUMENT_STORAGE;
 if(configured&&configured!=='local'&&configured!=='vercel-blob')throw Error('Invalid document storage configuration');
 if(process.env.VERCEL==='1'&&configured==='local')throw Error('Vercel requires private persistent Blob storage for documents');
 return configured==='vercel-blob'||process.env.VERCEL==='1'?'vercel-blob':'local';
}
function blobToken(){const token=process.env.BLOB_READ_WRITE_TOKEN;if(!token)throw Error('Private document storage is not configured');return token;}
export async function storeDocument(organisationId:string,key:string,bytes:Uint8Array,type:string):Promise<DocumentProvider>{
 const path=documentPath(organisationId,key);const target=provider();
 if(target==='vercel-blob'){await put(path,Buffer.from(bytes),{access:'private',contentType:type,addRandomSuffix:false,token:blobToken()});}
 else{const dir=resolve(process.env.DOCUMENT_DIRECTORY??'.local/documents');await mkdir(dir,{recursive:true});await writeFile(join(dir,key),bytes,{flag:'wx'});}
 return target;
}
export async function retrieveDocument(organisationId:string,key:string,storedProvider:DocumentProvider='local'){
 const path=documentPath(organisationId,key);
 if(storedProvider==='vercel-blob'){const result=await get(path,{access:'private',token:blobToken()});if(!result||result.statusCode!==200)throw Error('404: Document file not found');return result.stream;}
 if(process.env.VERCEL==='1')throw Error('This attachment was stored locally. Migrate the file into private Blob storage before downloading it on Vercel.');
 return readFile(join(resolve(process.env.DOCUMENT_DIRECTORY??'.local/documents'),key));
}
export async function removeStoredDocument(organisationId:string,key:string,storedProvider:DocumentProvider){
 const path=documentPath(organisationId,key);
 if(storedProvider==='vercel-blob')await del(path,{token:blobToken()});
 else if(process.env.VERCEL!=='1')await unlink(join(resolve(process.env.DOCUMENT_DIRECTORY??'.local/documents'),key)).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
