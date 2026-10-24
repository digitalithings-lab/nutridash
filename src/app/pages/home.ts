import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import { AuthService } from '../core/auth.service';
import { appointmentStatusLabels, appointmentTypeLabels, formatDate, formatDateTime, formatTime, fullName } from '../core/format';
import { HomeSummary } from '../core/types';
import { Icon } from '../shared/icon';
import { Badge, Empty, ErrorBanner, SkeletonCards, Stat } from '../shared/ui';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon, Stat, Badge, Empty, ErrorBanner, SkeletonCards],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">¡Hola, {{ firstName() }}!</h1>
        <p class="mt-1 text-muted">Aquí tienes un resumen de tu día.</p>
      </div>
      @if (trialNotice(); as notice) {
        <a routerLink="/configuracion" class="chip bg-amber-100 px-3 py-2 text-amber-700">{{ notice }}</a>
      }
    </header>

    <app-error [message]="error()" />

    @if (data(); as d) {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <app-stat label="Pacientes activos" [value]="d.stats.activePatients" icon="users" />
        <app-stat label="Citas hoy" [value]="d.stats.appointmentsToday" icon="calendar" tone="bg-sky-100 text-sky-700" />
        <app-stat label="Seguimientos pendientes" [value]="d.stats.pendingFollowUps" icon="heart" tone="bg-coral-100 text-coral-700" />
        <app-stat label="Planes por revisar" [value]="d.stats.plansToReview" icon="clipboard" tone="bg-amber-100 text-amber-700" />
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-3">
        <section class="card xl:col-span-2">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold">Citas de hoy</h2>
            <a routerLink="/agenda" class="btn-ghost btn-sm">Ver agenda <app-icon name="chevronRight" size="sm" /></a>
          </div>
          @if (d.today.length) {
            <ul class="divide-y divide-line">
              @for (a of d.today; track a.id) {
                <li class="flex flex-wrap items-center gap-3 py-3">
                  <span class="w-16 text-sm font-bold text-brand-700">{{ time(a.startsAt) }}</span>
                  <a [routerLink]="['/pacientes', a.patient.id]" class="min-w-0 flex-1">
                    <p class="truncate font-bold hover:text-brand-700">{{ name(a.patient) }}</p>
                    <p class="text-xs text-muted">{{ typeLabels[a.type] }} · {{ a.durationMinutes }} min</p>
                  </a>
                  <app-badge [badge]="statusLabels[a.status]" />
                  @if (a.status === 'SCHEDULED') {
                    <a [routerLink]="['/pacientes', a.patient.id, 'consultas', 'nueva']" class="btn-secondary btn-sm">Atender</a>
                  }
                </li>
              }
            </ul>
          } @else {
            <app-empty emoji="📅" title="No tienes citas hoy" text="Aprovecha para revisar planes o hacer seguimientos." />
          }

          @if (d.upcoming.length) {
            <h3 class="mt-6 mb-2 text-sm font-bold tracking-wide text-muted uppercase">Próximas</h3>
            <ul class="divide-y divide-line">
              @for (a of d.upcoming; track a.id) {
                <li class="flex items-center gap-3 py-2.5 text-sm">
                  <span class="w-40 shrink-0 text-muted">{{ dateTime(a.startsAt) }}</span>
                  <a [routerLink]="['/pacientes', a.patient.id]" class="flex-1 truncate font-semibold hover:text-brand-700">{{ name(a.patient) }}</a>
                  <span class="hidden text-xs text-muted sm:inline">{{ typeLabels[a.type] }}</span>
                </li>
              }
            </ul>
          }
        </section>

        <section class="space-y-6">
          <div class="card">
            <h2 class="mb-3 text-lg font-extrabold">Accesos rápidos</h2>
            <div class="grid gap-2">
              <a routerLink="/pacientes" [queryParams]="{ nuevo: 1 }" class="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 font-bold text-brand-700 hover:bg-brand-100">
                <app-icon name="plus" /> Nuevo paciente
              </a>
              <a routerLink="/agenda" class="flex items-center gap-3 rounded-xl bg-sky-100 px-4 py-3 font-bold text-sky-700 hover:opacity-80">
                <app-icon name="calendar" /> Agendar cita
              </a>
              <a routerLink="/alimentos" class="flex items-center gap-3 rounded-xl bg-amber-100 px-4 py-3 font-bold text-amber-700 hover:opacity-80">
                <app-icon name="apple" /> Base de alimentos
              </a>
            </div>
          </div>

          <div class="card">
            <h2 class="mb-3 text-lg font-extrabold">Planes en borrador</h2>
            @for (p of d.draftPlans; track p.id) {
              <a [routerLink]="['/planes', p.id]" class="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas">
                <span class="min-w-0">
                  <span class="block truncate text-sm font-bold">{{ name(p.patient) }}</span>
                  <span class="block truncate text-xs text-muted">{{ p.title }} · {{ p.targetKcal }} kcal</span>
                </span>
                <app-icon name="chevronRight" size="sm" />
              </a>
            } @empty {
              <p class="text-sm text-muted">No tienes planes pendientes de aprobar.</p>
            }
          </div>

          <div class="card">
            <h2 class="mb-1 text-lg font-extrabold">Necesitan seguimiento</h2>
            <p class="mb-3 text-xs text-muted">Sin consulta en los últimos 30 días ni cita programada.</p>
            @for (p of d.followUps; track p.id) {
              <a [routerLink]="['/pacientes', p.id]" class="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas">
                <span class="truncate text-sm font-bold">{{ name(p) }}</span>
                <span class="shrink-0 text-xs text-muted">{{ date(p.lastConsultation) }}</span>
              </a>
            } @empty {
              <p class="text-sm text-muted">Todos tus pacientes están al día.</p>
            }
          </div>
        </section>
      </div>
    } @else if (!error()) {
      <app-skeleton-cards [count]="4" grid="sm:grid-cols-2 xl:grid-cols-4" />
    }
  `,
})
export class Home implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  protected readonly data = signal<HomeSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly typeLabels = appointmentTypeLabels;
  protected readonly statusLabels = appointmentStatusLabels;
  protected readonly name = fullName;
  protected readonly time = formatTime;
  protected readonly dateTime = formatDateTime;
  protected readonly date = (iso: string | null) => formatDate(iso, 'short');

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');

  // Aviso de días restantes de prueba.
  protected readonly trialNotice = computed(() => {
    const sub = this.auth.user()?.subscription;
    if (sub?.status !== 'TRIAL' || !sub.currentPeriodEnd) return null;
    const days = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000);
    return days > 0 ? `Prueba gratis: te quedan ${days} días` : 'Tu periodo de prueba terminó';
  });

  async ngOnInit() {
    try {
      this.data.set(await this.api.get<HomeSummary>('/home'));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar el resumen.'));
    }
  }
}
