export const roles=['Administrator','HR Manager','Payroll Officer','Payroll Approver','Department Manager','Employee'] as const;
export type Role=typeof roles[number];
export const modules=['Dashboard','Employees','Recruitment','Onboarding','Attendance','Leave','Payroll','Payslips & Payments','Loans & Benefits','Performance','Training','Documents','Reports','Approvals','Settings'] as const;
const access:Record<Role,string[]>={Administrator:[...modules],'HR Manager':['Dashboard','Employees','Recruitment','Onboarding','Attendance','Leave','Performance','Training','Documents','Reports','Approvals'],'Payroll Officer':['Dashboard','Employees','Payroll','Payslips & Payments','Loans & Benefits','Reports','Documents'],'Payroll Approver':['Dashboard','Payroll','Payslips & Payments','Reports','Approvals'],'Department Manager':['Dashboard','Employees','Attendance','Leave','Onboarding','Performance','Training','Approvals'],Employee:['Dashboard','Employees','Attendance','Leave','Payslips & Payments','Loans & Benefits','Documents','Performance','Training','Onboarding']};
export function canView(role:string,module:string){return access[role as Role]?.includes(module)??false;}
export function canWrite(role:string,module:string){
 if(role==='Administrator')return true;
 if(role==='HR Manager')return ['Employees','Recruitment','Onboarding','Attendance','Leave','Performance','Training','Documents'].includes(module);
 if(role==='Payroll Officer')return ['Payroll','Loans & Benefits'].includes(module);
 if(role==='Department Manager')return ['Attendance','Leave','Onboarding','Performance','Training'].includes(module);
 if(role==='Employee')return ['Leave','Attendance','Loans & Benefits','Performance','Onboarding'].includes(module);
 return false;
}
export function canPrepare(role:string){return ['Administrator','Payroll Officer'].includes(role);}
export function canApprove(role:string){return ['Administrator','Payroll Approver'].includes(role);}
export function visibleEmployee(role:string,department:string|null,own:string|null,e:{id:string;department:string}){return role==='Employee'?e.id===own:role==='Department Manager'?e.department===department:true;}
