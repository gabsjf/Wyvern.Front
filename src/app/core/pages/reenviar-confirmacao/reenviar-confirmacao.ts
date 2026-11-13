import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthShell } from '../../../shared/ui/auth-shell/auth-shell';

/** Pede outro link de confirmação de cadastro. Aceita ?email=... para já vir preenchido. */
@Component({
  selector: 'app-reenviar-confirmacao',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, AuthShell],
  templateUrl: './reenviar-confirmacao.html',
  styleUrl: './reenviar-confirmacao.scss',
})
export class ReenviarConfirmacao {
  form: FormGroup;
  loading = false;
  errorMessage = '';
  /** Preenchida depois do envio: troca o formulário pelo aviso de "verifique seu e-mail". */
  mensagemEnviado = '';

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef); // o app é zoneless: o callback do HTTP não redesenha a tela sozinho
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);

  constructor() {
    const email = this.route.snapshot.queryParams['email'] ?? '';
    this.form = this.fb.group({ email: [email, [Validators.required, Validators.email]] });
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    this.authService.reenviarConfirmacao(this.form.value.email).subscribe({
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
