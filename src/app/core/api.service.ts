import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './config';

// Envoltorio con async/await sobre HttpClient.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${API_URL}${path}`));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${API_URL}${path}`, body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`${API_URL}${path}`, body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`${API_URL}${path}`, body));
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`${API_URL}${path}`));
  }

  // Descarga un PDF con el token de la sesión y lo abre en una pestaña nueva.
  // La pestaña se abre antes de la descarga para que el navegador no la bloquee.
  async openPdf(path: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const blob = await firstValueFrom(this.http.get(`${API_URL}${path}`, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      throw error;
    }
  }
}
