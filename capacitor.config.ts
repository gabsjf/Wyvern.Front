import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gabriel.wyvern',
  appName: 'Wyvern',
  webDir: 'dist/wyvern-front/browser',
  server: {
    cleartext: true
  },
  plugins: {
    // O app esconde a abertura quando o Angular termina de carregar (PlataformaService), sem piscar tela branca.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#000000',
      showSpinner: false
    },
    // O app desenha de ponta a ponta; as áreas seguras chegam ao CSS como --safe-area-inset-*.
    SystemBars: {
      insetsHandling: 'css'
    }
  }
};

export default config;
