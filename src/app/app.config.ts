import {
  ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

import { routes } from './app.routes';

// Datas e números em português do Brasil (o pipe date mostrava "October 25" em inglês)
registerLocaleData(localePt, 'pt-BR');

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(), 
    provideRouter(routes), 
    provideHttpClient(withInterceptors([authInterceptor])),
    // A sessão é um cookie que o JavaScript não lê: pergunta à API antes de abrir a primeira rota.
    provideAppInitializer(() => inject(AuthService).carregarSessao()),
  ],
};
