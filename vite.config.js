import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Sales-Saathi/',
  server: {
    port: 3000,
    strictPort: false, // Automatically find the next available port if 3000 is occupied
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        auth: resolve(__dirname, 'auth.html'),
        contact: resolve(__dirname, 'contact.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        features: resolve(__dirname, 'features.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        resources: resolve(__dirname, 'resources.html'),
        settings: resolve(__dirname, 'settings.html'),
        solutions: resolve(__dirname, 'solutions.html'),
        account_executives: resolve(__dirname, 'solutions/account-executives.html'),
        revenue_operations: resolve(__dirname, 'solutions/revenue-operations.html'),
        sales_leaders: resolve(__dirname, 'solutions/sales-leaders.html')
      }
    }
  }
});
