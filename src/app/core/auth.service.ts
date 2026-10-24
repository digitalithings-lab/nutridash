import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './config';
import { AuthResponse, User } from './types';

const REFRESH_KEY = 'nutripro.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // El access token vive solo en memoria; el refresh token en el navegador para no pedir login en cada visita.
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  get token(): string | null {
    return this.accessToken;
  }

  // Al abrir el dashboard, recupera la sesión si el refresh token sigue vigente.
  async restore(): Promise<void> {
    if (readRefresh()) await this.refresh();
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(this.http.post<AuthResponse>(`${API_URL}/auth/login`, { email, password }));
    // Las cuentas de paciente solo usan la app móvil.
    if (response.user.role === 'PATIENT') {
      await firstValueFrom(this.http.post(`${API_URL}/auth/logout`, { refreshToken: response.refreshToken })).catch(() => undefined);
      throw new PatientAccountError();
    }
    return this.save(response);
  }

  async register(body: { email: string; password: string; fullName: string; licenseNumber?: string; phone?: string; clinicName?: string }): Promise<User> {
    return this.save(await firstValueFrom(this.http.post<AuthResponse>(`${API_URL}/auth/register`, body)));
  }

  // Una sola renovación a la vez aunque varias peticiones fallen juntas.
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const refreshToken = readRefresh();
        if (!refreshToken) return false;
        try {
          this.save(await firstValueFrom(this.http.post<AuthResponse>(`${API_URL}/auth/refresh`, { refreshToken })));
          return true;
        } catch {
          this.clear();
          return false;
        }
      })().finally(() => (this.refreshing = null));
    }
    return this.refreshing;
  }

  async logout(): Promise<void> {
    const refreshToken = readRefresh();
    if (refreshToken) {
      await firstValueFrom(this.http.post(`${API_URL}/auth/logout`, { refreshToken })).catch(() => undefined);
    }
    this.clear();
    await this.router.navigateByUrl('/login');
  }

  // Actualiza los datos del usuario tras editar la cuenta.
  setUser(user: User): void {
    this.user.set(user);
  }

  home(): string {
    return this.isAdmin() ? '/admin' : '/inicio';
  }

  private save(response: AuthResponse): User {
    if (response.user.role === 'PATIENT') {
      this.clear();
      throw new PatientAccountError();
    }
    this.accessToken = response.accessToken;
    writeRefresh(response.refreshToken);
    this.user.set(response.user);
    return response.user;
  }

  private clear(): void {
    this.accessToken = null;
    writeRefresh(null);
    this.user.set(null);
  }
}

export class PatientAccountError extends Error {
  constructor() {
    super('Esta es una cuenta de paciente. Ingresa desde la app móvil de NutriPro.');
  }
}

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(value: string | null): void {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Sin almacenamiento la sesión dura lo que la pestaña.
  }
}
