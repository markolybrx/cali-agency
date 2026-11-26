import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cali.pwaagency',
  appName: 'Cali Agency',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
