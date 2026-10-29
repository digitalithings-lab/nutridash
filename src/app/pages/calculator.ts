import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import {
  ACTIVITY_FACTORS,
  ageFrom,
  anthropometry,
  armIndices,
  BODY_FAT_METHODS,
  BodyFatMethod,
  bodyFat,
  bodyFatCategory,
  energy,
  EnergyInputError,
  energyWeight,
  EQUATIONS,
  Equation,
  macroGrams,
  round,
  Skinfolds,
  SKINFOLDS,
  WEIGHT_BASES,
  WeightBasis,
} from '../core/calc';
import { fullName, todayIso } from '../core/format';
import { Consultation, Patient, PatientListItem, Sex } from '../core/types';
import { Icon } from '../shared/icon';
import { ErrorBanner, PageHeader } from '../shared/ui';

type NumField = 'age' | 'weight' | 'usual' | 'height' | 'waist' | 'hip' | 'arm';

const CIRCUMFERENCES: { key: NumField; label: string }[] = [
  { key: 'waist', label: 'Cintura' },
  { key: 'hip', label: 'Cadera' },
  { key: 'arm', label: 'Brazo' },
];

// Métodos de % de grasa de la calculadora (sin el de circunferencias, que necesita el cuello).
const CALCULATOR_FAT_METHODS = BODY_FAT_METHODS.filter((m) => m.value !== 'NAVY');

