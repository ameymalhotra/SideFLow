import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tailwind.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('SideFlow: root element #root not found');
}
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
