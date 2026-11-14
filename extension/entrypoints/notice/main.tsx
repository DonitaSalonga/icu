import React from 'react';
import ReactDOM from 'react-dom/client';
import { Notice } from './Notice';
import '../popup/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Notice />
  </React.StrictMode>,
);
