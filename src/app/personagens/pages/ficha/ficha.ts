import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FichaHeader } from '../../components/ficha-header/ficha-header';
import { FichaAtributos } from '../../components/ficha-atributos/ficha-atributos';

@Component({
  selector: 'app-ficha',
  standalone: true,
  imports: [CommonModule, FichaHeader, FichaAtributos],
  templateUrl: './ficha.html',
  styleUrls: ['./ficha.scss']
})
export class FichaComponent implements OnInit {
  activeTab: string = 'atributos';
  personagem: any = null;
  
  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadPersonagem(id);
      }
    });
  }

  async loadPersonagem(id: string) {
    try {
      const response = await fetch(`https://localhost:7098/Personagem/${id}`);
      if (response.ok) {
        this.personagem = await response.json();
      }
    } catch (e) {
      console.error(e);
    }
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }
  
  importPdf() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('https://localhost:7098/Personagem/import-pdf', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          alert('Ficha importada com sucesso!');
          this.router.navigate(['/ficha', data.personagemId]);
        } else {
          const err = await response.text();
          alert('Erro ao importar: ' + err);
        }
      } catch (err) {
        console.error(err);
        alert('Erro de conexão ao importar PDF.');
      }
    };
    input.click();
  }

  exportPdf() {
    if (!this.personagem || !this.personagem.personagemId) {
      alert('Nenhum personagem carregado para exportar!');
      return;
    }
    
    window.open(`https://localhost:7098/Personagem/${this.personagem.personagemId}/export-pdf`, '_blank');
  }
}
