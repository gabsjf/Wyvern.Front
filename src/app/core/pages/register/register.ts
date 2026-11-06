import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
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

  constructor() {
    this.registerForm = this.fb.group({
      nome: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      senha: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/campaigns';
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
