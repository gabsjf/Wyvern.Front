import { Routes } from '@angular/router';

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
    {path: 'termos', title: 'Termos de uso · Wyvern', loadComponent: () => import('./core/pages/legal/termos/termos').then(m => m.Termos)},
    {path: 'privacidade', title: 'Política de privacidade · Wyvern', loadComponent: () => import('./core/pages/legal/privacidade/privacidade').then(m => m.Privacidade)},
    {path: 'reenviar-confirmacao', loadComponent: () => import('./core/pages/reenviar-confirmacao/reenviar-confirmacao').then(m => m.ReenviarConfirmacao)},
    // Pública: o link do e-mail pode abrir em outro aparelho, sem sessão.
    {path: 'confirmar-troca-email', loadComponent: () => import('./core/pages/confirmar-troca-email/confirmar-troca-email').then(m => m.ConfirmarTrocaEmail)},
    {
      path: '',
      canActivate: [authGuard],
      children: [
        {path: 'dashboard', loadComponent: () => import('./core/pages/dashboard/dashboard').then(m => m.DashboardComponent)},
        {path: 'perfil', loadComponent: () => import('./core/pages/perfil/perfil').then(m => m.PerfilComponent)},
        {path: 'campaigns', loadComponent: () => import('./campaigns/pages/campaign-list/campaign-list').then(m => m.CampaignList)},
    {path: 'campaigns/create', loadComponent: () => import('./campaigns/pages/campaign-create/campaign-create').then(m => m.CampaignCreate)},
    {path: 'anotacoes', title: 'Anotações · Wyvern', loadComponent: () => import('./campaigns/pages/anotacoes/anotacoes-pagina').then(m => m.AnotacoesPagina)},
    {path: 'campaigns/:id/modelos', title: 'Biblioteca 3D · Wyvern', loadComponent: () => import('./campaigns/pages/modelos-3d/modelos-3d').then(m => m.Modelos3d)},
    {path: 'campaigns/:id/murais', title: 'Murais · Wyvern', loadComponent: () => import('./campaigns/pages/murais/murais').then(m => m.Murais)},
    {path: 'campaigns/:id/murais/:muralId', title: 'Mural · Wyvern', loadComponent: () => import('./campaigns/pages/murais/mural-editor/mural-editor').then(m => m.MuralEditor)},
    {path: 'campaigns/:id/timeline', loadComponent: () => import('./campaigns/pages/linha-do-tempo/linha-do-tempo').then(m => m.LinhaDoTempo)},
    {path: 'campaigns/:id', loadComponent: () => import('./campaigns/pages/campaign-detail/campaign-detail').then(m => m.CampaignDetail)},
    {path: 'personagens', loadComponent: () => import('./personagens/pages/personagem-list/personagem-list').then(m => m.PersonagemList)},
    {path: 'personagens/create', loadComponent: () => import('./personagens/pages/personagem-create/personagem-create').then(m => m.PersonagemCreate)},
    {path: 'personagens/:id/edit', loadComponent: () => import('./personagens/pages/personagem-create/personagem-create').then(m => m.PersonagemCreate)},
    {path: 'personagens/:id', loadComponent: () => import('./personagens/pages/personagem-detail/personagem-detail').then(m => m.PersonagemDetail)},
    {path: 'ficha', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'ficha/:id/subir-nivel', loadComponent: () => import('./personagens/pages/subir-nivel/subir-nivel').then(m => m.SubirNivel)},
    {path: 'ficha/:id', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'sessoes', loadComponent: () => import('./sessoes/pages/sessao-list/sessao-list').then(m => m.SessaoList)},
    {path: 'sessoes/create', loadComponent: () => import('./sessoes/pages/sessao-create/sessao-create').then(m => m.SessaoCreate)},
    {path: 'sessoes/:id/edit', loadComponent: () => import('./sessoes/pages/sessao-create/sessao-create').then(m => m.SessaoCreate)},
    {path: 'sessoes/:id', loadComponent: () => import('./sessoes/pages/sessao-detail/sessao-detail').then(m => m.SessaoDetail)},
    {path: 'combate', loadComponent: () => import('./sessoes/pages/combate-tracker/combate-tracker').then(m => m.CombateTracker)},
        {path: 'play/:id', loadComponent: () => import('./sessoes/pages/play-session/play-session').then(m => m.PlaySession)},
        {path: 'invite/:token', loadComponent: () => import('./campaigns/pages/invite/invite').then(m => m.InviteComponent)}
      ]
    }
];
