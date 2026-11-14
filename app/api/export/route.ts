import {context,apiError} from '@/lib/context';
import {employeeScope,recordScope} from '@/lib/service';
import {db} from '@/lib/db';
import {PublicError} from '@/lib/errors';
import {canView} from '@/lib/permissions';
import ExcelJS from 'exceljs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function GET(request:Request){try{
 const c=await context(request);const url=new URL(request.url);const module=url.searchParams.get('module')??'Employees';const format=url.searchParams.get('format')??'csv';if(!['csv','xlsx','pdf'].includes(format))throw new PublicError(400,'Unsupported export format');
 if(!canView(c.membership.role,module))throw Error('403: Export access denied');
 let rows:Record<string,any>[]=[];

 const limit=5000;
 const check=<T,>(items:T[])=>{if(items.length>limit)throw new PublicError(413,'Export exceeds 5000 rows. Narrow the department, period, currency or payroll run.');return items;};
 const department=url.searchParams.get('department')??undefined,currency=url.searchParams.get('currency')??undefined,period=url.searchParams.get('period')??undefined,runId=url.searchParams.get('run')??undefined;
 if(module==='Employees'){
  rows=check(await db.employee.findMany({where:{...employeeScope(c),...(department?{department}:{}),...(currency?{currency}:{})},orderBy:{id:'asc'},take:limit+1,select:{number:true,name:true,department:true,branch:true,jobTitle:true,status:true,currency:true}})).map(e=>({Number:e.number,Name:e.name,Department:e.department,Branch:e.branch,Title:e.jobTitle,Status:e.status,Currency:e.currency}));
 }else if(['Payroll','Payslips & Payments','Reports'].includes(module)){
  if(c.membership.role!=='Employee'&&!canView(c.membership.role,'Payroll'))throw new PublicError(403,'Payroll register access denied');
  rows=check(await db.payrollLine.findMany({where:{run:{organisationId:c.org.id,status:'Finalised',...(runId?{id:runId}:{}),...(period?{period}:{})},...(c.membership.role==='Employee'?{employeeId:c.membership.employeeId??'none'}:{}),...(currency?{currency}:{}),...(department?{snapshot:{path:['employee','department'],equals:department}}:{})},orderBy:{id:'asc'},take:limit+1,select:{period:true,currency:true,snapshot:true,run:{select:{paymentStatus:true}}}})).map(p=>{const snap=p.snapshot as any;return {Period:p.period,Employee:snap.employee.name,Department:snap.employee.department,Currency:p.currency,Gross:snap.result.gross,Deductions:snap.result.deductions,Net:snap.result.net,Employer:snap.result.employer,Payment:p.run.paymentStatus};});
 }else{
  const found=check(await db.record.findMany({where:{AND:[await recordScope(c,{module,department,limit:limit+1}),{module}]},orderBy:{id:'asc'},take:limit+1}));
  const names=await db.employee.findMany({where:{organisationId:c.org.id,id:{in:found.flatMap(r=>r.employeeId?[r.employeeId]:[])}},select:{id:true,name:true},take:limit});
  rows=found.map(r=>{const d=r.data as Record<string,any>;return {Title:r.title,Status:r.status,Employee:names.find(e=>e.id===r.employeeId)?.name??'',...d,bankAccount:undefined,fileKey:undefined,fileProvider:undefined};});
 }
 const filename=`mfaro-${module.replaceAll(' ','-').replaceAll('&','and')}.${format}`;
 if(format==='xlsx'){const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Mfaro export');sheet.columns=Object.keys(rows[0]??{Message:''}).map(k=>({header:k,key:k,width:24}));rows.forEach(r=>sheet.addRow(r));sheet.getRow(1).font={bold:true,color:{argb:'FF001B64'}};return new Response(new Uint8Array(await book.xlsx.writeBuffer()),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}"`}});}
 if(format==='pdf'){
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);let page=pdf.addPage([842,595]);let y=550;
  const add=(text:string,size=10)=>{const words=text.replace(/[^\x20-\x7E]/g,'?').split(' ');let line='';const draw=()=>{if(y<45){page=pdf.addPage([842,595]);y=550;}page.drawText(line,{x:40,y,size,font:size>13?bold:font,color:rgb(0,.106,.392)});y-=size+10;line='';};for(const word of words){if(font.widthOfTextAtSize(line+' '+word,size)>750&&line)draw();if(font.widthOfTextAtSize(word,size)>750){for(const ch of word){if(font.widthOfTextAtSize(line+ch,size)>750)draw();line+=ch;}}else line+=(line?' ':'')+word;}if(line)draw();};
  add('MFARO HR & PAYROLL',20);add(`${module} | ${c.org.name}`,14);add('DEMONSTRATION ONLY - NOT APPROVED FOR LIVE PAYROLL');rows.forEach(r=>{add(Object.entries(r).filter(([k,v])=>v!==undefined&&k!=='employeeId').map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' | '));});
  return new Response(new Uint8Array(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`}});
 }
 const keys=Object.keys(rows[0]??{Message:''});const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv=[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');
 return new Response('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`}});
 }catch(e){return apiError(e);}}
