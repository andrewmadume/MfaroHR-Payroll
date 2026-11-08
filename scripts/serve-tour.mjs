import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('dist');
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep))throw Error('Forbidden');const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'}[extname(path)]??'application/octet-stream')});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(3001,'127.0.0.1',()=>console.log('Mfaro tour: http://127.0.0.1:3001'));
