import { Routes } from '@angular/router';
import { CampaignList } from './campaigns/pages/campaign-list/campaign-list';
import { CampaignCreate } from './campaigns/pages/campaign-create/campaign-create';
import { CampaignDetail } from './campaigns/pages/campaign-detail/campaign-detail';

export const routes: Routes = [
    {path: '', redirectTo: '/campaigns', pathMatch: 'full'},
    {path: 'campaigns', component: CampaignList},
    {path: 'campaigns/create', component: CampaignCreate},
    {path: 'campaigns/:id', component: CampaignDetail},
];
