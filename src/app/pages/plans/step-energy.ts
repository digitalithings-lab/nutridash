import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ACTIVITY_FACTORS, energy, EnergyInputError, EQUATIONS } from '../../core/calc';
import { CalorieMethod, Equation, Sex } from '../../core/types';
import { PlanStore } from './plan-store';

type Adjustment = 'none' | 'pct' | 'kcal';

// Paso 1: método de calorías (automático con ecuación o manual) y ajuste del objetivo.
@Component({
  selector: 'app-step-energy',
  imports: [FormsModule],
  template: `
    <div class="mb-5 inline-flex rounded-xl bg-mist p-1">
      @for (m of methods; track m.value) {
        <button
          type="button"
          class="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold transition"
          [class]="method() === m.value ? 'bg-white text-brand-700 shadow-soft' : 'text-muted hover:text-ink'"
          [disabled]="store.readonly()"
          (click)="method.set(m.value)"
        >
          {{ m.label }}
        </button>
      }
    </div>

    @if (method() === 'AUTOMATIC') {
      <div class="grid gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <label class="label" for="equation">Ecuación</label>
          <select id="equation" class="input" [ngModel]="equation()" (ngModelChange)="equation.set($event)" [disabled]="store.readonly()">
            @for (e of equations; track e.value) {
              <option [value]="e.value">{{ e.label }} — {{ e.needs }}</option>
            }
          </select>
        </div>
        <div>
          <label class="label" for="weight">Peso (kg)</label>
          <input id="weight" class="input" type="number" step="0.1" [ngModel]="weight()" (ngModelChange)="weight.set($event)" [disabled]="store.readonly()" />
        </div>
        <div>
          <label class="label" for="height">Talla (cm)</label>
          <input id="height" class="input" type="number" step="0.1" [ngModel]="height()" (ngModelChange)="height.set($event)" [disabled]="store.readonly()" />
        </div>
        <div>
          <label class="label" for="age">Edad (años)</label>
          <input id="age" class="input" type="number" [ngModel]="age()" (ngModelChange)="age.set($event)" [disabled]="store.readonly()" />
        </div>
        <div>
          <label class="label" for="sex">Sexo</label>
          <select id="sex" class="input" [ngModel]="sex()" (ngModelChange)="sex.set($event)" [disabled]="store.readonly()">
            <option value="FEMALE">Femenino</option>
            <option value="MALE">Masculino</option>
          </select>
        </div>
        @if (equation() === 'KATCH_MCARDLE') {
          <div>
            <label class="label" for="fat">% de grasa corporal</label>
            <input id="fat" class="input" type="number" step="0.1" [ngModel]="bodyFat()" (ngModelChange)="bodyFat.set($event)" [disabled]="store.readonly()" />
          </div>
        }
        @if (equation() === 'KCAL_PER_KG') {
          <div>
            <label class="label" for="kcalkg">Kcal por kg de peso</label>
            <input id="kcalkg" class="input" type="number" step="0.5" [ngModel]="kcalPerKg()" (ngModelChange)="kcalPerKg.set($event)" [disabled]="store.readonly()" />
          </div>
        } @else {
          <div>
            <label class="label" for="activity">Factor de actividad</label>
            <select id="activity" class="input" [ngModel]="activity()" (ngModelChange)="activity.set(+$event)" [disabled]="store.readonly()">
              @for (a of activityFactors; track a.value) {
                <option [ngValue]="a.value">{{ a.label }} (× {{ a.value }})</option>
              }
              @if (!isKnownFactor()) {
                <option [ngValue]="activity()">Personalizado (× {{ activity() }})</option>
              }
            </select>
          </div>
        }
      </div>

      <div class="mt-6 rounded-2xl border border-line bg-canvas p-4">
        <p class="label">Revisar y ajustar objetivo</p>
        <div class="flex flex-wrap items-end gap-3">
          <select class="input w-auto" [ngModel]="adjustment()" (ngModelChange)="adjustment.set($event)" [disabled]="store.readonly()" aria-label="Tipo de ajuste">
            <option value="none">Sin ajuste (mantenimiento)</option>
            <option value="pct">Porcentaje</option>
            <option value="kcal">Kcal fijas</option>
          </select>
          @if (adjustment() !== 'none') {
            <input
              class="input w-32"
              type="number"
              [ngModel]="adjustmentValue()"
              (ngModelChange)="adjustmentValue.set($event)"
              [disabled]="store.readonly()"
              [attr.aria-label]="adjustment() === 'pct' ? 'Porcentaje de ajuste' : 'Kcal de ajuste'"
            />
            <span class="pb-2.5 text-sm text-muted">{{ adjustment() === 'pct' ? '%' : 'kcal' }} (negativo = déficit)</span>
          }
          <div class="ml-auto flex gap-2">
            @for (p of presets; track p) {
              <button type="button" class="btn-outline btn-sm" [disabled]="store.readonly()" (click)="adjustment.set('pct'); adjustmentValue.set(p)">
                {{ p > 0 ? '+' : '' }}{{ p }} %
              </button>
            }
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl bg-mist p-4">
          <p class="text-xs font-bold text-muted uppercase">Gasto en reposo (GER)</p>
          <p class="text-2xl font-extrabold">{{ preview().result?.restingKcal ?? '—' }} <span class="text-sm font-semibold text-muted">kcal</span></p>
        </div>
        <div class="rounded-2xl bg-mist p-4">
          <p class="text-xs font-bold text-muted uppercase">Gasto total (GET)</p>
          <p class="text-2xl font-extrabold">{{ preview().result?.totalKcal ?? '—' }} <span class="text-sm font-semibold text-muted">kcal</span></p>
        </div>
        <div class="rounded-2xl bg-brand-600 p-4 text-white">
          <p class="text-xs font-bold text-brand-100 uppercase">Objetivo calórico</p>
          <p class="text-2xl font-extrabold">{{ preview().result?.targetKcal ?? '—' }} <span class="text-sm font-semibold text-brand-100">kcal</span></p>
        </div>
      </div>
      @if (preview().error) {
        <p class="mt-3 text-sm font-semibold text-danger-500">{{ preview().error }}</p>
      }
    } @else {
      <div class="max-w-sm">
        <label class="label" for="manual">Calorías objetivo (kcal/día)</label>
        <input id="manual" class="input text-lg font-bold" type="number" step="10" [ngModel]="manualKcal()" (ngModelChange)="manualKcal.set($event)" [disabled]="store.readonly()" />
        <p class="mt-2 text-sm text-muted">Usa el modo manual cuando ya definiste el requerimiento por otro método.</p>
      </div>
    }

    @if (!store.readonly()) {
      <div class="mt-6 flex justify-end">
        <button class="btn-primary" [disabled]="store.saving() || !canSave()" (click)="save()">
          {{ store.saving() ? 'Guardando…' : 'Guardar y continuar' }}
        </button>
      </div>
    }
  `,
})
export class StepEnergy {
  protected readonly store = inject(PlanStore);
  readonly next = output<void>();

