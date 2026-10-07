import { createRoot } from 'react-dom/client';
import tokens from '../../design/design-tokens.json';
import { App } from './App';
import './style.css';

for (const [key, value] of Object.entries(tokens.colors)) if (typeof value === 'string') document.documentElement.style.setProperty(`--md-${key}`, value);
for (const [key, value] of Object.entries(tokens.colors.money)) document.documentElement.style.setProperty(`--money-${key}`, value);
document.documentElement.style.setProperty('--font-sans', tokens.typography.fontFamily.sans);
document.documentElement.style.setProperty('--font-mono', tokens.typography.fontFamily.mono);
createRoot(document.getElementById('root')!).render(<App />);
