export const LOCAL_DOCUMENT_LIMIT=5*1024*1024;
export const VERCEL_DOCUMENT_LIMIT=4*1024*1024;
export function documentLimit(vercel=process.env.VERCEL==='1'){return vercel?VERCEL_DOCUMENT_LIMIT:LOCAL_DOCUMENT_LIMIT;}
export function inspectDocument(data:Uint8Array,limit=documentLimit()){
 if(!data.byteLength||data.byteLength>limit)throw Error(`Choose a file between 1 byte and ${limit/1024/1024} MB`);
 const hex=Buffer.from(data.subarray(0,8)).toString('hex');
 const type=hex.startsWith('25504446')?'application/pdf':hex.startsWith('89504e470d0a1a0a')?'image/png':hex.startsWith('ffd8ff')?'image/jpeg':null;
 if(!type)throw Error('Only PDF, PNG and JPEG files with valid signatures are accepted');return type;
}
export function documentPath(organisationId:string,key:string){
 if(!organisationId||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)))throw Error('Invalid document reference');
 return `mfaro/${encodeURIComponent(organisationId)}/${key}`;
}
