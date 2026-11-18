import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import App from './App';
import '../shared/tema.css';
import './coord.css';
import './motion.css';
import './refinamento.css';
import './identidade.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
