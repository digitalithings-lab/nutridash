import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { macroGrams, round } from '../../core/calc';
import { PlanStore } from './plan-store';

const PRESETS = [
  { label: 'Equilibrada', cho: 50, pro: 20, fat: 30 },
  { label: 'Moderada en carbohidratos', cho: 45, pro: 20, fat: 35 },
  { label: 'Alta en proteína', cho: 40, pro: 30, fat: 30 },
  { label: 'Tipo DASH', cho: 55, pro: 18, fat: 27 },
];

// Paso 2: distribución de macronutrientes en porcentaje de la energía.
@Component({
  selector: 'app-step-macros',
  imports: [FormsModule],
  template: `
    <div class="mb-5 flex flex-wrap gap-2">
      @for (p of presets; track p.label) {
        <button type="button" class="btn-outline btn-sm" [disabled]="store.readonly()" (click)="apply(p.cho, p.pro, p.fat)">
          {{ p.label }} <span class="text-muted">{{ p.cho }}/{{ p.pro }}/{{ p.fat }}</span>
        </button>
      }
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      @for (m of rows(); track m.key) {
        <div class="rounded-2xl border border-line p-4">
          <div class="flex items-center justify-between">
            <p class="font-bold" [style.color]="m.color">{{ m.label }}</p>
            <p class="text-sm text-muted">{{ m.kcalPerGram }} kcal/g</p>
          </div>
          <div class="mt-3 flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="80"
              class="flex-1"
              [style.accent-color]="m.color"
              [ngModel]="m.pct"
              (ngModelChange)="set(m.key, +$event)"
              [disabled]="store.readonly()"
              [attr.aria-label]="'Porcentaje de ' + m.label"
            />
            <input class="input w-20 text-center font-bold" type="number" [ngModel]="m.pct" (ngModelChange)="set(m.key, +$event)" [disabled]="store.readonly()" />
            <span class="text-sm font-bold text-muted">%</span>
          </div>
          <p class="mt-3 text-3xl font-extrabold">{{ m.grams }} <span class="text-base font-semibold text-muted">g</span></p>
          @if (m.perKg !== null) {
            <p class="text-sm text-muted">{{ m.perKg }} g/kg de peso</p>
          }
        </div>
      }
    </div>

    <div class="mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold" [class]="total() === 100 ? 'bg-brand-50 text-brand-700' : 'bg-danger-100 text-danger-500'">
      Total: {{ total() }} %
      @if (total() !== 100) {
        <span class="font-semibold">· debe sumar 100 %</span>
      }
    </div>

    @if (!store.readonly()) {
      <div class="mt-6 flex justify-end">
        <button class="btn-primary" [disabled]="store.saving() || total() !== 100" (click)="save()">
          {{ store.saving() ? 'Guardando…' : 'Guardar y continuar' }}
        </button>
      </div>
    }
  `,
})
export class StepMacros {
  protected readonly store = inject(PlanStore);
  readonly next = output<void>();
  protected readonly presets = PRESETS;

  protected readonly cho = signal(50);
  protected readonly pro = signal(20);
  protected readonly fat = signal(30);
  protected readonly total = computed(() => this.cho() + this.pro() + this.fat());

  protected readonly rows = computed(() => {
    const plan = this.store.plan();
    const kcal = plan?.targetKcal ?? 0;
    const g = macroGrams(kcal, this.cho(), this.pro(), this.fat());
    const perKg = (grams: number) => (plan?.weightKg ? round(grams / plan.weightKg) : null);
    return [
      { key: 'cho' as const, label: 'Carbohidratos', pct: this.cho(), grams: g.choG, kcalPerGram: 4, color: '#d9a441', perKg: perKg(g.choG) },
      { key: 'pro' as const, label: 'Proteínas', pct: this.pro(), grams: g.proG, kcalPerGram: 4, color: '#c8553d', perKg: perKg(g.proG) },
      { key: 'fat' as const, label: 'Grasas', pct: this.fat(), grams: g.fatG, kcalPerGram: 9, color: '#4f8fd1', perKg: perKg(g.fatG) },
    ];
  });

  constructor() {
    let loaded = false;
    effect(() => {
      const p = this.store.plan();
      if (!p || loaded) return;
      loaded = true;
      this.apply(p.choPct, p.proPct, p.fatPct);
    });
  }

  protected apply(cho: number, pro: number, fat: number) {
    this.cho.set(cho);
    this.pro.set(pro);
    this.fat.set(fat);
  }

  protected set(key: 'cho' | 'pro' | 'fat', value: number) {
    this[key].set(Math.max(0, Math.min(100, Math.round(value || 0))));
  }

  async save() {
    const ok = await this.store.run('put', '/macros', { choPct: this.cho(), proPct: this.pro(), fatPct: this.fat() });
    if (ok) this.next.emit();
  }
}