// Calculadora rápida: IMC, % de grasa por varios métodos, calorías por ecuación y macros,
// sin necesidad de abrir una consulta. Opcionalmente precarga y guarda los datos de un paciente.
@Component({
  selector: 'app-calculator',
  imports: [FormsModule, Icon, PageHeader, ErrorBanner],
  template: `
    <app-page-header title="Calculadora nutricional" subtitle="IMC, porcentaje de grasa, calorías y macronutrientes en un solo lugar." />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <!-- Datos -->
      <div class="space-y-5">
        <section class="card">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-extrabold">Paciente</h2>
            @if (patient(); as p) {
              <button class="btn-ghost btn-sm" (click)="clearPatient()"><app-icon name="x" size="sm" /> Quitar</button>
            }
          </div>
          @if (patient(); as p) {
            <div class="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3">
              <span class="grid size-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{{ p.firstName[0] }}{{ p.lastName[0] }}</span>
              <div>
                <p class="font-bold">{{ name(p) }}</p>
                <p class="text-xs text-muted">Datos precargados de su última consulta</p>
              </div>
            </div>
          } @else {
            <div class="relative">
              <input class="input" placeholder="Buscar paciente (opcional)…" [ngModel]="search()" (ngModelChange)="onSearch($event)" aria-label="Buscar paciente" />
              @if (results().length) {
                <ul class="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-card">
                  @for (r of results(); track r.id) {
                    <li>
                      <button class="w-full cursor-pointer px-4 py-2.5 text-left hover:bg-canvas" (click)="selectPatient(r)">
                        <span class="font-semibold">{{ name(r) }}</span>
                        <span class="text-xs text-muted"> · {{ r.age }} años</span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
            <p class="mt-2 text-xs text-muted">Sin paciente puedes calcular igual; con paciente, puedes guardar las medidas como consulta.</p>
          }
        </section>

        <section class="card">
          <h2 class="mb-4 text-lg font-extrabold">Datos básicos</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span class="label">Sexo</span>
              <div class="flex rounded-xl bg-mist p-1">
                @for (s of sexes; track s.value) {
                  <button
                    type="button"
                    class="flex-1 cursor-pointer rounded-lg py-2 text-sm font-bold"
                    [class]="sex() === s.value ? 'bg-surface text-brand-700 shadow-soft' : 'text-muted'"
                    (click)="sex.set(s.value)"
                  >
                    {{ s.label }}
                  </button>
                }
              </div>
            </div>
            <div>
              <label class="label" for="calc-age">Edad (años)</label>
              <input id="calc-age" class="input" type="number" min="1" max="110" [ngModel]="v().age" (ngModelChange)="set('age', $event)" />
            </div>
            <div>
              <label class="label" for="calc-weight">Peso (kg)</label>
              <input id="calc-weight" class="input" type="number" step="0.1" [ngModel]="v().weight" (ngModelChange)="set('weight', $event)" />
            </div>
            <div>
              <label class="label" for="calc-height">Talla (cm)</label>
              <input id="calc-height" class="input" type="number" step="0.1" [ngModel]="v().height" (ngModelChange)="set('height', $event)" />
            </div>
            <div>
              <label class="label" for="calc-usual">Peso habitual (kg)</label>
              <input id="calc-usual" class="input" type="number" step="0.1" [ngModel]="v().usual" (ngModelChange)="set('usual', $event)" />
            </div>
          </div>
        </section>

        <section class="card">
          <h2 class="mb-1 text-lg font-extrabold">Circunferencias <span class="text-sm font-semibold text-muted">(cm)</span></h2>
          <p class="mb-4 text-xs text-muted">Cintura y cadera para el riesgo cardiometabólico; brazo (con el pliegue tricipital) para el músculo del brazo.</p>
          <div class="grid gap-4 sm:grid-cols-3">
            @for (c of circumferences; track c.key) {
              <div>
                <label class="label" [for]="'calc-' + c.key">{{ c.label }}</label>
                <input [id]="'calc-' + c.key" class="input" type="number" step="0.1" [ngModel]="v()[c.key]" (ngModelChange)="set(c.key, $event)" />
              </div>
            }
          </div>
        </section>

        <section class="card">
          <h2 class="mb-1 text-lg font-extrabold">Pliegues cutáneos <span class="text-sm font-semibold text-muted">(mm, con plicómetro)</span></h2>
          <p class="mb-4 text-xs text-muted">Llena los que midas. Durnin-Womersley usa bicipital, tricipital, subescapular y suprailíaco.</p>
          <div class="grid gap-4 sm:grid-cols-4">
            @for (f of skinfoldFields; track f.key) {
              <div>
                <label class="label" [for]="'calc-sf-' + f.key">{{ f.label }}</label>
                <input [id]="'calc-sf-' + f.key" class="input" type="number" step="0.5" [ngModel]="folds()[f.key]" (ngModelChange)="setFold(f.key, $event)" />
              </div>
            }
          </div>
        </section>

        <section class="card">
          <h2 class="mb-4 text-lg font-extrabold">Requerimiento de energía</h2>
          <div class="mb-4 rounded-xl bg-brand-50 p-3">
            <label class="label" for="calc-basis">Peso para calcular las calorías</label>
            <select id="calc-basis" class="input" [ngModel]="basis()" (ngModelChange)="basis.set($event)">
              @for (b of weightBases; track b.value) {
                <option [value]="b.value">{{ b.label }}</option>
              }
            </select>
            @if (usedWeight(); as w) {
              <p class="mt-2 text-sm font-semibold text-brand-700">{{ w.explanation }}.</p>
            }
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="label" for="calc-activity">Actividad física</label>
              <select id="calc-activity" class="input" [ngModel]="activity()" (ngModelChange)="activity.set(+$event)">
                @for (a of activityFactors; track a.value) {
                  <option [ngValue]="a.value">{{ a.label }} (× {{ a.value }})</option>
                }
              </select>
            </div>
            <div>
              <label class="label" for="calc-adj">Ajuste del objetivo (%)</label>
              <input id="calc-adj" class="input" type="number" min="-50" max="50" [ngModel]="adjustment()" (ngModelChange)="adjustment.set(+$event || 0)" />
            </div>
            <div>
              <label class="label" for="calc-eq">Ecuación para el objetivo</label>
              <select id="calc-eq" class="input" [ngModel]="equation()" (ngModelChange)="equation.set($event)">
                @for (e of equationOptions; track e.value) {
                  <option [value]="e.value">{{ e.label }}</option>
                }
              </select>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            @for (p of [-20, -15, -10, 0, 10, 15]; track p) {
              <button type="button" class="chip cursor-pointer" [class]="adjustment() === p ? 'bg-brand-600 text-white' : 'bg-mist text-muted'" (click)="adjustment.set(p)">
                {{ p > 0 ? '+' : '' }}{{ p }} %{{ p === 0 ? ' (mantener)' : '' }}
              </button>
            }
          </div>
        </section>
      </div>

      <!-- Resultados -->
      <aside class="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <section class="rounded-2xl bg-hero p-5 text-white shadow-card">
          <p class="text-xs font-bold tracking-wide text-white/70 uppercase">Índice de masa corporal</p>
          @if (bmi(); as b) {
            <p class="text-4xl font-extrabold">{{ b.value }} <span class="text-base font-semibold text-white/70">kg/m²</span></p>
            <p class="mt-1 font-bold" [class.text-[#ffe1a3]]="b.alert">{{ b.status }}</p>
            <div class="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div class="h-full rounded-full bg-surface" [style.width.%]="b.bar"></div>
            </div>
            <div class="mt-1 flex justify-between text-[10px] text-white/70"><span>16</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>
          } @else {
            <p class="mt-2 text-sm text-white/85">Escribe peso y talla.</p>
          }
          @if (weightRefs().length) {
            <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
              @for (r of weightRefs(); track r.label) {
                <div class="rounded-xl bg-white/10 px-3 py-2">
                  <p class="text-[11px] text-white/70">{{ r.label }}</p>
                  <p class="font-bold">{{ r.value }}</p>
                  @if (r.formula) {
                    <p class="text-[10px] text-white/70">{{ r.formula }}</p>
                  }
                </div>
              }
            </div>
          }
        </section>

        <section class="card">
          <h2 class="text-lg font-extrabold">Porcentaje de grasa</h2>
          <div class="mt-3 space-y-2">
            @for (r of fatResults(); track r.method) {
              <label
                class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition"
                [class]="fatMethod() === r.method ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-line-strong'"
              >
                <input type="radio" name="fat-method" class="accent-brand-600" [checked]="fatMethod() === r.method" [disabled]="r.bodyFatPct === null" (change)="fatMethod.set(r.method)" />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold">{{ r.label }}</span>
                  @if (r.missing) {
                    <span class="block text-xs text-muted">{{ r.missing }}</span>
                  }
                </span>
                <span class="text-lg font-extrabold" [class.text-soft]="r.bodyFatPct === null">{{ r.bodyFatPct !== null ? r.bodyFatPct + ' %' : '—' }}</span>
              </label>
            }
          </div>
          @if (composition(); as c) {
            <div class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-xl bg-canvas px-2 py-3">
                <p class="text-[11px] font-bold text-muted uppercase">Grasa</p>
                <p class="text-lg font-extrabold">{{ c.pct }} %</p>
              </div>
              <div class="rounded-xl bg-canvas px-2 py-3">
                <p class="text-[11px] font-bold text-muted uppercase">Masa grasa</p>
                <p class="text-lg font-extrabold">{{ c.fatKg ?? '—' }}<span class="text-xs"> kg</span></p>
              </div>
              <div class="rounded-xl bg-canvas px-2 py-3">
                <p class="text-[11px] font-bold text-muted uppercase">Masa magra</p>
                <p class="text-lg font-extrabold">{{ c.leanKg ?? '—' }}<span class="text-xs"> kg</span></p>
              </div>
            </div>
            <p class="mt-2 text-sm font-bold" [class]="c.alert ? 'text-coral-700' : 'text-brand-700'">Clasificación: {{ c.category }}</p>
          }
        </section>

        <section class="card">
          <h2 class="text-lg font-extrabold">Calorías</h2>
          @if (energyRows().length) {
            <table class="table-base mt-2">
              <thead>
                <tr>
                  <th>Ecuación</th>
                  <th class="text-right">GER</th>
                  <th class="text-right">GET</th>
                </tr>
              </thead>
              <tbody>
                @for (e of energyRows(); track e.value) {
                  <tr class="cursor-pointer" [class.bg-brand-50]="equation() === e.value" (click)="e.ok && equation.set(e.value)">
                    <td class="text-sm" [class.font-bold]="equation() === e.value">{{ e.label }}</td>
                    <td class="text-right text-sm">{{ e.resting ?? '—' }}</td>
                    <td class="text-right text-sm font-bold">{{ e.total ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="mt-1 text-xs text-muted">GER: gasto en reposo · GET: gasto total con actividad (kcal/día).</p>
          } @else {
            <p class="mt-2 text-sm text-muted">Escribe edad, peso y talla.</p>
          }

          @if (target(); as t) {
            <div class="mt-4 rounded-xl bg-brand-50 p-4">
              <p class="text-xs font-bold text-muted uppercase">Objetivo ({{ adjustment() > 0 ? '+' : '' }}{{ adjustment() }} %)</p>
              <p class="text-3xl font-extrabold text-brand-700">{{ t.kcal }} <span class="text-base">kcal/día</span></p>
              <div class="mt-3 grid grid-cols-3 gap-2">
                @for (m of macroRows(); track m.key) {
                  <div>
                    <label class="text-[11px] font-bold text-muted uppercase" [for]="'macro-' + m.key">{{ m.label }}</label>
                    <div class="flex items-center gap-1">
                      <input [id]="'macro-' + m.key" class="input px-2 py-1.5 text-center" type="number" [ngModel]="m.pct" (ngModelChange)="setMacro(m.key, $event)" />
                      <span class="text-xs text-muted">%</span>
                    </div>
                    <p class="mt-1 text-sm font-bold">{{ m.grams }} g</p>
                  </div>
                }
              </div>
              @if (macroSum() !== 100) {
                <p class="mt-2 text-xs font-bold text-coral-700">Los porcentajes suman {{ macroSum() }} %; deben sumar 100 %.</p>
              }
            </div>
          }
        </section>

        @if (extras().length) {
          <section class="card">
            <h2 class="mb-2 text-lg font-extrabold">Otros indicadores</h2>
            @for (x of extras(); track x.label) {
              <div class="flex justify-between gap-3 border-t border-line py-2 text-sm first:border-0">
                <span class="text-muted">{{ x.label }}</span>
                <span class="text-right font-semibold" [class.text-coral-700]="x.alert">{{ x.value }}</span>
              </div>
            }
          </section>
        }

        @if (patient()) {
          <section class="card">
            <app-error [message]="saveError()" />
            <button class="btn-primary w-full" [disabled]="saving() || !v().weight" (click)="saveConsultation()">
              <app-icon name="clipboard" size="sm" /> {{ saving() ? 'Guardando…' : 'Guardar como consulta de hoy' }}
            </button>
            <p class="mt-2 text-xs text-muted">Guarda medidas, pliegues y el % de grasa elegido en el expediente.</p>
          </section>
        }
      </aside>
    </div>
  `,
})
export class Calculator {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly name = fullName;
  protected readonly sexes: { value: Sex; label: string }[] = [
    { value: 'FEMALE', label: 'Femenino' },
    { value: 'MALE', label: 'Masculino' },
  ];
  protected readonly circumferences = CIRCUMFERENCES;
  protected readonly skinfoldFields = SKINFOLDS;
  protected readonly activityFactors = ACTIVITY_FACTORS;
  protected readonly equationOptions = EQUATIONS.filter((e) => e.value !== 'KCAL_PER_KG');