  protected readonly methods: { value: CalorieMethod; label: string }[] = [
    { value: 'AUTOMATIC', label: 'Automático' },
    { value: 'MANUAL', label: 'Manual' },
  ];
  protected readonly equations = EQUATIONS;
  protected readonly activityFactors = ACTIVITY_FACTORS;
  protected readonly presets = [-20, -15, -10, 10];

  protected readonly method = signal<CalorieMethod>('AUTOMATIC');
  protected readonly equation = signal<Equation>('MIFFLIN_ST_JEOR');
  protected readonly weight = signal<number | null>(null);
  protected readonly height = signal<number | null>(null);
  protected readonly age = signal<number | null>(null);
  protected readonly sex = signal<Sex>('FEMALE');
  protected readonly bodyFat = signal<number | null>(null);
  protected readonly kcalPerKg = signal<number | null>(25);
  protected readonly activity = signal(1.375);
  protected readonly adjustment = signal<Adjustment>('none');
  protected readonly adjustmentValue = signal<number | null>(null);
  protected readonly manualKcal = signal<number | null>(null);

  protected readonly isKnownFactor = computed(() => ACTIVITY_FACTORS.some((a) => a.value === this.activity()));

  // Cálculo en vivo con la misma fórmula del backend.
  protected readonly preview = computed(() => {
    const weight = Number(this.weight());
    if (!weight) return { result: null, error: 'Indica el peso para calcular.' };
    try {
      const adj = Number(this.adjustmentValue()) || null;
      return {
        result: energy({
          equation: this.equation(),
          sex: this.sex(),
          ageYears: Number(this.age()) || 0,
          weightKg: weight,
          heightCm: Number(this.height()) || null,
          bodyFatPct: Number(this.bodyFat()) || null,
          kcalPerKg: Number(this.kcalPerKg()) || null,
          activityFactor: this.activity(),
          adjustmentPct: this.adjustment() === 'pct' ? adj : null,
          adjustmentKcal: this.adjustment() === 'kcal' ? adj : null,
        }),
        error: null,
      };
    } catch (err) {
      return { result: null, error: err instanceof EnergyInputError ? err.message : 'Revisa los datos.' };
    }
  });

  protected readonly canSave = computed(() =>
    this.method() === 'MANUAL' ? Number(this.manualKcal()) >= 500 : this.preview().result !== null,
  );

  constructor() {
    // Carga los valores guardados cuando llega el plan (solo la primera vez).
    let loaded = false;
    effect(() => {
      const p = this.store.plan();
      if (!p || loaded) return;
      loaded = true;
      this.method.set(p.calorieMethod);
      this.equation.set(p.equation ?? 'MIFFLIN_ST_JEOR');
      this.weight.set(p.weightKg);
      this.height.set(p.heightCm);
      this.age.set(p.ageYears ?? p.patient.age);
      this.sex.set(p.sex ?? p.patient.sex);
      this.bodyFat.set(p.bodyFatPct);
      if (p.kcalPerKg) this.kcalPerKg.set(p.kcalPerKg);
      if (p.activityFactor) this.activity.set(p.activityFactor);
      if (p.adjustmentPct) {
        this.adjustment.set('pct');
        this.adjustmentValue.set(p.adjustmentPct);
      } else if (p.adjustmentKcal) {
        this.adjustment.set('kcal');
        this.adjustmentValue.set(p.adjustmentKcal);
      }
      this.manualKcal.set(p.targetKcal);
    });
  }

  async save() {
    const adj = Number(this.adjustmentValue()) || null;
    const body =
      this.method() === 'MANUAL'
        ? { calorieMethod: 'MANUAL', targetKcal: Math.round(Number(this.manualKcal())) }
        : {
            calorieMethod: 'AUTOMATIC',
            equation: this.equation(),
            weightKg: Number(this.weight()),
            heightCm: Number(this.height()) || undefined,
            ageYears: Number(this.age()) || undefined,
            sex: this.sex(),
            bodyFatPct: Number(this.bodyFat()) || undefined,
            kcalPerKg: this.equation() === 'KCAL_PER_KG' ? Number(this.kcalPerKg()) : undefined,
            activityFactor: this.activity(),
            adjustmentPct: this.adjustment() === 'pct' ? Math.round(adj ?? 0) || null : null,
            adjustmentKcal: this.adjustment() === 'kcal' ? Math.round(adj ?? 0) || null : null,
          };
    if (await this.store.run('put', '/energy', body)) this.next.emit();
  }
}
