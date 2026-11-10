import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { iniciarMonitoramento } from './app/core/monitoramento';

// Antes do Angular: assim até um erro na inicialização chega ao Sentry (se o DSN estiver configurado).
iniciarMonitoramento();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
