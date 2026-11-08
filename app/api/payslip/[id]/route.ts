import {context,apiError} from '@/lib/context';
import {db} from '@/lib/db';
import {canView} from '@/lib/permissions';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const c=await context(request);if(!canView(c.membership.role,'Payslips & Payments'))throw Error('403: Access denied');const {id}=await params;
 const line=await db.payrollLine.findFirst({where:{id,run:{organisationId:c.org.id,status:'Finalised'},...(c.membership.role==='Employee'?{employeeId:c.membership.employeeId??'none'}:{})},include:{run:true}});if(!line)throw Error('404: Payslip not found');
 const snapshot=line.snapshot as any;const {employee:e,result:r}=snapshot;const org=(line.run.snapshot as any).organisation;
 const pdf=await PDFDocument.create();const page=pdf.addPage([595.28,841.89]);const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);const navy=rgb(0,.106,.392);const text=(s:string,x:number,y:number,size=11,b=false)=>page.drawText(s.replace(/[^\x20-\x7E]/g,'?'),{x,y,size,font:b?bold:font,color:navy});
 page.drawRectangle({x:0,y:735,width:596,height:107,color:navy});page.drawText('Mfaro HR & Payroll',{x:42,y:795,size:23,font:bold,color:rgb(1,1,1)});page.drawText('PEOPLE MANAGED. PAYROLL SIMPLIFIED.',{x:42,y:770,size:9,font,color:rgb(1,1,1)});
 text('PAYSLIP',42,700,18,true);text(org.name,42,676);text(`Reference: ${line.id}`,42,652,9);text(`${e.name} | ${e.number}`,42,615,13,true);text(`${e.department} | ${e.jobTitle}`,42,593);text(`Period: ${line.period}  |  Currency: ${line.currency}`,42,563);text('Payment date: not scheduled',42,543);
 const rows=[['EARNINGS',''],['Basic salary',r.basic],['Allowances',r.allowance],['Approved overtime',r.overtime],['Gross earnings',r.gross],['DEDUCTIONS',''],['Other employee deductions',r.otherDeductions],['Loan repayment',r.loan],['Total deductions',r.deductions],['NET PAY',r.net],['Employer contributions (separate)',r.employer],['Total employer cost',r.cost]];let y=505;
 for(const [label,value] of rows){if(label==='NET PAY')page.drawRectangle({x:32,y:y-9,width:531,height:29,color:rgb(.88,.95,1)});text(label,42,y,11,['NET PAY','EARNINGS','DEDUCTIONS'].includes(label));if(value)text(`${line.currency} ${Number(value).toLocaleString('en-US',{minimumFractionDigits:2})}`,414,y,11,label==='NET PAY');y-=27;}
 const ytd=await db.payrollLine.findMany({where:{employeeId:line.employeeId,run:{organisationId:c.org.id,status:'Finalised',currency:line.currency,period:{gte:line.period.slice(0,4)+'-01',lte:line.period}}}});const net=ytd.reduce((s,l)=>s+Math.round(Number((l.snapshot as any).result.net)*100),0)/100;
 text(`Year-to-date net pay: ${line.currency} ${net.toFixed(2)}`,42,145,10);text('Demo only - not approved for live payroll.',42,105,10,true);text('No verified country-specific tax or statutory calculations are included.',42,86,9);
 return new Response(new Uint8Array(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Mfaro-${e.number}-${line.period}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(e){return apiError(e);}}
