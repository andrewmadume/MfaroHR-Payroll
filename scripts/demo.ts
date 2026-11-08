import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {webpack}=require('next/dist/compiled/webpack/webpack');
mkdirSync('dist',{recursive:true});
await new Promise<void>((ok,bad)=>webpack({
 mode:'production',context:process.cwd(),entry:resolve('scripts/demo-entry.tsx'),
 output:{path:resolve('dist'),filename:'app.js'},optimization:{minimize:false},
 resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':process.cwd()}},
 module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[{loader:resolve('scripts/typescript-loader.cjs')}]}]}
},(err:Error,stats:any)=>{if(err)bad(err);else if(stats.hasErrors())bad(Error(stats.toString({all:false,errors:true})));else ok();}));
const raw=readFileSync('app/globals.css','utf8').replace("@import 'tailwindcss';",'').replace("@source '../components';",'');writeFileSync('dist/app.css',raw);
copyFileSync('public/mfaro-hr-logo.png','dist/mfaro-hr-logo.png');
writeFileSync('dist/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mfaro HR & Payroll · Product Tour</title><meta name="description" content="Explore the Mfaro HR & Payroll workspace with fictional demonstration data."><link rel="stylesheet" href="./app.css"><link rel="icon" href="./mfaro-hr-logo.png"></head><body><div id="root"></div><script src="./app.js" defer></script></body></html>');
console.log('Read-only product tour built in dist/');
