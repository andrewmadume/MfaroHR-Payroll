import {Prisma} from '@prisma/client';
import {db} from './db';
// All changes to payroll inputs use this same lock as payroll processing.
export async function organisationMutation<T>(organisationId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organisationId}))`;
  return work(tx);
 },{isolationLevel:'ReadCommitted',timeout:30000});
}
export async function invalidatePayroll(tx:Prisma.TransactionClient,organisationId:string){
 await tx.payrollRun.updateMany({where:{organisationId,status:{in:['Calculated','Submitted for Review','Approved']},kind:{not:'Reversal'}},data:{status:'Draft',approvedBy:null,version:{increment:1}}});
}
