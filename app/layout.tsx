import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Mfaro HR & Payroll',description:'People managed. Payroll simplified. A connected workspace for your people and payroll.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
