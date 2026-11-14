import {PublicError} from './errors';
import {schemas} from './modules';
const transitions:Record<string,Record<string,Record<string,string>>>={
 Attendance:{Pending:{approve:'Approved',reject:'Rejected'}},
 Leave:{Pending:{approve:'Approved',reject:'Rejected',cancel:'Cancelled'},Approved:{cancel:'Cancelled'}},
 'Loans & Benefits':{Pending:{approve:'Approved',reject:'Rejected',cancel:'Cancelled'},Approved:{disburse:'Disbursed',cancel:'Cancelled'}},
 Onboarding:{'To do':{start:'In progress',complete:'Completed'},'In progress':{complete:'Completed'}},
 Performance:{Draft:{start:'In progress',complete:'Completed'},'In progress':{complete:'Completed'}},
 Training:{Scheduled:{start:'In progress',complete:'Completed'},'In progress':{complete:'Completed'}},
 Documents:{Active:{archive:'Archived'},Pending:{approve:'Approved',reject:'Rejected'}},
};
export function recordTransition(module:string,status:string,action:string){
 if(module==='Recruitment'&&action.startsWith('stage:')&&!['Hired','Closed'].includes(status)&&schemas.Recruitment.statuses.includes(action.slice(6)))return action.slice(6);
 const next=transitions[module]?.[status]?.[action];
 if(!next)throw new PublicError(409,`Cannot ${action} a ${status} ${module} record`);
 return next;
}
