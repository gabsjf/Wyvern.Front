import { Routes } from '@angular/router';
import { CampaignList } from './campaigns/pages/campaign-list/campaign-list';
import { CampaignCreate } from './campaigns/pages/campaign-create/campaign-create';
import { CampaignDetail } from './campaigns/pages/campaign-detail/campaign-detail';
import { PersonagemList } from './personagens/pages/personagem-list/personagem-list';
import { PersonagemCreate } from './personagens/pages/personagem-create/personagem-create';
import { PersonagemDetail } from './personagens/pages/personagem-detail/personagem-detail';
import { SessaoList } from './sessoes/pages/sessao-list/sessao-list';
import { SessaoCreate } from './sessoes/pages/sessao-create/sessao-create';
import { SessaoDetail } from './sessoes/pages/sessao-detail/sessao-detail';
import { PlaySession } from './sessoes/pages/play-session/play-session';

import { authGuard } from './core/guards/auth.guard';
import { Login } from './core/pages/login/login';
import { Register } from './core/pages/register/register';

export const routes: Routes = [
    {path: '', loadComponent: () => import('./core/pages/landing/landing').then(m => m.LandingComponent)},
    {path: 'login', component: Login},
    {path: 'register', component: Register},
    {
      path: '',
      canActivate: [authGuard],
      children: [
        {path: 'dashboard', loadComponent: () => import('./core/pages/dashboard/dashboard').then(m => m.DashboardComponent)},
        {path: 'campaigns', component: CampaignList},
    {path: 'campaigns/create', component: CampaignCreate},
    {path: 'campaigns/:id', component: CampaignDetail},
    {path: 'personagens', component: PersonagemList},
    {path: 'personagens/create', component: PersonagemCreate},
    {path: 'personagens/:id/edit', component: PersonagemCreate},
    {path: 'personagens/:id', component: PersonagemDetail},
    {path: 'ficha', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'ficha/:id', loadComponent: () => import('./personagens/pages/ficha/ficha').then(m => m.FichaComponent)},
    {path: 'sessoes', component: SessaoList},
    {path: 'sessoes/create', component: SessaoCreate},
    {path: 'sessoes/:id/edit', component: SessaoCreate},
    {path: 'sessoes/:id', component: SessaoDetail},
    {path: 'combate', loadComponent: () => import('./sessoes/pages/combate-tracker/combate-tracker').then(m => m.CombateTracker)},
        {path: 'play/:id', component: PlaySession},
        {path: 'invite/:token', loadComponent: () => import('./campaigns/pages/invite/invite').then(m => m.InviteComponent)}
      ]
    }
];
