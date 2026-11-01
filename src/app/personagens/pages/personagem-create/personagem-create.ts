import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { PersonagemService } from '../../services/personagem.service';
import { CampaignService } from '../../../campaigns/services/campaign';
import { Campaign } from '../../../campaigns/models/campaign';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-personagem-create',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './personagem-create.html',
  styleUrl: './personagem-create.scss',
})
export class PersonagemCreate implements OnInit {
  private personagemService = inject(PersonagemService);
  private campaignService = inject(CampaignService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  get userRole(): string {
    return this.authService.userRole || 'Jogador';
  }

  campanhas: Campaign[] = [];
  periciasDisponiveis: any[] = [];
  selectedPericiasIds: number[] = [];
  activeTab: string = 'basico';
  isSidebarExpanded: boolean = true;
  tiposPersonagem = [
    { id: 1, nome: 'Jogador' },
    { id: 2, nome: 'NPC' },
    { id: 3, nome: 'Monstro' }
  ];

  isEditMode: boolean = false;
  personagemId: number | null = null;
  isSaving: boolean = false;

  personagem: any = {
    nome: '',
    descricao: '',
    campanhaId: 0,
    tipoId: 1,
    criadoPorId: 1, // mock
    criadoEm: new Date().toISOString(),
    ativo: true,
    atributo: { forca: 10, destreza: 10, constituicao: 10, inteligencia: 10, sabedoria: 10, carisma: 10, proficienciaSalvaguardaForca: false, proficienciaSalvaguardaDestreza: false, proficienciaSalvaguardaConstituicao: false, proficienciaSalvaguardaInteligencia: false, proficienciaSalvaguardaSabedoria: false, proficienciaSalvaguardaCarisma: false },
    personagemPlayer: { classe: '', raca: '', nivel: 1, antecedente: '', alinhamento: '', subclasse: '', tamanho: 'Médio', xp: 0 },
    personagemCombate: { vidaMaxima: 10, vidaAtual: 10, classeArmadura: 10, classeArmaduraEscudo: 0, iniciativa: 0, deslocamento: '9m', proficienciaBonus: 2, dadoVidaMaximo: '1d10', dadoVidaGasto: 0, inspiracaoHeroica: false, vidaTemporaria: 0, deathSaveSucessos: 0, deathSaveFalhas: 0 },
    personagemDetalhes: { aparencia: '', historiaPersonalidade: '', tracosEspecie: '', talentos: '', caracteristicasClasse: '', idiomas: '' },
    personagemNpc: { categoriaUso: 'Inimigo', tamanho: 'Médio', tipoCriatura: 'Humanoide', tendencia: 'Imparcial', formulaDadoVida: '', vulnerabilidades: '', resistencias: '', imunidadesDano: '', imunidadesCondicao: '', sentidos: '', nivelDesafio: '1', xpConcedido: 100, vinculosIdeais: '', segredosFaccoes: '', anotacoesLivres: '' },
    personagemConjuracao: { atributoConjuracao: 'Inteligencia', slotsNivel1Max: 0, slotsNivel2Max: 0, slotsNivel3Max: 0, slotsNivel4Max: 0, slotsNivel5Max: 0, slotsNivel6Max: 0, slotsNivel7Max: 0, slotsNivel8Max: 0, slotsNivel9Max: 0, slotsNivel1Atual: 0, slotsNivel2Atual: 0, slotsNivel3Atual: 0, slotsNivel4Atual: 0, slotsNivel5Atual: 0, slotsNivel6Atual: 0, slotsNivel7Atual: 0, slotsNivel8Atual: 0, slotsNivel9Atual: 0 },
    personagemAcoesPadrao: [],
    personagemAcoesBonus: [],
    personagemReacoes: [],
    personagemAcoesLendarias: [],
    personagemTracosEspeciais: []
  };

  setTab(tab: string) {
    this.activeTab = tab;
  }

  addAcaoPadrao() { this.personagem.personagemAcoesPadrao.push({ nome: '', descricao: '', alcance: '', bonusAcerto: null, dano: '', tipoDano: '', propriedades: '', atributoBase: 'Forca', proficiente: true, tipoAcao: 'Ataque' }); }
  removeAcaoPadrao(index: number) { this.personagem.personagemAcoesPadrao.splice(index, 1); }

  addAcaoBonus() { this.personagem.personagemAcoesBonus.push({ nome: '', descricao: '' }); }
  removeAcaoBonus(index: number) { this.personagem.personagemAcoesBonus.splice(index, 1); }

  addReacao() { this.personagem.personagemReacoes.push({ nome: '', gatilho: '', descricao: '' }); }
  removeReacao(index: number) { this.personagem.personagemReacoes.splice(index, 1); }

  addAcaoLendaria() { this.personagem.personagemAcoesLendarias.push({ nome: '', custoAcao: null, descricao: '' }); }
  removeAcaoLendaria(index: number) { this.personagem.personagemAcoesLendarias.splice(index, 1); }

  addTracoEspecial() { this.personagem.personagemTracosEspeciais.push({ nome: '', descricao: '' }); }
  removeTracoEspecial(index: number) { this.personagem.personagemTracosEspeciais.splice(index, 1); }

  ngOnInit() {
    this.campaignService.getAll().subscribe({
      next: (data) => this.campanhas = data,
      error: (err) => console.error('Erro ao buscar campanhas:', err)
    });

    this.personagemService.getPericias().subscribe({
      next: (data) => this.periciasDisponiveis = data,
      error: (err) => console.error('Erro ao buscar pericias:', err)
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEditMode = true;
      this.personagemId = +idParam;
      this.loadPersonagem(this.personagemId);
    }
  }

  loadPersonagem(id: number) {
    this.personagemService.getById(id).subscribe({
      next: (data: any) => {
        // Garantir que todos os objetos aninhados existam para o ngModel
        this.personagem = {
          ...data,
          atributo: data.atributo || this.personagem.atributo,
          personagemPlayer: data.personagemPlayer || this.personagem.personagemPlayer,
          personagemCombate: data.personagemCombate || this.personagem.personagemCombate,
          personagemDetalhes: data.personagemDetalhes || this.personagem.personagemDetalhes,
          personagemNpc: data.personagemNpc || this.personagem.personagemNpc,
          personagemConjuracao: data.personagemConjuracao || this.personagem.personagemConjuracao,
          personagemAcoesPadrao: data.personagemAcoesPadrao || [],
          personagemAcoesBonus: data.personagemAcoesBonus || [],
          personagemReacoes: data.personagemReacoes || [],
          personagemAcoesLendarias: data.personagemAcoesLendarias || [],
          personagemTracosEspeciais: data.personagemTracosEspeciais || []
        };
        
        if (data.personagemPericias) {
          this.selectedPericiasIds = data.personagemPericias.map((p: any) => p.periciaId);
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Erro ao carregar personagem:', err)
    });
  }

  togglePericia(id: number) {
    const index = this.selectedPericiasIds.indexOf(id);
    if (index > -1) {
      this.selectedPericiasIds.splice(index, 1);
    } else {
      this.selectedPericiasIds.push(id);
    }
  }

  save() {
    if (this.isSaving) return;

    if (!this.personagem.nome || this.personagem.nome.trim() === '') {
      alert('Por favor, preencha o Nome do personagem na aba Básico antes de salvar.');
      return;
    }
    if (this.personagem.campanhaId === 0) {
      alert('Por favor, selecione uma Campanha na aba Básico antes de salvar.');
      return;
    }

    this.personagem.periciasIds = this.selectedPericiasIds;

    if (this.personagem.personagemConjuracao) {
      for (let i = 1; i <= 9; i++) {
        if (this.personagem.personagemConjuracao['slotsNivel' + i + 'Max'] > 0) {
          this.personagem.personagemConjuracao['slotsNivel' + i + 'Atual'] = this.personagem.personagemConjuracao['slotsNivel' + i + 'Max'];
        }
      }
    }
    
    if (this.personagem.personagemCombate) {
       this.personagem.personagemCombate.vidaAtual = this.personagem.personagemCombate.vidaMaxima;
    }

    if (this.personagem.personagemAcoesPadrao) {
      this.personagem.personagemAcoesPadrao = this.personagem.personagemAcoesPadrao.filter((a: any) => a.nome && a.nome.trim() !== '');
      this.personagem.personagemAcoesPadrao.forEach((a: any) => a.bonusAcerto = Number(a.bonusAcerto) || 0);
    }
    if (this.personagem.personagemAcoesLendarias) {
      this.personagem.personagemAcoesLendarias = this.personagem.personagemAcoesLendarias.filter((a: any) => a.nome && a.nome.trim() !== '');
      this.personagem.personagemAcoesLendarias.forEach((a: any) => a.custoAcao = (a.custoAcao !== null && a.custoAcao !== '') ? String(a.custoAcao) : '1');
    }
    if (this.personagem.personagemAcoesBonus) {
      this.personagem.personagemAcoesBonus = this.personagem.personagemAcoesBonus.filter((a: any) => a.nome && a.nome.trim() !== '');
    }
    if (this.personagem.personagemReacoes) {
      this.personagem.personagemReacoes = this.personagem.personagemReacoes.filter((a: any) => a.nome && a.nome.trim() !== '');
    }

    // Duplicate Padrão Actions marked as Ataque/Magia to the combat/magic tabs
    if (this.personagem.personagemAcoesPadrao && this.personagem.personagemAcoesPadrao.length > 0) {
      if (!this.personagem.personagemAtaques) this.personagem.personagemAtaques = [];
      if (!this.personagem.personagemMagias) this.personagem.personagemMagias = [];
      
      this.personagem.personagemAcoesPadrao.forEach((acao: any) => {
        if (acao.tipoAcao === 'Ataque') {
          this.personagem.personagemAtaques.push({
            nome: acao.nome,
            alcance: acao.alcance || '',
            bonusAcerto: Number(acao.bonusAcerto) || 0,
            dano: acao.dano || '',
            tipoDano: acao.tipoDano || '',
            propriedades: acao.propriedades || '',
            atributoBase: acao.atributoBase || 'Forca',
            proficiente: acao.proficiente || false
          });
        } else if (acao.tipoAcao === 'Magia') {
          this.personagem.personagemMagias.push({
            nome: acao.nome,
            descricao: acao.descricao || '',
            nivel: 0,
            escola: 'Desconhecida'
          });
        }
      });
    }

    const payload = JSON.parse(JSON.stringify(this.personagem));

    if (payload.tipoId === 1) {
      payload.personagemNpc = null;
      payload.personagemAcoesPadrao = null;
      payload.personagemAcoesBonus = null;
      payload.personagemReacoes = null;
      payload.personagemAcoesLendarias = null;
      payload.personagemTracosEspeciais = null;
    } else {
      payload.personagemPlayer = null;
    }

    if (this.isEditMode && this.personagemId) {
      this.isSaving = true;
      payload.personagemId = this.personagemId;
      this.personagemService.update(this.personagemId, payload).subscribe({
        next: () => {
          this.isSaving = false;
          alert('Personagem atualizado com sucesso!');
          this.router.navigate(['/personagens']);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao atualizar personagem', err);
          alert('Erro ao atualizar personagem. Veja o console.');
        }
      });
    } else {
      this.isSaving = true;
      this.personagemService.create(payload).subscribe({
        next: () => {
          this.isSaving = false;
          alert('Personagem criado com sucesso!');
          this.router.navigate(['/personagens']);
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Erro ao criar personagem', err);
          alert('Erro ao criar personagem. Veja o console.');
        }
      });
    }
  }
}
