import { Routes } from '@angular/router';
import { CampaignList } from './campaigns/pages/campaign-list/campaign-list';
import { CampaignDetail } from './campaigns/pages/campaign-detail/campaign-detail';
import { PersonagemList } from './personagens/pages/personagem-list/personagem-list';
import { PersonagemCreate } from './personagens/pages/personagem-create/personagem-create';
import { PersonagemDetail } from './personagens/pages/personagem-detail/personagem-detail';
import { SessaoList } from './sessoes/pages/sessao-list/sessao-list';
import { SessaoDetail } from './sessoes/pages/sessao-detail/sessao-detail';
import { PlaySession } from './sessoes/pages/play-session/play-session';

import { authGuard } from './core/guards/auth.guard';
import { Login } from './core/pages/login/login';
import { Register } from './core/pages/register/register';
import { ConfirmarEmail } from './core/pages/confirmar-email/confirmar-email';
import { EsqueciSenha } from './core/pages/esqueci-senha/esqueci-senha';
import { RedefinirSenha } from './core/pages/redefinir-senha/redefinir-senha';

export const routes: Routes = [
    {path: '', loadComponent: () => import('./core/pages/landing/landing').then(m => m.LandingComponent)},
    {path: 'login', component: Login},
    {path: 'register', component: Register},
    {path: 'confirmar-email', component: ConfirmarEmail},
    {path: 'esqueci-senha', component: EsqueciSenha},
    {path: 'redefinir-senha', component: RedefinirSenha},
    // Pública: o link do e-mail pode abrir em outro aparelho, sem sessão.
    {path: 'confirmar-troca-email', loadComponent: () => import('./core/pages/confirmar-troca-email/confirmar-troca-email').then(m => m.ConfirmarTrocaEmail)},
    {
      path: '',
      canActivate: [authGuard],
      children: [
        {path: 'dashboard', loadComponent: () => import('./core/pages/dashboard/dashboard').then(m => m.DashboardComponent)},
        {path: 'perfil', loadComponent: () => import('./core/pages/perfil/perfil').then(m => m.PerfilComponent)},
        {path: 'campaigns', component: CampaignList},
    {path: 'campaigns/create', loadComponent: () => import('./campaigns/pages/campaign-create/campaign-create').then(m => m.CampaignCreate)},
    {path: 'campaigns/:id/timeline', loadComponent: () => import('./campaigns/pages/linha-do-tempo/linha-do-tempo').then(m => m.LinhaDoTempo)},
    {path: 'campaigns/:id', component: CampaignDetail},
    {path: 'personagens', component: PersonagemList},
    {path: 'personagens/create', component: PersonagemCreate},
    {path: 'personagens/:id/edit', component: PersonagemCreate},
    {path: 'personagens/:id', component: PersonagemDetail},
    {path: 'ficha', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'ficha/:id', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'sessoes', component: SessaoList},
    {path: 'sessoes/create', loadComponent: () => import('./sessoes/pages/sessao-create/sessao-create').then(m => m.SessaoCreate)},
    {path: 'sessoes/:id/edit', loadComponent: () => import('./sessoes/pages/sessao-create/sessao-create').then(m => m.SessaoCreate)},
    {path: 'sessoes/:id', component: SessaoDetail},
    {path: 'combate', loadComponent: () => import('./sessoes/pages/combate-tracker/combate-tracker').then(m => m.CombateTracker)},
        {path: 'play/:id', component: PlaySession},
        {path: 'invite/:token', loadComponent: () => import('./campaigns/pages/invite/invite').then(m => m.InviteComponent)}
      ]
    }
];
