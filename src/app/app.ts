import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { Sidebar } from './core/layout/sidebar/sidebar';
import { AuthService } from './core/services/auth.service';
import { CommonModule } from '@angular/common';
import { App as CapacitorApp } from '@capacitor/app';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Sidebar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('wyvern-front');
  authService = inject(AuthService);
  router = inject(Router);

  ngOnInit() {
    // Escuta eventos de Deep Link
    CapacitorApp.addListener('appUrlOpen', (event: any) => {
      const slug = event.url.split('.app').pop();
      if (slug) {
        // Redireciona o Angular para a rota capturada do link
        this.router.navigateByUrl(slug);
      }
    });
  }
}
