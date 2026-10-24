import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatMoney, subscriptionStatusLabels } from '../../core/format';
import { AdminOverview, SubscriptionStatus } from '../../core/types';
import { Badge, ErrorBanner, PageHeader, SkeletonCards, Stat } from '../../shared/ui';

const BAR_COLORS: Record<SubscriptionStatus, string> = {
  TRIAL: 'bg-amber-500',
  ACTIVE: 'bg-brand-500',
  PAST_DUE: 'bg-coral-500',
  CANCELLED: 'bg-line-strong',
};

@Component({
  selector: 'app-admin-overview',
  imports: [RouterLink, Badge, ErrorBanner, PageHeader, SkeletonCards, Stat],
  template: `
    <app-page-header title="Resumen" subtitle="Estado general de NutriPro." />
    <app-error [message]="error()" />

    @if (loading()) {
      <app-skeleton-cards [count]="6" grid="sm:grid-cols-2 lg:grid-cols-3" />
    } @else if (data(); as d) {
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <app-stat label="Nutricionistas" [value]="d.nutritionists" icon="users" />
        <app-stat label="Altas últimos 30 días" [value]="d.newSignups" icon="sparkles" tone="bg-violet-100 text-violet-500" />
        <app-stat label="Pacientes activos" [value]="d.activePatients" icon="heart" tone="bg-coral-100 text-coral-700" />
        <app-stat label="Planes aprobados" [value]="d.approvedPlans" icon="clipboard" tone="bg-sky-100 text-sky-700" />
        <app-stat label="Solicitudes abiertas" [value]="d.openTickets" icon="lifebuoy" tone="bg-amber-100 text-amber-700" />
        <app-stat label="Ingreso mensual estimado" [value]="money(d.monthlyRevenueCents)" icon="chart" />
      </div>

      <section class="card mt-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-extrabold">Suscripciones por estado</h2>
          <a routerLink="/admin/cuentas" class="text-sm font-bold text-brand-700 hover:underline">Ver cuentas</a>
        </div>
        @if (totalSubs()) {
          <div class="flex h-3 overflow-hidden rounded-full bg-mist">
            @for (s of breakdown(); track s.status) {
              <div [class]="s.color" [style.width.%]="s.pct" [attr.title]="s.badge.label + ': ' + s.count"></div>
            }
          </div>
          <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            @for (s of breakdown(); track s.status) {
              <li class="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                <span class="flex items-center gap-2"><span class="size-2.5 rounded-full" [class]="s.color"></span><app-badge [badge]="s.badge" /></span>
                <span class="text-right"><b class="text-lg">{{ s.count }}</b> <span class="text-xs text-muted">{{ s.pct }} %</span></span>
              </li>
            }
          </ul>
        } @else {
          <p class="text-sm text-muted">Aún no hay suscripciones.</p>
        }
        <p class="mt-4 text-xs text-muted">El ingreso estimado suma el precio mensual de las suscripciones activas.</p>
      </section>
    }
  `,
})
export class AdminOverviewPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly money = (cents: number) => formatMoney(cents);

  protected readonly data = signal<AdminOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly totalSubs = computed(() => Object.values(this.data()?.subscriptions ?? {}).reduce((a, b) => a + (b ?? 0), 0));

  protected readonly breakdown = computed(() => {
    const subs = this.data()?.subscriptions ?? {};
    const total = this.totalSubs() || 1;
    return (Object.keys(subscriptionStatusLabels) as SubscriptionStatus[]).map((status) => {
      const count = subs[status] ?? 0;
      return { status, count, pct: Math.round((count / total) * 100), badge: subscriptionStatusLabels[status], color: BAR_COLORS[status] };
    });
  });

  async ngOnInit() {
    try {
      this.data.set(await this.api.get<AdminOverview>('/admin/overview'));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar el resumen.'));
    } finally {
      this.loading.set(false);
    }
  }
}
