import React from 'react';
import ReactDOM from 'react-dom/client';
import { PillView } from './components/PillView';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PillView />
  </React.StrictMode>,
);