  protected readonly sex = signal<Sex>('FEMALE');
  protected readonly v = signal<Record<NumField, number | null>>({
    age: null,
    weight: null,
    usual: null,
    height: null,
    waist: null,
    hip: null,
    arm: null,
  });
  protected readonly folds = signal<Skinfolds>({});
  protected readonly activity = signal(1.375);
  protected readonly basis = signal<WeightBasis>('AUTO');
  protected readonly weightBases = WEIGHT_BASES;

  // Regla automática: IMC < 30 → peso ideal; IMC ≥ 30 → peso ajustado.
  protected readonly usedWeight = computed(() => {
    const v = this.v();
    return v.weight ? energyWeight(v.weight, v.height, this.basis()) : null;
  });
  protected readonly adjustment = signal(0);
  protected readonly equation = signal<Equation>('MIFFLIN_ST_JEOR');
  protected readonly fatMethod = signal<BodyFatMethod | null>(null);
  protected readonly macros = signal({ choPct: 50, proPct: 20, fatPct: 30 });

  protected readonly search = signal('');
  protected readonly results = signal<PatientListItem[]>([]);
  protected readonly patient = signal<Patient | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected set(key: NumField, value: unknown) {
    const n = Number(value);
    this.v.update((v) => ({ ...v, [key]: value === '' || value === null || Number.isNaN(n) ? null : n }));
  }

