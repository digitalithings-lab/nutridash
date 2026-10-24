import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import { AuthService } from '../core/auth.service';
import { EQUATIONS } from '../core/calc';
import { API_URL } from '../core/config';
import { exchangeModeLabels, formatDate, formatMoney, subscriptionStatusLabels } from '../core/format';
import { Equation, ExchangeMode, SubscriptionPlan, User } from '../core/types';
import { Badge, ErrorBanner, PageHeader, SkeletonCards, Tabs } from '../shared/ui';

const TABS = [
  { key: 'profile', label: 'Perfil' },
  { key: 'clinical', label: 'Preferencias clínicas' },
  { key: 'subscription', label: 'Suscripción' },
  { key: 'security', label: 'Seguridad' },
];

const TIMEZONES = [
  'America/Panama',
  'America/Bogota',
  'America/Costa_Rica',
  'America/Guatemala',
  'America/Mexico_City',
  'America/Lima',
  'America/Caracas',
  'America/Santo_Domingo',
  'America/New_York',
  'Europe/Madrid',
];

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, Badge, ErrorBanner, PageHeader, SkeletonCards, Tabs],
  template: `
    <app-page-header title="Configuración" subtitle="Tu cuenta, preferencias clínicas y suscripción." />
    <app-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($event)" />

    @if (loading()) {
      <app-skeleton-cards [count]="2" grid="md:grid-cols-2" />
    } @else {
      <app-error [message]="loadError()" />

      @switch (tab()) {
        @case ('profile') {
          <form class="card max-w-3xl space-y-4" (ngSubmit)="saveProfile()">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="label" for="st-name">Nombre completo</label>
                <input id="st-name" class="input" name="fullName" maxlength="80" [(ngModel)]="profile.fullName" required />
              </div>
              <div>
                <label class="label" for="st-email">Correo</label>
                <input id="st-email" class="input" name="email" [value]="user()?.email ?? ''" disabled />
              </div>
              <div>
                <label class="label" for="st-license">Número de idoneidad</label>
                <input id="st-license" class="input" name="licenseNumber" maxlength="40" [(ngModel)]="profile.licenseNumber" />
              </div>
              <div>
                <label class="label" for="st-phone">Teléfono</label>
                <input id="st-phone" class="input" type="tel" name="phone" maxlength="30" [(ngModel)]="profile.phone" />
              </div>
              <div>
                <label class="label" for="st-tz">Zona horaria</label>
                <input id="st-tz" class="input" name="timezone" maxlength="60" list="st-tz-list" [(ngModel)]="profile.timezone" />
                <datalist id="st-tz-list">
                  @for (tz of timezones; track tz) {
                    <option [value]="tz"></option>
                  }
                </datalist>
              </div>
              <div>
                <label class="label" for="st-clinic">Consultorio</label>
                <input id="st-clinic" class="input" name="clinicName" maxlength="80" [(ngModel)]="profile.clinicName" />
              </div>
              <div>
                <label class="label" for="st-address">Dirección del consultorio</label>
                <input id="st-address" class="input" name="clinicAddress" maxlength="160" [(ngModel)]="profile.clinicAddress" />
              </div>
            </div>
            <p class="text-xs text-muted">El nombre, la idoneidad y el consultorio aparecen en los planes que entregas a tus pacientes.</p>
            <app-error [message]="profileError()" />
            @if (profileSaved()) {
              <p class="text-sm font-semibold text-brand-700">Perfil actualizado.</p>
            }
            <div class="flex justify-end">
              <button class="btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar perfil' }}</button>
            </div>
          </form>
        }

        @case ('clinical') {
          <form class="card max-w-3xl space-y-5" (ngSubmit)="saveClinical()">
            <div>
              <label class="label" for="st-eq">Ecuación de energía por defecto</label>
              <select id="st-eq" class="input" name="equation" [(ngModel)]="clinical.defaultEquation">
                @for (e of equations; track e.value) {
                  <option [value]="e.value">{{ e.label }} — {{ e.needs }}</option>
                }
              </select>
            </div>
            <div>
              <p class="label">Sistema de intercambios por defecto</p>
              <div class="grid gap-2 sm:grid-cols-3">
                @for (mode of modes; track mode) {
                  <label
                    class="cursor-pointer rounded-xl border-[1.5px] p-3 transition"
                    [class]="clinical.defaultExchangeMode === mode ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-canvas'"
                  >
                    <input type="radio" class="sr-only" name="exchangeMode" [value]="mode" [(ngModel)]="clinical.defaultExchangeMode" />
                    <p class="font-bold">{{ modeLabels[mode].label }}</p>
                    <p class="text-xs text-muted">{{ modeLabels[mode].hint }}</p>
                  </label>
                }
              </div>
            </div>
            <div>
              <p class="label">Distribución de macronutrientes por defecto (%)</p>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="text-xs font-bold text-amber-700" for="st-cho">Carbohidratos</label>
                  <input id="st-cho" class="input" type="number" min="0" max="100" step="1" name="cho" [(ngModel)]="clinical.defaultChoPct" (ngModelChange)="touch()" />
                </div>
                <div>
                  <label class="text-xs font-bold text-coral-700" for="st-pro">Proteínas</label>
                  <input id="st-pro" class="input" type="number" min="0" max="100" step="1" name="pro" [(ngModel)]="clinical.defaultProPct" (ngModelChange)="touch()" />
                </div>
                <div>
                  <label class="text-xs font-bold text-sky-700" for="st-fat">Grasas</label>
                  <input id="st-fat" class="input" type="number" min="0" max="100" step="1" name="fat" [(ngModel)]="clinical.defaultFatPct" (ngModelChange)="touch()" />
                </div>
              </div>
              <div class="mt-3 flex h-2.5 overflow-hidden rounded-full bg-mist">
                <div class="bg-amber-500" [style.width.%]="pct(clinical.defaultChoPct)"></div>
                <div class="bg-coral-500" [style.width.%]="pct(clinical.defaultProPct)"></div>
                <div class="bg-sky-500" [style.width.%]="pct(clinical.defaultFatPct)"></div>
              </div>
              <p class="mt-2 text-sm font-bold" [class]="macroSum() === 100 ? 'text-brand-700' : 'text-danger-500'">
                Suma: {{ macroSum() }} %{{ macroSum() === 100 ? '' : ' — debe ser 100 %' }}
              </p>
            </div>
            <p class="text-xs text-muted">Son valores iniciales para nuevos planes; puedes ajustarlos en cada paciente.</p>
            <app-error [message]="clinicalError()" />
            @if (clinicalSaved()) {
              <p class="text-sm font-semibold text-brand-700">Preferencias guardadas.</p>
            }
            <div class="flex justify-end">
              <button class="btn-primary" type="submit" [disabled]="saving() || macroSum() !== 100">{{ saving() ? 'Guardando…' : 'Guardar preferencias' }}</button>
            </div>
          </form>
        }

        @case ('subscription') {
          <div class="grid max-w-5xl gap-6">
            <section class="card">
              @if (user()?.subscription; as sub) {
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="label">Plan actual</p>
                    <p class="text-2xl font-extrabold">{{ sub.plan.name }}</p>
                  </div>
                  <app-badge [badge]="subLabels[sub.status]" />
                </div>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p class="label">Vence</p>
                    <p class="font-bold">{{ sub.currentPeriodEnd ? date(sub.currentPeriodEnd) : 'Sin fecha de vencimiento' }}</p>
                  </div>
                  <div>
                    <p class="label">Pacientes activos</p>
                    <p class="font-bold">
                      {{ activePatients() }}
                      @if (sub.plan.maxPatients) { de {{ sub.plan.maxPatients }} } @else { (ilimitados) }
                    </p>
                    @if (sub.plan.maxPatients) {
                      <div class="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                        <div class="h-full rounded-full" [class]="usagePct() >= 90 ? 'bg-coral-500' : 'bg-brand-500'" [style.width.%]="usagePct()"></div>
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <p class="text-muted">No tienes una suscripción asignada.</p>
              }
              <p class="mt-5 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
                Para cambiar de plan, escríbenos desde <a routerLink="/soporte" class="font-bold text-brand-700 hover:underline">Soporte</a>.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-extrabold">Planes disponibles</h2>
              <div class="grid gap-4 md:grid-cols-3">
                @for (p of plans(); track p.id) {
                  <article class="card flex flex-col" [class.ring-2]="p.code === user()?.subscription?.plan?.code" [class.ring-brand-500]="p.code === user()?.subscription?.plan?.code">
                    <p class="font-extrabold">{{ p.name }}</p>
                    <p class="mt-1 text-2xl font-extrabold text-brand-700">{{ money(p.priceCents, p.currency) }}<span class="text-sm font-bold text-muted"> / mes</span></p>
                    @if (p.description) {
                      <p class="mt-1 text-sm text-muted">{{ p.description }}</p>
                    }
                    <p class="mt-2 text-sm font-bold">{{ p.maxPatients ? 'Hasta ' + p.maxPatients + ' pacientes activos' : 'Pacientes ilimitados' }}</p>
                    <ul class="mt-3 space-y-1 text-sm text-ink">
                      @for (feat of p.features; track $index) {
                        <li class="flex gap-2"><span class="text-brand-600">✓</span>{{ feat }}</li>
                      }
                    </ul>
                    @if (p.code === user()?.subscription?.plan?.code) {
                      <span class="chip mt-auto w-fit bg-brand-100 text-brand-700">Tu plan</span>
                    }
                  </article>
                } @empty {
                  <p class="text-sm text-muted">No hay planes publicados.</p>
                }
              </div>
            </section>
          </div>
        }

        @case ('security') {
          <form class="card max-w-xl space-y-4" (ngSubmit)="changePassword()">
            <h2 class="text-lg font-extrabold">Cambiar contraseña</h2>
            <div>
              <label class="label" for="st-cur">Contraseña actual</label>
              <input id="st-cur" class="input" type="password" name="currentPassword" autocomplete="current-password" [(ngModel)]="pwd.current" required />
            </div>
            <div>
              <label class="label" for="st-new">Contraseña nueva</label>
              <input id="st-new" class="input" type="password" name="newPassword" autocomplete="new-password" minlength="8" [(ngModel)]="pwd.next" required />
              <p class="mt-1 text-xs text-muted">Al menos 8 caracteres.</p>
            </div>
            <div>
              <label class="label" for="st-rep">Repite la contraseña nueva</label>
              <input id="st-rep" class="input" type="password" name="repeat" autocomplete="new-password" [(ngModel)]="pwd.repeat" required />
            </div>
            <app-error [message]="pwdError()" />
            @if (pwdSaved()) {
              <p class="text-sm font-semibold text-brand-700">Contraseña actualizada.</p>
            }
            <div class="flex justify-end">
              <button class="btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Cambiar contraseña' }}</button>
            </div>
          </form>
        }
      }
    }
  `,
})
export class Settings implements OnInit {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  protected readonly tabs = TABS;
  protected readonly timezones = TIMEZONES;
  protected readonly equations = EQUATIONS;
  protected readonly modes = Object.keys(exchangeModeLabels) as ExchangeMode[];
  protected readonly modeLabels = exchangeModeLabels;
  protected readonly subLabels = subscriptionStatusLabels;
  protected readonly date = formatDate;
  protected readonly money = formatMoney;

