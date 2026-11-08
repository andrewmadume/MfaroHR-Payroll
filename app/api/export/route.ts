import {context,apiError} from '@/lib/context';
import {state} from '@/lib/service';
import {canView} from '@/lib/permissions';
import ExcelJS from 'exceljs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function GET(request:Request){try{
 const c=await context(request);const url=new URL(request.url);const module=url.searchParams.get('module')??'Employees';const format=url.searchParams.get('format')??'csv';
 if(!canView(c.membership.role,module))throw Error('403: Export access denied');
 const s=await state(c) as any;let rows:Record<string,any>[]=[];
 if(module==='Employees')rows=s.employees.map((e:any)=>({Number:e.number,Name:e.name,Department:e.department,Branch:e.branch,Title:e.jobTitle,Status:e.status,Currency:e.currency}));
 else if(['Payroll','Payslips & Payments','Reports'].includes(module)){
  if(c.membership.role==='Employee'){rows=s.payslips.map((p:any)=>({Period:p.period,Employee:p.snapshot.employee.name,Currency:p.currency,Gross:p.snapshot.result.gross,Deductions:p.snapshot.result.deductions,Net:p.snapshot.result.net}));}
  else rows=s.runs.filter((r:any)=>r.status==='Finalised'&&(!url.searchParams.get('run')||r.id===url.searchParams.get('run'))).flatMap((r:any)=>r.lines.map((l:any)=>({Period:r.period,Employee:l.snapshot.employee.name,Department:l.snapshot.employee.department,Currency:r.currency,Gross:l.snapshot.result.gross,Deductions:l.snapshot.result.deductions,Net:l.snapshot.result.net,Employer:l.snapshot.result.employer,Payment:r.paymentStatus})));
 }else rows=s.records.filter((r:any)=>r.module===module).map((r:any)=>({Title:r.title,Status:r.status,Employee:s.employees.find((e:any)=>e.id===r.employeeId)?.name??'',...r.data,bankAccount:undefined}));
 const department=url.searchParams.get('department'),currency=url.searchParams.get('currency'),period=url.searchParams.get('period');if(department)rows=rows.filter(r=>r.Department===department);if(currency)rows=rows.filter(r=>r.Currency===currency);if(period)rows=rows.filter(r=>r.Period===period);
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
