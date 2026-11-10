import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { PerfilService } from '../../services/perfil.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthShell } from '../../../shared/ui/auth-shell/auth-shell';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, AuthShell],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register implements OnInit {
  registerForm: FormGroup;
  loading = false;
  errorMessage = '';
  /** Preenchida depois do cadastro: troca o formulário pelo aviso de "verifique seu e-mail". */
  mensagemEnviado = '';
  returnUrl: string = '/campaigns';

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef); // o app é zoneless: o callback do HTTP não redesenha a tela sozinho
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private perfil = inject(PerfilService);

  /** No beta toda conta é Mestre e a escolha some; começa escondida até a API responder. */
  readonly beta = signal(true);

  constructor() {
    this.registerForm = this.fb.group({
      nome: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      senha: ['', [Validators.required, Validators.minLength(6)]],
      papel: ['Jogador'],
    });
  }

  ngOnInit() {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/campaigns';
    this.perfil.catalogo().subscribe({
      next: c => this.beta.set(c.beta),
      error: () => this.beta.set(true), // sem resposta: o servidor decide (no beta grava Mestre de qualquer jeito)
    });
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.register(this.registerForm.value).subscribe({
      next: res => {
        this.mensagemEnviado = res.message;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Erro ao realizar registro';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }
}
