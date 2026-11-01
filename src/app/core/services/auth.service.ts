import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';
import { BehaviorSubject, Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/Auth`;
  private currentUserSubject = new BehaviorSubject<any>(null);

  constructor(private http: HttpClient) {
    const token = localStorage.getItem('token');
    const papel = localStorage.getItem('papel');
    const usuarioIdStr = localStorage.getItem('usuarioId');
    if (token) {
      this.currentUserSubject.next({ 
        token, 
        papel, 
        usuarioId: usuarioIdStr ? parseInt(usuarioIdStr, 10) : undefined 
      });
    }
  }

  public get userRole(): string | null {
    return localStorage.getItem('papel');
  }

  public get currentUserValue(): any {
    return this.currentUserSubject.value;
  }

  login(credentials: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.token) {
          localStorage.setItem('token', response.token);
          if (response.papel) localStorage.setItem('papel', response.papel);
          if (response.usuarioId) localStorage.setItem('usuarioId', response.usuarioId.toString());
          this.currentUserSubject.next(response);
        }
      })
    );
  }

  register(credentials: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, credentials).pipe(
      tap(response => {
        if (response && response.token) {
          localStorage.setItem('token', response.token);
          if (response.papel) localStorage.setItem('papel', response.papel);
          if (response.usuarioId) localStorage.setItem('usuarioId', response.usuarioId.toString());
          this.currentUserSubject.next(response);
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('papel');
    localStorage.removeItem('usuarioId');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}
