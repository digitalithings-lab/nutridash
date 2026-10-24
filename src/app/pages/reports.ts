import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import { consultationTypeLabels, formatDate, fullName, planStatusLabels } from '../core/format';
import { Patient, PatientListItem } from '../core/types';
import { Icon } from '../shared/icon';
import { Badge, Empty, ErrorBanner, PageHeader, SkeletonCards } from '../shared/ui';

interface ReportCard {
  key: string;
  title: string;
  detail: string;
  path: string;
  badge?: { label: string; classes: string };
}

@Component({
  selector: 'app-reports',
  imports: [FormsModule, RouterLink, Icon, Badge, Empty, ErrorBanner, PageHeader, SkeletonCards],
  template: `
    <app-page-header title="Informes" subtitle="Evaluaciones, planes y progreso de tus pacientes en PDF." />

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Selección de paciente -->
      <section class="card lg:col-span-1">
        <label class="label" for="r-search">Paciente</label>
        <div class="relative">
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft"><app-icon name="search" /></span>
          <input
            id="r-search"
            class="input pl-10"
            type="search"
            placeholder="Buscar paciente"
            [ngModel]="search()"
            (ngModelChange)="onSearch($event)"
          />
        </div>
        <app-error [message]="listError()" />
        <ul class="mt-3 max-h-[60vh] divide-y divide-line overflow-y-auto">
          @if (searching()) {
            @for (i of [1, 2, 3]; track i) {
              <li class="py-2"><div class="skeleton h-9 w-full"></div></li>
            }
          } @else {
            @for (p of results(); track p.id) {
              <li>
                <button
                  class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left"
                  [class]="p.id === selectedId() ? 'bg-brand-50 text-brand-700' : 'hover:bg-canvas'"
                  (click)="select(p.id)"
                >
                  <span class="min-w-0">
                    <span class="block truncate font-bold">{{ name(p) }}</span>
                    <span class="text-xs text-muted">Última consulta: {{ date(p.lastConsultation) }}</span>
                  </span>
                  <app-icon name="chevronRight" />
                </button>
              </li>
            } @empty {
              <li class="py-6 text-center text-sm text-muted">No hay pacientes que coincidan.</li>
            }
          }
        </ul>
      </section>

      <!-- Informes del paciente -->
      <section class="lg:col-span-2">
        @if (!selectedId()) {
          <div class="card">
            <app-empty emoji="📄" title="Elige un paciente" text="Verás sus evaluaciones, planes alimentarios e informe de progreso listos para abrir en PDF." />
          </div>
        } @else if (loading()) {
          <app-skeleton-cards [count]="4" grid="sm:grid-cols-2" />
        } @else if (patient(); as p) {
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-extrabold">{{ name(p) }}</h2>
            <a class="btn-ghost btn-sm" [routerLink]="['/pacientes', p.id]">Ver expediente <app-icon name="chevronRight" /></a>
          </div>
          <app-error [message]="error()" />

          @if (groups().length === 0) {
            <div class="card">
              <app-empty emoji="🗒️" title="Sin informes todavía" text="Registra una consulta o crea un plan alimentario para generar informes." />
            </div>
          }
          @for (g of groups(); track g.title) {
            <h3 class="mt-5 mb-2 text-xs font-bold tracking-wide text-muted uppercase first:mt-0">{{ g.title }}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              @for (r of g.items; track r.key) {
                <button class="card flex cursor-pointer items-start gap-3 p-4 text-left transition hover:border-brand-200 hover:bg-brand-50 disabled:opacity-60" (click)="open(r)" [disabled]="opening() === r.key">
                  <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"><app-icon name="document" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {{ r.title }}
                      @if (r.badge) {
                        <app-badge [badge]="r.badge" />
                      }
                    </span>
                    <span class="block text-sm text-muted">{{ opening() === r.key ? 'Generando PDF…' : r.detail }}</span>
                  </span>
                </button>
              }
            </div>
          }
        } @else {
          <app-error [message]="error()" />
        }
      </section>
    </div>
  `,
})
export class Reports implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // Permite abrir la página con un paciente elegido (?paciente=id).
  readonly paciente = input<string>();

  protected readonly name = fullName;
  protected readonly date = (iso: string | null) => formatDate(iso, 'short');

  protected readonly search = signal('');
  protected readonly results = signal<PatientListItem[]>([]);
  protected readonly searching = signal(true);
  protected readonly listError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly patient = signal<Patient | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly opening = signal<string | null>(null);

  private timer?: ReturnType<typeof setTimeout>;
  private requestId = 0;

  protected readonly groups = computed(() => {
    const p = this.patient();
    if (!p) return [];
    const out: { title: string; items: ReportCard[] }[] = [];
    if (p.consultations.length) {
      out.push({
        title: 'Progreso',
        items: [
          {
            key: 'progress',
            title: 'Informe de progreso',
            detail: `${p.consultations.length} consultas · evolución de peso y medidas`,
            path: `/reports/patients/${p.id}/progress.pdf`,
          },
        ],
      });
      out.push({
        title: 'Evaluaciones por consulta',
        items: p.consultations.map((c) => ({
          key: 'eval-' + c.id,
          title: `Evaluación del ${formatDate(c.date, 'short')}`,
          detail: consultationTypeLabels[c.type] + (c.weightKg !== null ? ` · ${c.weightKg} kg` : ''),
          path: `/reports/consultations/${c.id}/evaluation.pdf`,
        })),
      });
    }
    if (p.mealPlans.length) {
      out.push({
        title: 'Planes alimentarios',
        items: p.mealPlans.flatMap((plan) => [
          {
            key: 'plan-' + plan.id,
            title: plan.title,
            detail: `Plan alimentario · ${plan.targetKcal} kcal`,
            path: `/reports/meal-plans/${plan.id}/plan.pdf`,
            badge: planStatusLabels[plan.status],
          },
          {
            key: 'calc-' + plan.id,
            title: `Cálculos · ${plan.title}`,
            detail: 'Energía, macronutrientes e intercambios',
            path: `/reports/meal-plans/${plan.id}/calculations.pdf`,
          },
        ]),
      });
    }
    return out;
  });

  constructor() {
    void this.loadList();
    effect(() => {
      const id = this.paciente();
      if (id) untracked(() => void this.select(id, false));
    });
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadList(), 300);
  }

  private async loadList() {
    const id = ++this.requestId;
    this.searching.set(true);
    this.listError.set(null);
    const q = this.search().trim();
    try {
      const list = await this.api.get<PatientListItem[]>(`/patients${q ? '?search=' + encodeURIComponent(q) : ''}`);
      if (id === this.requestId) this.results.set(list);
    } catch (err) {
      if (id === this.requestId) this.listError.set(errorMessage(err, 'No pudimos cargar los pacientes.'));
    } finally {
      if (id === this.requestId) this.searching.set(false);
    }
  }

  protected async select(id: string, updateUrl = true) {
    if (this.selectedId() === id && (this.patient() || this.loading())) return;
    this.selectedId.set(id);
    if (updateUrl) void this.router.navigate([], { queryParams: { paciente: id }, replaceUrl: true });
    this.loading.set(true);
    this.error.set(null);
    this.patient.set(null);
    try {
      const p = await this.api.get<Patient>(`/patients/${id}`);
      if (this.selectedId() === id) this.patient.set(p);
    } catch (err) {
      if (this.selectedId() === id) this.error.set(errorMessage(err, 'No pudimos cargar los informes del paciente.'));
    } finally {
      if (this.selectedId() === id) this.loading.set(false);
    }
  }

  protected async open(r: ReportCard) {
    this.opening.set(r.key);
    this.error.set(null);
    try {
      await this.api.openPdf(r.path);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos generar el PDF.'));
    } finally {
      this.opening.set(null);
    }
  }
}
