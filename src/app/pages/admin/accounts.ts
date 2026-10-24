import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatDate, formatDateTime, subscriptionStatusLabels } from '../../core/format';
import { AdminUser, SubscriptionPlan, SubscriptionStatus } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, Empty, ErrorBanner, Modal, PageHeader } from '../../shared/ui';

const ACCOUNT_STATUS = {
  ACTIVE: { label: 'Activa', classes: 'bg-brand-100 text-brand-700' },
  SUSPENDED: { label: 'Suspendida', classes: 'bg-danger-100 text-danger-500' },
};

@Component({
  selector: 'app-admin-accounts',
  imports: [FormsModule, Icon, Badge, Empty, ErrorBanner, Modal, PageHeader],
  template: `
    <app-page-header title="Cuentas" subtitle="Nutricionistas registradas, su plan y su actividad." />

    <div class="relative mb-4 max-w-md">
      <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft"><app-icon name="search" size="sm" /></span>
      <input class="input pl-9" placeholder="Buscar por nombre, correo o consultorio" name="search" [(ngModel)]="search" (ngModelChange)="searchChanged()" />
    </div>

    <app-error [message]="error()" />

    <section class="card mt-3 overflow-x-auto p-0">
      @if (loading()) {
        <div class="space-y-3 p-5">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton h-12"></div>
          }
        </div>
      } @else if (!users().length) {
        <app-empty emoji="👩‍⚕️" title="Sin cuentas" text="No hay cuentas que coincidan con la búsqueda." />
      } @else {
        <table class="table-base min-w-[960px]">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Consultorio</th>
              <th>Código</th>
              <th>Plan</th>
              <th class="text-right">Pacientes</th>
              <th class="text-right">Planes</th>
              <th>Último acceso</th>
              <th>Cuenta</th>
              <th class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td>
                  <p class="font-bold text-ink">{{ u.fullName }}</p>
                  <p class="text-xs text-muted">{{ u.email }}</p>
                  @if (u.role === 'ADMIN') {
                    <span class="chip mt-1 bg-violet-100 text-violet-500">Administración</span>
                  }
                </td>
                <td class="text-muted">{{ u.clinicName ?? '—' }}</td>
                <td>
                  @if (u.linkCode) {
                    <span class="font-mono font-bold tracking-widest text-brand-700">{{ u.linkCode }}</span>
                  } @else {
                    <span class="text-muted">—</span>
                  }
                </td>
                <td>
                  @if (u.subscription; as s) {
                    <p class="font-bold">{{ s.planName }}</p>
                    <div class="mt-1 flex flex-wrap items-center gap-1">
                      <app-badge [badge]="subLabels[s.status]" />
                      @if (s.currentPeriodEnd) {
                        <span class="text-xs text-muted">vence {{ date(s.currentPeriodEnd, 'short') }}</span>
                      }
                    </div>
                  } @else {
                    <span class="text-muted">Sin plan</span>
                  }
                </td>
                <td class="text-right font-bold">{{ u.patients }}</td>
                <td class="text-right font-bold">{{ u.mealPlans }}</td>
                <td class="text-muted">{{ u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Nunca' }}</td>
                <td><app-badge [badge]="accountStatus[u.status]" /></td>
                <td>
                  @if (u.role !== 'ADMIN') {
                    <div class="flex justify-end gap-1.5">
                      <button class="btn-outline btn-sm" (click)="openSubscription(u)">Suscripción</button>
                      @if (u.status === 'ACTIVE') {
                        <button class="btn-danger btn-sm" [disabled]="busy() === u.id" (click)="setStatus(u, 'SUSPENDED')">Suspender</button>
                      } @else {
                        <button class="btn-secondary btn-sm" [disabled]="busy() === u.id" (click)="setStatus(u, 'ACTIVE')">Reactivar</button>
                      }
                    </div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
    <p class="mt-3 text-xs text-muted">Aquí solo se muestran conteos; los datos clínicos de los pacientes no son visibles para administración.</p>

    @if (subForm(); as f) {
      <app-modal [title]="'Suscripción de ' + f.user.fullName" (closed)="subForm.set(null)">
        <form class="space-y-4" (ngSubmit)="saveSubscription()">
          <div>
            <label class="label" for="ac-plan">Plan</label>
            <select id="ac-plan" class="input" name="planId" [(ngModel)]="f.planId" required>
              <option value="" disabled>Elige un plan</option>
              @for (p of plans(); track p.id) {
                <option [value]="p.id">{{ p.name }}{{ p.active ? '' : ' (inactivo)' }}</option>
              }
            </select>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="ac-status">Estado</label>
              <select id="ac-status" class="input" name="status" [(ngModel)]="f.status">
                @for (s of statuses; track s) {
                  <option [value]="s">{{ subLabels[s].label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label" for="ac-end">Vence</label>
              <input id="ac-end" class="input" type="date" name="end" [(ngModel)]="f.end" />
              <p class="mt-1 text-xs text-muted">Vacío = sin vencimiento.</p>
            </div>
          </div>
          <div>
            <label class="label" for="ac-notes">Notas internas</label>
            <textarea id="ac-notes" class="input" rows="3" maxlength="500" name="notes" [(ngModel)]="f.notes"></textarea>
          </div>
          <app-error [message]="subError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="subForm.set(null)">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class AdminAccounts implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly subLabels = subscriptionStatusLabels;
  protected readonly accountStatus = ACCOUNT_STATUS;
  protected readonly statuses = Object.keys(subscriptionStatusLabels) as SubscriptionStatus[];
  protected readonly date = formatDate;
  protected readonly dateTime = formatDateTime;

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected search = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  protected readonly subForm = signal<{ user: AdminUser; planId: string; status: SubscriptionStatus; end: string; notes: string } | null>(null);
  protected readonly subError = signal<string | null>(null);
  protected readonly saving = signal(false);

  ngOnInit() {
    void this.load();
    this.api
      .get<SubscriptionPlan[]>('/admin/plans')
      .then((p) => this.plans.set(p))
      .catch(() => undefined);
  }

  protected async load() {
    const id = ++this.requestId;
    const term = this.search.trim();
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await this.api.get<AdminUser[]>(`/admin/users${term ? `?search=${encodeURIComponent(term)}` : ''}`);
      if (id === this.requestId) this.users.set(list);
    } catch (err) {
      if (id === this.requestId) this.error.set(errorMessage(err, 'No pudimos cargar las cuentas.'));
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected searchChanged() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  protected async setStatus(u: AdminUser, status: 'ACTIVE' | 'SUSPENDED') {
    if (status === 'SUSPENDED' && !confirm(`¿Suspender la cuenta de ${u.fullName}? Se cerrarán sus sesiones.`)) return;
    this.busy.set(u.id);
    this.error.set(null);
    try {
      await this.api.patch(`/admin/users/${u.id}/status`, { status });
      this.users.update((list) => list.map((x) => (x.id === u.id ? { ...x, status } : x)));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cambiar el estado de la cuenta.'));
    } finally {
      this.busy.set(null);
    }
  }

  protected openSubscription(u: AdminUser) {
    this.subError.set(null);
    const s = u.subscription;
    this.subForm.set({
      user: u,
      planId: s?.planId ?? this.plans()[0]?.id ?? '',
      status: s?.status ?? 'ACTIVE',
      end: s?.currentPeriodEnd ? s.currentPeriodEnd.slice(0, 10) : '',
      notes: s?.notes ?? '',
    });
  }

  protected async saveSubscription() {
    const f = this.subForm();
    if (!f) return;
    this.subError.set(null);
    if (!f.planId) return this.subError.set('Elige un plan.');
    this.saving.set(true);
    try {
      await this.api.put(`/admin/users/${f.user.id}/subscription`, {
        planId: f.planId,
        status: f.status,
        // Fecha guardada a mediodía UTC para que no cambie de día al mostrarla.
        currentPeriodEnd: f.end ? new Date(`${f.end}T12:00:00Z`).toISOString() : null,
        notes: f.notes.trim() || null,
      });
      this.subForm.set(null);
      await this.load();
    } catch (err) {
      this.subError.set(errorMessage(err, 'No pudimos guardar la suscripción.'));
    } finally {
      this.saving.set(false);
    }
  }
}
