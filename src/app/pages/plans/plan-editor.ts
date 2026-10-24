import { DialogService } from '../../shared/dialog';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { EQUATIONS } from '../../core/calc';
import { exchangeModeLabels, fullName, planStatusLabels, servings as fmtServings } from '../../core/format';
import { MealPlan } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, ErrorBanner, SkeletonCards } from '../../shared/ui';
import { PlanStore } from './plan-store';
import { StepEnergy } from './step-energy';
import { StepExchanges } from './step-exchanges';
import { StepMacros } from './step-macros';
import { StepMeals } from './step-meals';
import { StepMenu } from './step-menu';
import { StepReview } from './step-review';

const STEPS = [
  { key: 'energy', label: 'Energía', hint: 'Calorías objetivo' },
  { key: 'macros', label: 'Macronutrientes', hint: 'Distribución %' },
  { key: 'exchanges', label: 'Intercambios', hint: 'Porciones por grupo' },
  { key: 'meals', label: 'Tiempos de comida', hint: 'Reparto del día' },
  { key: 'menu', label: 'Menú', hint: 'Alimentos y sustituciones' },
  { key: 'review', label: 'Revisión', hint: 'Validar y aprobar' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

// Editor del plan alimentario: sigue el flujo clínico paso a paso con un resumen siempre visible.
@Component({
  selector: 'app-plan-editor',
  imports: [RouterLink, Icon, Badge, ErrorBanner, SkeletonCards, StepEnergy, StepMacros, StepExchanges, StepMeals, StepMenu, StepReview],
  providers: [PlanStore],
  template: `
    @if (store.plan(); as plan) {
      <header class="mb-5">
        <a [routerLink]="['/pacientes', plan.patient.id]" class="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand-700">
          <app-icon name="chevronLeft" size="sm" /> {{ name(plan.patient) }} · {{ plan.patient.age }} años
        </a>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{{ plan.title }}</h1>
            <app-badge [badge]="statusLabels[plan.status]" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-outline btn-sm" [disabled]="busy()" (click)="duplicate()"><app-icon name="copy" size="sm" /> Duplicar</button>
            @if (plan.status !== 'APPROVED') {
              <button class="btn-danger btn-sm" [disabled]="busy()" (click)="remove()"><app-icon name="trash" size="sm" /> Eliminar</button>
            }
          </div>
        </div>
      </header>

      @if (plan.status !== 'DRAFT') {
        <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-sky-100 px-4 py-3 text-sm text-sky-700">
          <app-icon name="eye" size="sm" />
          @if (plan.status === 'APPROVED') {
            Plan aprobado: solo lectura. Para cambiarlo, reábrelo desde «Revisión» o duplícalo.
          } @else {
            Plan archivado: solo lectura. Duplícalo para crear uno nuevo a partir de él.
          }
        </div>
      }

      <nav class="mb-5 grid grid-cols-3 gap-2 md:grid-cols-6" aria-label="Pasos del plan">
        @for (s of steps; track s.key; let i = $index) {
          <button
            class="cursor-pointer rounded-xl border px-3 py-2.5 text-left transition"
            [class]="step() === s.key ? 'border-brand-500 bg-brand-600 text-white shadow-soft' : 'border-line bg-white hover:border-brand-200'"
            [attr.aria-current]="step() === s.key ? 'step' : null"
            (click)="go(s.key)"
          >
            <span class="flex items-center gap-2">
              <span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold" [class]="step() === s.key ? 'bg-white text-brand-700' : 'bg-brand-100 text-brand-700'">{{ i + 1 }}</span>
              <span class="truncate text-sm font-bold">{{ s.label }}</span>
            </span>
            <span class="mt-0.5 hidden truncate text-xs lg:block" [class]="step() === s.key ? 'text-brand-100' : 'text-muted'">{{ s.hint }}</span>
          </button>
        }
      </nav>

      <app-error class="mb-4 block" [message]="store.error() || actionError()" />

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section class="card min-w-0">
          <h2 class="mb-4 text-lg font-extrabold">{{ currentStep().label }}</h2>
          @switch (step()) {
            @case ('energy') { <app-step-energy (next)="go('macros')" /> }
            @case ('macros') { <app-step-macros (next)="go('exchanges')" /> }
            @case ('exchanges') { <app-step-exchanges (next)="go('meals')" /> }
            @case ('meals') { <app-step-meals (next)="go('menu')" /> }
            @case ('menu') { <app-step-menu (next)="go('review')" /> }
            @case ('review') { <app-step-review /> }
          }
        </section>

        <aside class="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div class="rounded-2xl bg-brand-700 p-5 text-white shadow-card">
            <p class="text-xs font-bold tracking-wide text-brand-200 uppercase">Objetivo diario</p>
            <p class="text-4xl font-extrabold">{{ plan.target.kcal }} <span class="text-base font-semibold text-brand-200">kcal</span></p>
            <p class="mt-1 text-xs text-brand-100">{{ energySummary(plan) }}</p>
            <div class="mt-4 grid grid-cols-3 gap-2 text-center">
              @for (m of macroCards(); track m.label) {
                <div class="rounded-xl bg-white/10 px-2 py-2">
                  <p class="text-lg font-extrabold">{{ m.grams }}<span class="text-xs">g</span></p>
                  <p class="text-[11px] text-brand-100">{{ m.label }} {{ m.pct }}%</p>
                </div>
              }
            </div>
          </div>

          <div class="card">
            <p class="mb-3 text-xs font-bold tracking-wide text-muted uppercase">Avance del plan</p>
            @for (b of bars(); track b.label) {
              <div class="mb-3 last:mb-0">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="font-bold">{{ b.label }}</span>
                  <span class="text-muted">{{ b.actual }} / {{ b.target }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-mist">
                  <div class="h-full rounded-full transition-all" [style.width.%]="b.width" [style.background]="b.ok ? '#2f8f7a' : '#e07a5f'"></div>
                </div>
              </div>
            }
            <p class="mt-3 text-[11px] text-muted">Barras con los intercambios diarios. Tolerancia ±5 % energía, ±10 % macros.</p>
          </div>

          <div class="card">
            <p class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Intercambios · {{ modeLabel(plan) }}</p>
            <ul class="space-y-1.5 text-sm">
              @for (g of dailyGroups(); track g.key) {
                <li class="flex items-center gap-2">
                  <span class="size-2.5 rounded-full" [style.background]="g.color"></span>
                  <span class="flex-1 truncate">{{ g.name }}</span>
                  <span class="font-bold">{{ fmt(g.servings) }}</span>
                </li>
              } @empty {
                <li class="text-muted">Sin intercambios definidos.</li>
              }
            </ul>
          </div>

          <div class="rounded-2xl px-4 py-3 text-sm font-semibold" [class]="plan.validation.ready ? 'bg-brand-50 text-brand-700' : 'bg-amber-100 text-amber-700'">
            @if (plan.validation.ready) {
              ✓ El plan cumple el objetivo
            } @else {
              {{ plan.validation.warnings.length }} punto(s) por revisar
            }
          </div>
          <p class="px-1 text-[11px] leading-relaxed text-muted">
            Los cálculos y sugerencias son un apoyo. La decisión clínica final es siempre de la nutricionista.
          </p>
        </aside>
      </div>
    } @else if (store.error()) {
      <app-error [message]="store.error()" />
    } @else {
      <app-skeleton-cards [count]="3" />
    }
  `,
})
export class PlanEditor {
  protected readonly store = inject(PlanStore);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);

  readonly planId = input.required<string>();

  protected readonly steps = STEPS;
  protected readonly statusLabels = planStatusLabels;
  protected readonly name = fullName;
  protected readonly fmt = fmtServings;
  protected readonly step = signal<StepKey>('energy');
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly currentStep = computed(() => STEPS.find((s) => s.key === this.step())!);

  protected readonly macroCards = computed(() => {
    const p = this.store.plan();
    if (!p) return [];
    return [
      { label: 'CHO', grams: p.target.choG, pct: p.choPct },
      { label: 'PRO', grams: p.target.proG, pct: p.proPct },
      { label: 'GRA', grams: p.target.fatG, pct: p.fatPct },
    ];
  });

  protected readonly bars = computed(() => {
    const checks = this.store.plan()?.validation.exchangeChecks ?? [];
    return checks.map((c) => ({
      label: c.label,
      actual: c.actual,
      target: c.target,
      ok: c.ok,
      width: c.target ? Math.min(100, (c.actual / c.target) * 100) : 0,
    }));
  });

  protected readonly dailyGroups = computed(() => {
    const p = this.store.plan();
    if (!p) return [];
    return p.system.groups.filter((g) => p.daily[g.key]).map((g) => ({ ...g, servings: p.daily[g.key] }));
  });

  constructor() {
    let loadedId: string | null = null;
    effect(() => {
      const id = this.planId();
      if (id === loadedId) return;
      loadedId = id;
      void this.store.load(id).then(() => {
        // Un plan aprobado o archivado se abre directamente en la revisión.
        if (this.store.plan()?.status !== 'DRAFT') this.step.set('review');
      });
    });
  }

  protected go(step: StepKey) {
    this.step.set(step);
    this.store.error.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected energySummary(plan: MealPlan) {
    if (plan.calorieMethod === 'MANUAL') return 'Definido manualmente';
    const eq = EQUATIONS.find((e) => e.value === plan.equation)?.label ?? '';
    const adj = plan.adjustmentPct ? ` · ajuste ${plan.adjustmentPct} %` : plan.adjustmentKcal ? ` · ajuste ${plan.adjustmentKcal} kcal` : '';
    return `${eq} · GET ${plan.totalKcal ?? '—'} kcal${adj}`;
  }

  protected modeLabel(plan: MealPlan) {
    return exchangeModeLabels[plan.exchangeMode].label;
  }

  async duplicate() {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const copy = await this.api.post<MealPlan>(`/meal-plans/${this.planId()}/duplicate`);
      await this.router.navigate(['/planes', copy.id]);
    } catch (err) {
      this.actionError.set(errorMessage(err, 'No se pudo duplicar el plan.'));
    } finally {
      this.busy.set(false);
    }
  }

  async remove() {
    const plan = this.store.plan();
    if (!plan) return;
    const ok = await this.dialog.confirm({
      title: `¿Eliminar «${plan.title}»?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar plan',
      tone: 'danger',
      icon: 'trash',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.delete(`/meal-plans/${plan.id}`);
      await this.router.navigate(['/pacientes', plan.patient.id]);
    } catch (err) {
      this.actionError.set(errorMessage(err, 'No se pudo eliminar el plan.'));
      this.busy.set(false);
    }
  }
}