  protected setFold(key: keyof Skinfolds, value: unknown) {
    const n = Number(value);
    this.folds.update((f) => ({ ...f, [key]: value === '' || value === null || Number.isNaN(n) ? null : n }));
  }

  protected setMacro(key: 'choPct' | 'proPct' | 'fatPct', value: unknown) {
    this.macros.update((m) => ({ ...m, [key]: Math.max(0, Math.min(100, Math.round(Number(value) || 0))) }));
  }

  private readonly bodyInput = computed(() => {
    const v = this.v();
    return {
      sex: this.sex(),
      ageYears: v.age ?? 30,
      weightKg: v.weight,
      heightCm: v.height,
      waistCm: v.waist,
      hipCm: v.hip,
      skinfolds: this.folds(),
    };
  });

  private readonly indicators = computed(() => {
    const i = this.bodyInput();
    return anthropometry({
      sex: i.sex,
      ageYears: i.ageYears,
      weightKg: i.weightKg,
      heightCm: i.heightCm,
      waistCm: i.waistCm,
      hipCm: i.hipCm,
      usualWeightKg: this.v().usual,
    });
  });

  protected readonly bmi = computed(() => {
    const b = this.indicators().find((i) => i.key === 'bmi');
    if (!b) return null;
    // Posición en la escala de 16 a 40 para la barra.
    return { ...b, bar: Math.max(2, Math.min(100, ((b.value - 16) / 24) * 100)) };
  });

