import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.cali.pwaagency',
  appName: 'Cali PWA Agency',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