  protected readonly tab = signal('profile');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly user = this.auth.user;
  protected readonly plans = signal<SubscriptionPlan[]>([]);

  protected profile = { fullName: '', licenseNumber: '', phone: '', clinicName: '', clinicAddress: '', timezone: '' };
  protected readonly profileError = signal<string | null>(null);
  protected readonly profileSaved = signal(false);

  protected clinical = {
    defaultEquation: 'MIFFLIN_ST_JEOR' as Equation,
    defaultExchangeMode: 'PANAMA' as ExchangeMode,
    defaultChoPct: 50,
    defaultProPct: 20,
    defaultFatPct: 30,
  };
  private readonly version = signal(0);
  protected readonly clinicalError = signal<string | null>(null);
  protected readonly clinicalSaved = signal(false);

  protected pwd = { current: '', next: '', repeat: '' };
  protected readonly pwdError = signal<string | null>(null);
  protected readonly pwdSaved = signal(false);

  protected readonly macroSum = computed(() => {
    this.version();
    const c = this.clinical;
    return (Number(c.defaultChoPct) || 0) + (Number(c.defaultProPct) || 0) + (Number(c.defaultFatPct) || 0);
  });

  protected readonly activePatients = computed(() => this.user()?.usage?.activePatients ?? 0);
  protected readonly usagePct = computed(() => {
    const max = this.user()?.subscription?.plan.maxPatients;
    return max ? Math.min(100, Math.round((this.activePatients() / max) * 100)) : 0;
  });

