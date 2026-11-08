import Decimal from 'decimal.js';
Decimal.set({precision:32,rounding:Decimal.ROUND_HALF_UP});
export type SalaryInput={basic:string;allowance:string;deduction:string;contribution:string;effectiveFrom:string;frequency?:string};
export type CalculationInput={salary:SalaryInput;period:string;workingDays:number;payableDays:number;overtimeHours:string;overtimeRate:string;unpaidDays:number;loanBalance:string;loanInstalment:string;currency:string};
const d=(x:string|number)=>new Decimal(x);
export const money=(x:Decimal.Value)=>new Decimal(x).toDecimalPlaces(2).toFixed(2);
export function calculate(i:CalculationInput){
  if(!/^\d{4}-\d{2}$/.test(i.period)||i.salary.effectiveFrom>`${i.period}-31`)throw Error('No effective salary for this period');
  if(i.workingDays<=0||i.payableDays<0||i.payableDays>i.workingDays||i.unpaidDays<0||i.unpaidDays>i.payableDays)throw Error('Invalid proration days');
  for(const x of [i.salary.basic,i.salary.allowance,i.salary.deduction,i.salary.contribution,i.overtimeHours,i.overtimeRate,i.loanBalance,i.loanInstalment])if(!d(x).isFinite()||d(x).isNegative())throw Error('Amounts must be finite and non-negative');
  const factor=d(i.payableDays).minus(i.unpaidDays).div(i.workingDays);
  const basic=money(d(i.salary.basic).mul(factor)), allowance=money(d(i.salary.allowance).mul(factor));
  const overtime=money(d(i.overtimeHours).mul(i.overtimeRate));
  const gross=money(d(basic).plus(allowance).plus(overtime));
  const loan=money(Decimal.min(d(i.loanBalance),d(i.loanInstalment)));
  const deductions=money(d(i.salary.deduction).plus(loan));
  const net=money(d(gross).minus(deductions));
  if(d(net).isNegative())throw Error('Negative net pay: resolve deductions before continuing');
  const employer=money(i.salary.contribution);
  return {currency:i.currency,basic,allowance,overtime,loan,otherDeductions:money(i.salary.deduction),gross,deductions,net,employer,cost:money(d(gross).plus(employer)),inputs:i,explanation:`Basic and allowance × (${i.payableDays} − ${i.unpaidDays}) / ${i.workingDays}; approved overtime ${i.overtimeHours} × ${i.overtimeRate}. Each line rounded half-up to 2 decimal places. Demo deductions are manually configured; no statutory tax calculated.`};
}
export type Calculation=ReturnType<typeof calculate>;
export function calculateEffective(input:{salaries:SalaryInput[];period:string;employmentStart:string;holidays?:string[];unpaid:{startDate:string;endDate:string;halfDay?:boolean}[];overtime:string;loan:string;currency:string}){
 const first=input.period+'-01';const end=new Date(Date.UTC(Number(input.period.slice(0,4)),Number(input.period.slice(5,7)),0)).toISOString().slice(0,10);
 const start=input.employmentStart>first?input.employmentStart:first;const days=workingDays(first,end,input.holidays);const salaries=input.salaries.filter(s=>s.effectiveFrom<=end).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 if(!salaries.some(s=>s.effectiveFrom<=start))throw Error('Missing effective salary at the beginning of employment or payroll period');
 let basic=d(0),allowance=d(0);const segments:Record<string,unknown>[]=[];
 for(let n=0;n<salaries.length;n++){
  const salary=salaries[n];const from=salary.effectiveFrom>start?salary.effectiveFrom:start;const next=salaries[n+1]?.effectiveFrom;const to=next?new Date(new Date(next+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10):end;if(from>to||to<start)continue;
  const payable=workingDays(from,to,input.holidays);let unpaid=0;
  for(const leave of input.unpaid){const a=leave.startDate>from?leave.startDate:from,b=leave.endDate<to?leave.endDate:to;if(a<=b)unpaid+=workingDays(a,b,input.holidays)*(leave.halfDay?.5:1);}
  if(unpaid>payable)throw Error('Unpaid leave exceeds payable days');
  basic=basic.plus(d(salary.basic).mul(payable-unpaid).div(days));allowance=allowance.plus(d(salary.allowance).mul(payable-unpaid).div(days));
  segments.push({from,to,basicRate:salary.basic,allowanceRate:salary.allowance,workingDays:payable,unpaidDays:unpaid,periodWorkingDays:days});
 }
 const latest=salaries.at(-1)!;
 const result=calculate({salary:{...latest,basic:basic.toFixed(8),allowance:allowance.toFixed(8)},period:input.period,workingDays:days,payableDays:days,unpaidDays:0,overtimeHours:'1',overtimeRate:input.overtime,loanBalance:input.loan,loanInstalment:input.loan,currency:input.currency});
 return {...result,segments,explanation:`Effective-dated basic and allowances are prorated per salary segment, excluding approved unpaid working days and configured holidays. Segment values are summed at full decimal precision and rounded half-up once to 2 decimals. Other deductions and employer contributions are fixed period amounts from the latest effective salary. ${segments.map(s=>`${s.from} to ${s.to}: (${s.workingDays} - ${s.unpaidDays}) / ${days} days at basic ${s.basicRate} and allowance ${s.allowanceRate}`).join('; ')}. Approved overtime total ${input.overtime}. Demo only; no statutory tax calculated.`};
}
export function sum(lines:Calculation[]){
  if(new Set(lines.map(l=>l.currency)).size>1)throw Error('Mixed currencies cannot be aggregated');
  return Object.fromEntries(['gross','deductions','net','employer','cost'].map(k=>[k,money(lines.reduce((v,l)=>v.plus(l[k as keyof Calculation] as string),d(0)))]));
}
export function workingDays(start:string,end:string,holidays:string[]=[]){
  const s=new Date(start+'T00:00:00Z'),e=new Date(end+'T00:00:00Z');
  if(!Number.isFinite(+s)||!Number.isFinite(+e)||s>e||(+e-+s)>366*86400000)throw Error('Invalid date range (maximum one year)');
  let days=0;for(let t=+s;t<=+e;t+=86400000){const date=new Date(t);if(date.getUTCDay()!==0&&date.getUTCDay()!==6&&!holidays.includes(date.toISOString().slice(0,10)))days++;}return days;
}
export function overlaps(start:string,end:string,otherStart:string,otherEnd:string){return start<=otherEnd&&end>=otherStart;}
export function transition(status:string,action:string){
  const transitions:Record<string,Record<string,string>>={Draft:{calculate:'Calculated'},Calculated:{calculate:'Calculated',submit:'Submitted for Review'},'Submitted for Review':{approve:'Approved',reject:'Calculated'},Approved:{finalise:'Finalised'}};
  const next=transitions[status]?.[action];if(!next)throw Error(`Cannot ${action} a ${status} run`);return next;
}