  protected readonly weightRefs = computed(() =>
    this.indicators()
      .filter((i) => ['idealWeight', 'idealWeightHamwi', 'healthyRange', 'adjustedWeight'].includes(i.key))
      .map((i) => ({ label: i.label, value: `${i.value} ${i.unit}`.trim(), formula: i.formula })),
  );

  protected readonly fatResults = computed(() => CALCULATOR_FAT_METHODS.map((m) => bodyFat(m.value, this.bodyInput())));

  // El método elegido o, si no hay, el primero que tenga datos completos.
  private readonly chosenFat = computed(() => {
    const results = this.fatResults().filter((r) => r.bodyFatPct !== null);
    return results.find((r) => r.method === this.fatMethod()) ?? results[0] ?? null;
  });

  protected readonly composition = computed(() => {
    const r = this.chosenFat();
    if (!r || r.bodyFatPct === null) return null;
    const w = this.v().weight;
    const cat = bodyFatCategory(this.sex(), r.bodyFatPct);
    return {
      pct: r.bodyFatPct,
      fatKg: w ? round((w * r.bodyFatPct) / 100) : null,
      leanKg: w ? round(w - (w * r.bodyFatPct) / 100) : null,
      category: cat.label,
      alert: cat.alert,
    };
  });

  protected readonly energyRows = computed(() => {
    const v = this.v();
    if (!v.weight || !v.age) return [];
    return this.equationOptions.map((e) => {
      try {
        const r = energy({
          equation: e.value,
          sex: this.sex(),
          ageYears: v.age!,
          weightKg: this.usedWeight()!.weightKg,
          heightCm: v.height,
          bodyFatPct: this.chosenFat()?.bodyFatPct ?? null,
          activityFactor: this.activity(),
        });
        return { value: e.value, label: e.label, resting: r.restingKcal, total: r.totalKcal, ok: true };
      } catch (err) {
        if (!(err instanceof EnergyInputError)) throw err;
        return { value: e.value, label: e.label, resting: null, total: null, ok: false };
      }
    });
  });

  protected readonly target = computed(() => {
    const row = this.energyRows().find((r) => r.value === this.equation() && r.ok);
    if (!row?.total) return null;
    return { kcal: Math.round(row.total * (1 + this.adjustment() / 100)) };
  });

  protected readonly macroSum = computed(() => {
    const m = this.macros();
    return m.choPct + m.proPct + m.fatPct;
  });

