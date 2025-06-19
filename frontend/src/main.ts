import './app.css';
import App from './App.svelte';
import { enableMockApi, getMockApiCallLog, clearMockApiCallLog } from './lib/api'; // Import the functions

// Expose functions to the window object for Cypress
if (window.Cypress) { // Good practice to only expose for Cypress
  (window as any).enableMockApi = enableMockApi;
  (window as any).getMockApiCallLog = getMockApiCallLog;
  (window as any).clearMockApiCallLog = clearMockApiCallLog;
}

const app = new App({
  target: document.getElementById('app')!,
})

export default app