  async ngOnInit() {
    try {
      const [account, plans] = await Promise.all([this.api.get<User>('/account'), this.api.get<SubscriptionPlan[]>('/plans')]);
      this.auth.setUser(account);
      this.plans.set(plans);
      this.fill(account);
    } catch (err) {
      const current = this.auth.user();
      if (current) this.fill(current);
      this.loadError.set(errorMessage(err, 'No pudimos cargar tu cuenta.'));
    } finally {
      this.loading.set(false);
    }
  }

  private fill(u: User) {
    this.profile = {
      fullName: u.fullName,
      licenseNumber: u.licenseNumber ?? '',
      phone: u.phone ?? '',
      clinicName: u.clinicName ?? '',
      clinicAddress: u.clinicAddress ?? '',
      timezone: u.timezone,
    };
    this.clinical = {
      defaultEquation: u.defaults.equation,
      defaultExchangeMode: u.defaults.exchangeMode,
      defaultChoPct: u.defaults.choPct,
      defaultProPct: u.defaults.proPct,
      defaultFatPct: u.defaults.fatPct,
    };
    this.touch();
  }

  protected touch() {
    this.version.update((v) => v + 1);
  }

  protected pct(v: number): number {
    return Math.max(0, Math.min(100, Number(v) || 0));
  }

