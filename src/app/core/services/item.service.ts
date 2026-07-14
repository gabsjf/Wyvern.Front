import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';

export interface Item {
  itemId?: number;
  nome: string;
  descricao?: string;
  peso?: number;
  valor?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/Item`;

  getAll() {
    return this.http.get<Item[]>(this.apiUrl);
  }
}
