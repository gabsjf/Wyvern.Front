import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { DashboardSummary } from '../models/dashboard-summary';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient);
  
  getResumo() {
    return this.http.get<DashboardSummary>(`${environment.apiUrl}/Dashboard/resumo`);
  }
}
