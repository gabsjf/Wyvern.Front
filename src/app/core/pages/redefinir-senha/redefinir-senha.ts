import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** Destino do link do e-mail de "esqueci a senha": /redefinir-senha?token=... */
@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './redefinir-senha.html',
  styleUrl: './redefinir-senha.scss',
})
export class RedefinirSenha implements OnInit {
  form: FormGroup;
  loading = false;
  errorMessage = '';
  concluido = false;
  private token = '';

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef); // o app é zoneless: o callback do HTTP não redesenha a tela sozinho
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({ novaSenha: ['', [Validators.required, Validators.minLength(6)]] });
  }

  ngOnInit() {
    this.token = this.route.snapshot.queryParams['token'] ?? '';
    if (!this.token) this.errorMessage = 'Link de redefinição inválido.';
  }

  get semToken(): boolean {
    return !this.token;
  }

  onSubmit() {
    if (this.form.invalid || this.semToken) return;

    this.loading = true;
    this.errorMessage = '';

    this.authService.redefinirSenha(this.token, this.form.value.novaSenha).subscribe({
      next: () => {
        this.concluido = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.errorMessage = err.error?.message || 'Não foi possível redefinir a senha.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