  protected readonly macroRows = computed(() => {
    const t = this.target();
    const m = this.macros();
    const g = macroGrams(t?.kcal ?? 0, m.choPct, m.proPct, m.fatPct);
    return [
      { key: 'choPct' as const, label: 'Carbos', pct: m.choPct, grams: g.choG },
      { key: 'proPct' as const, label: 'Proteína', pct: m.proPct, grams: g.proG },
      { key: 'fatPct' as const, label: 'Grasa', pct: m.fatPct, grams: g.fatG },
    ];
  });

  protected readonly extras = computed(() => {
    const v = this.v();
    const sex = this.sex();
    const rows: { label: string; value: string; alert?: boolean }[] = this.indicators()
      .filter((i) => ['waist', 'whr', 'whtr', 'idealWeightPct', 'usualWeightPct', 'weightLossPct'].includes(i.key))
      .map((i) => ({ label: i.label, value: `${i.value}${i.unit ? ' ' + i.unit : ''} · ${i.status ?? ''}`, alert: i.alert }));
    const triceps = this.folds().triceps;
    if (v.arm && triceps) {
      const a = armIndices(sex, v.arm, triceps);
      rows.push({ label: 'Circunferencia muscular del brazo', value: `${a.muscleCircumferenceCm} cm` });
      rows.push({ label: 'Área muscular del brazo (corregida)', value: `${a.muscleAreaCm2} cm²` });
      rows.push({ label: 'Área grasa del brazo', value: `${a.fatAreaCm2} cm²` });
    }
    const w = v.weight;
    if (w && this.target()) rows.push({ label: 'Proteína por kg de peso', value: `${round(this.macroRows()[1].grams / w)} g/kg` });
    return rows;
  });

  // ─── Paciente ───

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    if (value.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.searchTimer = setTimeout(async () => {
      try {
        this.results.set((await this.api.get<PatientListItem[]>(`/patients?search=${encodeURIComponent(value.trim())}`)).slice(0, 8));
      } catch {
        this.results.set([]);
      }
    }, 250);
  }

  protected async selectPatient(item: PatientListItem) {
    this.results.set([]);
    this.search.set('');
    const [patient, consultations] = await Promise.all([
      this.api.get<Patient>(`/patients/${item.id}`),
      this.api.get<Consultation[]>(`/patients/${item.id}/consultations`),
    ]);
    this.patient.set(patient);
    this.sex.set(patient.sex);
    const last = consultations[0];
    const height = consultations.find((c) => c.heightCm)?.heightCm ?? null;
    this.v.set({
      age: ageFrom(patient.birthDate),
      weight: last?.weightKg ?? null,
      usual: consultations.find((c) => c.usualWeightKg)?.usualWeightKg ?? null,
      height,
      waist: last?.waistCm ?? null,
      hip: last?.hipCm ?? null,
      arm: last?.armCm ?? null,
    });
    const extra = (last as (Consultation & { extraMeasures?: { skinfolds?: Skinfolds } }) | undefined)?.extraMeasures;
    this.folds.set(extra?.skinfolds ?? {});
  }

  protected clearPatient() {
    this.patient.set(null);
  }

  protected async saveConsultation() {
    const p = this.patient();
    if (!p) return;
    const v = this.v();
    const fat = this.chosenFat();
    const skinfolds = Object.fromEntries(Object.entries(this.folds()).filter(([, n]) => typeof n === 'number' && n > 0));
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const created = await this.api.post<{ id: string }>(`/patients/${p.id}/consultations`, {
        date: todayIso(),
        weightKg: v.weight ?? undefined,
        usualWeightKg: v.usual ?? undefined,
        heightCm: v.height ?? undefined,
        waistCm: v.waist ?? undefined,
        hipCm: v.hip ?? undefined,
        armCm: v.arm ?? undefined,
        bodyFatPct: fat?.bodyFatPct ?? undefined,
        extraMeasures: {
          ...(Object.keys(skinfolds).length ? { skinfolds } : {}),
          ...(fat ? { bodyFatMethod: fat.method } : {}),
        },
      });
      await this.router.navigate(['/consultas', created.id]);
    } catch (err) {
      this.saveError.set(errorMessage(err, 'No se pudo guardar la consulta.'));
    } finally {
      this.saving.set(false);
    }
  }
}
