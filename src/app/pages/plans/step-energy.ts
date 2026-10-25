import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ACTIVITY_FACTORS,
  energy,
  EnergyInputError,
  energyWeight,
  EQUATIONS,
  ExerciseEntry,
  EXERCISES,
  exerciseKcalPerDay,
  PHYSIOLOGICAL_EXTRAS,
  STRESS_FACTORS,
  WEIGHT_BASES,
  WeightBasis,
} from '../../core/calc';
import { CalorieMethod, Equation, Sex } from '../../core/types';
import { Icon } from '../../shared/icon';
import { PlanStore } from './plan-store';

type Goal = 'LOSE' | 'MAINTAIN' | 'GAIN';

const GOALS: { value: Goal; label: string; hint: string; pct: number }[] = [
  { value: 'LOSE', label: 'Pérdida de peso', hint: 'Déficit calórico', pct: -15 },
  { value: 'MAINTAIN', label: 'Mantenimiento', hint: 'Sin ajuste', pct: 0 },
  { value: 'GAIN', label: 'Ganancia de peso', hint: 'Superávit calórico', pct: 10 },
];

const OCCUPATIONS = ['Sedentaria (oficina, estudio)', 'Ligera (de pie, caminar poco)', 'Moderada (trabajo físico)', 'Pesada (carga, construcción)'];

