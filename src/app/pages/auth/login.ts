import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/auth.interceptor';
import { AuthService } from '../../core/auth.service';
import { ErrorBanner } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, AuthLayout, ErrorBanner],
  template: `
    <app-auth-layout title="Bienvenida" subtitle="Ingresa a tu cuenta para continuar.">
      <form class="space-y-5" (ngSubmit)="submit()">
        <div>
          <label class="label" for="email">Correo electrónico</label>
          <input id="email" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
        </div>
        <div>
          <label class="label" for="password">Contraseña</label>
          <input id="password" class="input" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required />
        </div>
        <app-error [message]="error()" />
        <button class="btn-primary w-full py-3" type="submit" [disabled]="loading()">
          {{ loading() ? 'Entrando…' : 'Iniciar sesión' }}
        </button>
      </form>
      <p class="mt-6 text-center text-sm text-muted">
        ¿Aún no tienes cuenta?
        <a routerLink="/registro" class="font-bold text-brand-700 hover:underline">Crea tu cuenta gratis</a>
      </p>
    </app-auth-layout>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit() {
    this.error.set(null);
    if (!this.email || !this.password) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.login(this.email.trim(), this.password);
      await this.router.navigateByUrl(this.auth.home());
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos iniciar sesión.'));
    } finally {
      this.loading.set(false);
    }
  }
}
