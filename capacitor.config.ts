import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gabriel.wyvern',
  appName: 'Wyvern',
  webDir: 'dist/wyvern-front/browser',
  server: {
    cleartext: true
  }
};

export default config;
