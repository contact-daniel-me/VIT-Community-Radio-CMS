import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './hooks/ThemeProvider';
// Order matters: tokens define the palette, app.css styles the CMS, site.css
// styles the public pages and wins where the two overlap.
import './styles/tokens.css';
import './styles/app.css';
import './styles/site.css';
import './styles/studio.css';
import './styles/episodes.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
