import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const distComponents = resolve(__dirname, 'dist/components');
      if (!fs.existsSync(distComponents)) {
        fs.mkdirSync(distComponents, { recursive: true });
      }
      if (fs.existsSync(resolve(__dirname, 'components'))) {
        fs.cpSync(resolve(__dirname, 'components'), distComponents, { recursive: true });
      }
      const logoPath = resolve(__dirname, 'logo.png');
      if (fs.existsSync(logoPath)) {
        fs.cpSync(logoPath, resolve(__dirname, 'dist/logo.png'));
      }
      const redirectsPath = resolve(__dirname, '_redirects');
      if (fs.existsSync(redirectsPath)) {
        fs.cpSync(redirectsPath, resolve(__dirname, 'dist/_redirects'));
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [copyStaticAssetsPlugin()],
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
        brief_history: resolve(__dirname, 'brief-history.html'),
        brief_result: resolve(__dirname, 'brief-result.html'),
        onboarding: resolve(__dirname, 'onboarding.html'),
        payment: resolve(__dirname, 'payment.html'),
        social_proof: resolve(__dirname, 'social-proof.html'),
        workflow: resolve(__dirname, 'workflow.html'),
        account_executives: resolve(__dirname, 'solutions/account-executives.html'),
        revenue_operations: resolve(__dirname, 'solutions/revenue-operations.html'),
        sales_leaders: resolve(__dirname, 'solutions/sales-leaders.html')
      }
    }
  }
});
