import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LandingMapa } from './landing-mapa/landing-mapa';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, LandingMapa],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class LandingComponent {
  authService = inject(AuthService);
}