// Paso 1: peso para el cálculo, ecuación, actividad física, condición clínica y objetivo.
@Component({
  selector: 'app-step-energy',
  imports: [FormsModule, Icon],
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
      <!-- Datos y peso para el cálculo -->
      <h3 class="mb-3 font-extrabold">Datos del paciente</h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="label" for="weight">Peso actual (kg)</label>
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
      </div>

      <div class="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <div class="flex flex-wrap items-end gap-4">
          <div class="min-w-56 flex-1">
            <label class="label" for="basis">Peso para calcular las calorías</label>
            <select id="basis" class="input" [ngModel]="basis()" (ngModelChange)="basis.set($event)" [disabled]="store.readonly()">
              @for (b of weightBases; track b.value) {
                <option [value]="b.value">{{ b.label }}</option>
              }
            </select>
          </div>
          @if (usedWeight(); as w) {
            <div class="text-right">
              <p class="text-xs font-bold text-muted uppercase">Peso usado</p>
              <p class="text-2xl font-extrabold text-brand-700">{{ w.weightKg }} kg</p>
            </div>
          }
        </div>
        @if (usedWeight(); as w) {
          <p class="mt-2 text-sm text-brand-700">{{ w.explanation }}.</p>
        }
        <p class="mt-1 text-xs text-muted">Regla automática: IMC menor a 30 → peso ideal; IMC de 30 o más → peso ajustado. El ejercicio se calcula con el peso actual.</p>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="equation">Ecuación</label>
          <select id="equation" class="input" [ngModel]="equation()" (ngModelChange)="equation.set($event)" [disabled]="store.readonly()">
            @for (e of equations; track e.value) {
              <option [value]="e.value">{{ e.label }} — {{ e.needs }}</option>
            }
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
        }
      </div>

      <!-- Actividad física -->
      @if (equation() !== 'KCAL_PER_KG') {
        <h3 class="mt-6 mb-3 font-extrabold">Actividad física</h3>
        <div class="grid gap-4 sm:grid-cols-3">
          <div>
            <label class="label" for="activity">{{ exercises().length ? 'Actividad diaria sin el ejercicio' : 'Nivel de actividad' }}</label>
            <select id="activity" class="input" [ngModel]="activity()" (ngModelChange)="activity.set(+$event)" [disabled]="store.readonly()">
              @for (a of activityFactors; track a.value) {
                <option [ngValue]="a.value">{{ a.label }} (× {{ a.value }})</option>
              }
              @if (!isKnownFactor()) {
                <option [ngValue]="activity()">Personalizado (× {{ activity() }})</option>
              }
            </select>
          </div>
          <div>
            <label class="label" for="occupation">Actividad laboral</label>
            <select id="occupation" class="input" [ngModel]="occupation()" (ngModelChange)="occupation.set($event)" [disabled]="store.readonly()">
              <option value="">Sin indicar</option>
              @for (o of occupations; track o) {
                <option [value]="o">{{ o }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label" for="sedentary">Tiempo sentado al día (h)</label>
            <input id="sedentary" class="input" type="number" min="0" max="24" step="0.5" [ngModel]="sedentaryHours()" (ngModelChange)="sedentaryHours.set($event)" [disabled]="store.readonly()" />
          </div>
        </div>

        <div class="mt-4 rounded-2xl border border-line">
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <p class="font-bold">Ejercicio</p>
            @if (!store.readonly()) {
              <button type="button" class="btn-ghost btn-sm" (click)="addExercise()"><app-icon name="plus" size="sm" /> Agregar ejercicio</button>
            }
          </div>
          @for (e of exercises(); track $index; let i = $index) {
            <div class="grid grid-cols-2 items-end gap-3 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_90px_110px_auto]">
              <div class="col-span-2 sm:col-span-1">
                <label class="label" [for]="'ex-type-' + i">Tipo</label>
                <select class="input" [id]="'ex-type-' + i" [ngModel]="e.type" (ngModelChange)="setExerciseType(i, $event)" [disabled]="store.readonly()">
                  @for (x of exerciseTypes; track x.value) {
                    <option [value]="x.value">{{ x.label }} ({{ x.met }} MET)</option>
                  }
                </select>
              </div>
              <div>
                <label class="label" [for]="'ex-days-' + i">Días/sem</label>
                <input class="input" [id]="'ex-days-' + i" type="number" min="1" max="7" [ngModel]="e.daysPerWeek" (ngModelChange)="patchExercise(i, 'daysPerWeek', $event)" [disabled]="store.readonly()" />
              </div>
              <div>
                <label class="label" [for]="'ex-min-' + i">Minutos</label>
                <input class="input" [id]="'ex-min-' + i" type="number" min="5" max="600" step="5" [ngModel]="e.minutes" (ngModelChange)="patchExercise(i, 'minutes', $event)" [disabled]="store.readonly()" />
              </div>
              @if (!store.readonly()) {
                <button type="button" class="btn-ghost btn-sm text-danger-500" (click)="removeExercise(i)" aria-label="Quitar ejercicio"><app-icon name="trash" size="sm" /></button>
              }
            </div>
          } @empty {
            <p class="px-4 py-3 text-sm text-muted">Sin ejercicio registrado. Si hace ejercicio, agrégalo aquí y elige su actividad diaria sin contarlo.</p>
          }
          @if (exercises().length) {
            <p class="border-t border-line bg-canvas px-4 py-2 text-xs text-muted">
              Gasto del ejercicio: <strong class="text-ink">{{ exerciseKcal() }} kcal/día</strong> en promedio. Se suma aparte del factor de actividad para no contarlo dos veces.
            </p>
          }
        </div>
      }

      <!-- Condición clínica y objetivo -->
      <h3 class="mt-6 mb-3 font-extrabold">Condición clínica</h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="stress">Condición o estrés metabólico</label>
          <select id="stress" class="input" [ngModel]="stress()" (ngModelChange)="stress.set(+$event)" [disabled]="store.readonly()">
            @for (f of stressFactors; track f.value) {
              <option [ngValue]="f.value">{{ f.label }}{{ f.value !== 1 ? ' (× ' + f.value + ')' : '' }}</option>
            }
          </select>
        </div>
        @if (sex() === 'FEMALE') {
          <div>
            <label class="label" for="stage">Embarazo o lactancia</label>
            <select id="stage" class="input" [ngModel]="stage()" (ngModelChange)="stage.set($event)" [disabled]="store.readonly()">
              @for (p of physiological; track p.value) {
                <option [value]="p.value">{{ p.label }}{{ p.kcal ? ' (+' + p.kcal + ' kcal)' : '' }}</option>
              }
            </select>
          </div>
        }
      </div>

      <h3 class="mt-6 mb-3 font-extrabold">Objetivo</h3>
      <div class="grid gap-3 sm:grid-cols-3">
        @for (g of goals; track g.value) {
          <button
            type="button"
            class="cursor-pointer rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed"
            [class]="goal() === g.value ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-line-strong'"
            [disabled]="store.readonly()"
            (click)="chooseGoal(g.value)"
          >
            <p class="font-bold" [class.text-brand-700]="goal() === g.value">{{ g.label }}</p>
            <p class="text-xs text-muted">{{ g.hint }}</p>
          </button>
        }
      </div>
      @if (goal() !== 'MAINTAIN') {
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted">{{ goal() === 'LOSE' ? 'Déficit' : 'Superávit' }}:</span>
          @for (p of goal() === 'LOSE' ? [-10, -15, -20, -25] : [5, 10, 15, 20]; track p) {
            <button type="button" class="chip cursor-pointer" [class]="adjustment() === p ? 'bg-brand-600 text-white' : 'bg-mist text-muted'" [disabled]="store.readonly()" (click)="adjustment.set(p)">
              {{ p > 0 ? '+' : '' }}{{ p }} %
            </button>
          }
          <input class="input w-24 py-1.5" type="number" min="-50" max="50" [ngModel]="adjustment()" (ngModelChange)="adjustment.set(+$event || 0)" [disabled]="store.readonly()" aria-label="Ajuste en porcentaje" />
          <span class="text-sm text-muted">%</span>
        </div>
      }

      <!-- Resultado -->
      <div class="mt-6 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl bg-mist p-4">
          <p class="text-xs font-bold text-muted uppercase">Metabolismo basal (GER)</p>
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
      @if (preview().result) {
        <p class="mt-2 text-xs text-muted">{{ breakdown() }}</p>
      }
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
  protected readonly stressFactors = STRESS_FACTORS;
  protected readonly physiological = PHYSIOLOGICAL_EXTRAS;
  protected readonly exerciseTypes = EXERCISES;
  protected readonly weightBases = WEIGHT_BASES;
  protected readonly goals = GOALS;
  protected readonly occupations = OCCUPATIONS;

  protected readonly method = signal<CalorieMethod>('AUTOMATIC');
  protected readonly equation = signal<Equation>('MIFFLIN_ST_JEOR');
  protected readonly weight = signal<number | null>(null);
  protected readonly height = signal<number | null>(null);
  protected readonly age = signal<number | null>(null);
  protected readonly sex = signal<Sex>('FEMALE');
  protected readonly bodyFat = signal<number | null>(null);
  protected readonly kcalPerKg = signal<number | null>(25);
  protected readonly basis = signal<WeightBasis>('AUTO');
  protected readonly activity = signal(1.375);
  protected readonly occupation = signal('');
  protected readonly sedentaryHours = signal<number | null>(null);
  protected readonly exercises = signal<ExerciseEntry[]>([]);
  protected readonly stress = signal(1);
  protected readonly stage = signal<string>('NONE');
  protected readonly adjustment = signal(0);
  protected readonly manualKcal = signal<number | null>(null);

  protected readonly goal = computed<Goal>(() => (this.adjustment() < 0 ? 'LOSE' : this.adjustment() > 0 ? 'GAIN' : 'MAINTAIN'));
  protected readonly isKnownFactor = computed(() => ACTIVITY_FACTORS.some((a) => a.value === this.activity()));

  protected readonly usedWeight = computed(() => {
    const w = Number(this.weight());
    return w ? energyWeight(w, Number(this.height()) || null, this.basis()) : null;
  });

  // El ejercicio se calcula con el peso actual (los MET se miden sobre el peso real).
  protected readonly exerciseKcal = computed(() => {
    const w = Number(this.weight());
    return w ? exerciseKcalPerDay(w, this.exercises()) : 0;
  });

  private readonly physiologicalKcal = computed(() =>
    this.sex() === 'FEMALE' ? (PHYSIOLOGICAL_EXTRAS.find((p) => p.value === this.stage())?.kcal ?? 0) : 0,
  );

  // Cálculo en vivo con la misma fórmula del backend.
  protected readonly preview = computed(() => {
    const used = this.usedWeight();
    if (!used) return { result: null, error: 'Indica el peso para calcular.' };
    try {
      return {
        result: energy({
          equation: this.equation(),
          sex: this.sex(),
          ageYears: Number(this.age()) || 0,
          weightKg: used.weightKg,
          heightCm: Number(this.height()) || null,
          bodyFatPct: Number(this.bodyFat()) || null,
          kcalPerKg: Number(this.kcalPerKg()) || null,
          activityFactor: this.activity(),
          stressFactor: this.stress(),
          exerciseKcal: this.equation() === 'KCAL_PER_KG' ? 0 : this.exerciseKcal(),
          physiologicalKcal: this.physiologicalKcal(),
          adjustmentPct: this.adjustment() || null,
        }),
        error: null,
      };
    } catch (err) {
      return { result: null, error: err instanceof EnergyInputError ? err.message : 'Revisa los datos.' };
    }
  });

  protected readonly breakdown = computed(() => {
    const r = this.preview().result;
    if (!r) return '';
    const parts = [`GER ${r.restingKcal}`];
    if (this.equation() !== 'KCAL_PER_KG') parts.push(`× actividad ${this.activity()}`);
    if (this.stress() !== 1) parts.push(`× condición ${this.stress()}`);
    if (this.exerciseKcal() && this.equation() !== 'KCAL_PER_KG') parts.push(`+ ejercicio ${this.exerciseKcal()}`);
    if (this.physiologicalKcal()) parts.push(`+ ${this.physiologicalKcal()} (etapa fisiológica)`);
    parts.push(`= GET ${r.totalKcal}`);
    if (this.adjustment()) parts.push(`· ${this.adjustment() > 0 ? '+' : ''}${this.adjustment()} % → ${r.targetKcal} kcal`);
    return parts.join(' ');
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
      this.basis.set(p.weightBasis ?? 'AUTO');
      if (p.kcalPerKg) this.kcalPerKg.set(p.kcalPerKg);
      if (p.activityFactor) this.activity.set(p.activityFactor);
      if (p.stressFactor) this.stress.set(p.stressFactor);
      this.stage.set(p.physiologicalStage ?? 'NONE');
      this.occupation.set(p.activityDetail?.occupation ?? '');
      this.sedentaryHours.set(p.activityDetail?.sedentaryHours ?? null);
      this.exercises.set(p.activityDetail?.exercises ?? []);
      this.adjustment.set(p.adjustmentPct ?? 0);
      this.manualKcal.set(p.targetKcal);
    });
  }

  protected chooseGoal(goal: Goal) {
    this.adjustment.set(GOALS.find((g) => g.value === goal)!.pct);
  }

  protected addExercise() {
    const walk = EXERCISES[0];
    this.exercises.update((list) => [...list, { type: walk.value, met: walk.met, daysPerWeek: 3, minutes: 45 }]);
  }

  protected setExerciseType(i: number, type: string) {
    const met = EXERCISES.find((x) => x.value === type)?.met ?? 5;
    this.exercises.update((list) => list.map((e, j) => (j === i ? { ...e, type, met } : e)));
  }

  protected patchExercise(i: number, field: 'daysPerWeek' | 'minutes', value: unknown) {
    const n = Math.max(1, Math.round(Number(value) || 1));
    this.exercises.update((list) => list.map((e, j) => (j === i ? { ...e, [field]: n } : e)));
  }

  protected removeExercise(i: number) {
    this.exercises.update((list) => list.filter((_, j) => j !== i));
  }

  async save() {
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
            weightBasis: this.basis(),
            activityFactor: this.activity(),
            stressFactor: this.stress(),
            physiologicalStage: this.sex() === 'FEMALE' ? this.stage() : 'NONE',
            activityDetail: {
              occupation: this.occupation() || undefined,
              sedentaryHours: this.sedentaryHours() !== null && this.sedentaryHours() !== undefined ? Number(this.sedentaryHours()) : undefined,
              exercises: this.equation() === 'KCAL_PER_KG' ? [] : this.exercises(),
            },
            adjustmentPct: Math.round(this.adjustment()) || null,
            adjustmentKcal: null,
          };
    if (await this.store.run('put', '/energy', body)) this.next.emit();
  }
}