  // El PATCH no devuelve el uso; se conserva el que ya teníamos.
  private store(updated: User) {
    this.auth.setUser({ ...updated, usage: updated.usage ?? this.auth.user()?.usage });
  }

  protected async saveProfile() {
    this.profileError.set(null);
    this.profileSaved.set(false);
    const p = this.profile;
    if (p.fullName.trim().length < 3) return this.profileError.set('El nombre debe tener al menos 3 caracteres.');
    this.saving.set(true);
    try {
      const body = {
        fullName: p.fullName.trim(),
        licenseNumber: p.licenseNumber.trim(),
        phone: p.phone.trim(),
        clinicName: p.clinicName.trim(),
        clinicAddress: p.clinicAddress.trim(),
        ...(p.timezone.trim() ? { timezone: p.timezone.trim() } : {}),
      };
      this.store(await this.api.patch<User>('/account', body));
      this.profileSaved.set(true);
    } catch (err) {
      this.profileError.set(errorMessage(err, 'No pudimos guardar tu perfil.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveClinical() {
    this.clinicalError.set(null);
    this.clinicalSaved.set(false);
    const c = this.clinical;
    const values = [c.defaultChoPct, c.defaultProPct, c.defaultFatPct].map(Number);
    if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) return this.clinicalError.set('Usa porcentajes enteros entre 0 y 100.');
    if (this.macroSum() !== 100) return this.clinicalError.set('La distribución debe sumar 100 %.');
    this.saving.set(true);
    try {
      const updated = await this.api.patch<User>('/account', {
        defaultEquation: c.defaultEquation,
        defaultExchangeMode: c.defaultExchangeMode,
        defaultChoPct: values[0],
        defaultProPct: values[1],
        defaultFatPct: values[2],
      });
      this.store(updated);
      this.clinicalSaved.set(true);
    } catch (err) {
      this.clinicalError.set(errorMessage(err, 'No pudimos guardar tus preferencias.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async changePassword() {
    this.pwdError.set(null);
    this.pwdSaved.set(false);
    if (!this.pwd.current) return this.pwdError.set('Escribe tu contraseña actual.');
    if (this.pwd.next.length < 8) return this.pwdError.set('La contraseña nueva debe tener al menos 8 caracteres.');
    if (this.pwd.next !== this.pwd.repeat) return this.pwdError.set('Las contraseñas nuevas no coinciden.');
    this.saving.set(true);
    try {
      await this.postChangePassword({ currentPassword: this.pwd.current, newPassword: this.pwd.next });
      this.pwd = { current: '', next: '', repeat: '' };
      this.pwdSaved.set(true);
    } catch (err) {
      this.pwdError.set(errorMessage(err, 'No pudimos cambiar la contraseña.'));
    } finally {
      this.saving.set(false);
    }
  }

  // El interceptor no añade el token a las rutas /auth/, así que se envía aquí.
  // Si el token expiró se renueva una vez y se reintenta.
  private async postChangePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
    const send = () =>
      firstValueFrom(
        this.http.post(`${API_URL}/auth/change-password`, body, {
          headers: this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : {},
        }),
      );
    try {
      await send();
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401 && (await this.auth.refresh())) {
        await send();
        return;
      }
      throw err;
    }
  }
}
