import React from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from '../components/workspace';
import {demoData} from '../lib/seed-data';
createRoot(document.getElementById('root')!).render(<Workspace demoState={demoData()}/>);
