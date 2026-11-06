import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthShell } from '../../../shared/ui/auth-shell/auth-shell';

@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, AuthShell],
  templateUrl: './esqueci-senha.html',
  styleUrl: './esqueci-senha.scss',
})
export class EsqueciSenha {
  form: FormGroup;
  loading = false;
  errorMessage = '';
  /** Preenchida depois do envio: troca o formulário pelo aviso de "verifique seu e-mail". */
  mensagemEnviado = '';

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef); // o app é zoneless: o callback do HTTP não redesenha a tela sozinho
  private fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    this.authService.esqueciSenha(this.form.value.email).subscribe({
      next: res => {
        this.mensagemEnviado = res.message;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.errorMessage = err.error?.message || 'Não foi possível enviar o link agora. Tente de novo em instantes.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
