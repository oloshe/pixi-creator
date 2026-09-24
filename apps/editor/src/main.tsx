import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const host = document.querySelector<HTMLDivElement>('#root');

if (!host) {
  throw new Error('Missing #root host');
}

createRoot(host).render(<App />);
