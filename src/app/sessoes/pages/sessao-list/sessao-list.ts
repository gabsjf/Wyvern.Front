import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SessaoService } from '../../services/sessao.service';
import { Sessao } from '../../models/sessao';

@Component({
  selector: 'app-sessao-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './sessao-list.html',
  styleUrl: './sessao-list.scss',
})
export class SessaoList implements OnInit {
  private sessaoService = inject(SessaoService);
  private cdr = inject(ChangeDetectorRef);
  sessoes: Sessao[] = [];

  ngOnInit() {
    this.loadSessoes();
  }

  loadSessoes() {
    this.sessaoService.getAll().subscribe({
      next: (data) => {
        this.sessoes = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erro ao buscar sessões', err);
      }
    });
  }
}
