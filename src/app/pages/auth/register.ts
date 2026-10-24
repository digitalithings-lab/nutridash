import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/auth.interceptor';
import { AuthService } from '../../core/auth.service';
import { ErrorBanner } from '../../shared/ui';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, AuthLayout, ErrorBanner],
  template: `
    <app-auth-layout title="Crea tu cuenta" subtitle="Empieza con 14 días de prueba. Tus expedientes son privados.">
      <form class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label class="label" for="fullName">Nombre completo</label>
          <input id="fullName" class="input" name="fullName" autocomplete="name" [(ngModel)]="form.fullName" required />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="license">Registro profesional</label>
            <input id="license" class="input" name="license" [(ngModel)]="form.licenseNumber" placeholder="Opcional" />
          </div>
          <div>
            <label class="label" for="phone">Teléfono</label>
            <input id="phone" class="input" name="phone" type="tel" autocomplete="tel" [(ngModel)]="form.phone" placeholder="Opcional" />
          </div>
        </div>
        <div>
          <label class="label" for="clinic">Consultorio o clínica</label>
          <input id="clinic" class="input" name="clinic" [(ngModel)]="form.clinicName" placeholder="Opcional" />
        </div>
        <div>
          <label class="label" for="email">Correo electrónico</label>
          <input id="email" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="form.email" required />
        </div>
        <div>
          <label class="label" for="password">Contraseña</label>
          <input id="password" class="input" type="password" name="password" autocomplete="new-password" [(ngModel)]="form.password" required />
          <p class="mt-1 text-xs text-muted">Mínimo 8 caracteres.</p>
        </div>
        <app-error [message]="error()" />
        <button class="btn-primary w-full py-3" type="submit" [disabled]="loading()">
          {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
      </form>
      <p class="mt-6 text-center text-sm text-muted">
        ¿Ya tienes cuenta?
        <a routerLink="/login" class="font-bold text-brand-700 hover:underline">Inicia sesión</a>
      </p>
    </app-auth-layout>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected form = { fullName: '', licenseNumber: '', phone: '', clinicName: '', email: '', password: '' };
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit() {
    this.error.set(null);
    const f = this.form;
    if (f.fullName.trim().length < 3) return this.error.set('Escribe tu nombre completo.');
    if (!f.email.trim()) return this.error.set('Escribe tu correo.');
    if (f.password.length < 8) return this.error.set('La contraseña debe tener al menos 8 caracteres.');

    this.loading.set(true);
    try {
      await this.auth.register({
        fullName: f.fullName.trim(),
        email: f.email.trim(),
        password: f.password,
        licenseNumber: f.licenseNumber.trim() || undefined,
        phone: f.phone.trim() || undefined,
        clinicName: f.clinicName.trim() || undefined,
      });
      await this.router.navigateByUrl('/inicio');
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos crear tu cuenta.'));
    } finally {
      this.loading.set(false);
    }
  }
}
