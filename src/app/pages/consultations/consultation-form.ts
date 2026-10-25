import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { ageFrom, anthropometry, BODY_FAT_METHODS, BodyFatMethod, bodyFat, Skinfolds, SKINFOLDS } from '../../core/calc';

import { appointmentTypeLabels, formatDate, formatDateTime, fullName, planStatusLabels, todayIso } from '../../core/format';
import { Consultation, ConsultationDetail, ConsultationType, Indicator, Patient, Sex } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, ErrorBanner, PageHeader, SkeletonCards } from '../../shared/ui';

// Medidas adicionales guardadas en la consulta (columna JSON extra_measures).
// skinfolds guarda el promedio de cada pliegue; skinfoldReadings, las tomas individuales.
interface ExtraMeasures {
  skinfolds?: Skinfolds;
  skinfoldReadings?: Partial<Record<keyof Skinfolds, number[]>>;
  wristCm?: number;
  bodyFatMethod?: BodyFatMethod;
}

const READINGS = 3;

type NumKey =
  | 'weightKg'
  | 'usualWeightKg'
  | 'heightCm'
  | 'waistCm'
  | 'hipCm'
  | 'armCm'
  | 'calfCm'
  | 'neckCm'
  | 'bodyFatPct'
  | 'muscleMassKg'
  | 'visceralFat'
  | 'systolicBp'
  | 'diastolicBp'
  | 'adherencePct';

type TextKey = 'reason' | 'clinicalFindings' | 'diagnosis' | 'symptoms' | 'treatmentChanges' | 'nextSteps' | 'notes';

const NUM_KEYS: NumKey[] = [
  'weightKg', 'usualWeightKg', 'heightCm', 'waistCm', 'hipCm', 'armCm', 'calfCm', 'neckCm',
  'bodyFatPct', 'muscleMassKg', 'visceralFat', 'systolicBp', 'diastolicBp', 'adherencePct',
];
const TEXT_KEYS: TextKey[] = ['reason', 'clinicalFindings', 'diagnosis', 'symptoms', 'treatmentChanges', 'nextSteps', 'notes'];
const INT_KEYS: NumKey[] = ['systolicBp', 'diastolicBp', 'adherencePct'];

// Medidas antropométricas con sus límites (los mismos que valida el backend).
const MEASURES: { key: NumKey; label: string; unit: string; min: number; max: number; step: string }[] = [
  { key: 'weightKg', label: 'Peso actual', unit: 'kg', min: 1, max: 400, step: '0.1' },
  { key: 'usualWeightKg', label: 'Peso habitual', unit: 'kg', min: 1, max: 400, step: '0.1' },
  { key: 'heightCm', label: 'Talla', unit: 'cm', min: 30, max: 250, step: '0.1' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm', min: 20, max: 250, step: '0.1' },
  { key: 'hipCm', label: 'Cadera', unit: 'cm', min: 20, max: 250, step: '0.1' },
  { key: 'armCm', label: 'Brazo', unit: 'cm', min: 5, max: 80, step: '0.1' },
  { key: 'calfCm', label: 'Pantorrilla', unit: 'cm', min: 5, max: 80, step: '0.1' },
  { key: 'neckCm', label: 'Cuello', unit: 'cm', min: 5, max: 80, step: '0.1' },
  { key: 'bodyFatPct', label: 'Grasa corporal', unit: '%', min: 1, max: 75, step: '0.1' },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg', min: 1, max: 150, step: '0.1' },
  { key: 'visceralFat', label: 'Grasa visceral', unit: 'nivel', min: 1, max: 60, step: '0.5' },
];

const LIMITS: Partial<Record<NumKey, [number, number, string]>> = {
  systolicBp: [50, 260, 'Presión sistólica'],
  diastolicBp: [30, 160, 'Presión diastólica'],
  adherencePct: [0, 100, 'Adherencia'],
};

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  birthDate?: string;
}

@Component({
  selector: 'app-consultation-form',
  imports: [FormsModule, RouterLink, Icon, Badge, ErrorBanner, PageHeader, SkeletonCards],
  template: `
    @if (loading()) {
      <div class="skeleton mb-6 h-8 w-1/3"></div>
      <app-skeleton-cards [count]="3" />
    } @else if (!patient()) {
      <app-error [message]="error() ?? 'No encontramos la consulta.'" />
    } @else {
      <a [routerLink]="['/pacientes', patient()!.id]" [queryParams]="{ tab: 'consultas' }" class="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <app-icon name="chevronLeft" /> {{ name(patient()) }}
      </a>
      <app-page-header [title]="isNew() ? 'Nueva consulta' : 'Consulta del ' + date(form.date)" [subtitle]="name(patient()) + ' · ' + age() + ' años'">
        @if (!isNew()) {
          <button class="btn-outline" (click)="evaluationPdf()"><app-icon name="document" /> Evaluación PDF</button>
          <button class="btn-secondary" (click)="createPlan()" [disabled]="busy()"><app-icon name="clipboard" /> Crear plan con esta consulta</button>
        }
      </app-page-header>

      @if (justSaved()) {
        <div class="card mb-6 border-brand-200 bg-brand-50">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="flex items-center gap-2 font-bold text-brand-700"><app-icon name="check" /> Consulta guardada. ¿Qué quieres hacer ahora?</p>
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary btn-sm" (click)="createPlan()" [disabled]="busy()"><app-icon name="clipboard" /> Crear plan alimentario con esta consulta</button>
              <button class="btn-outline btn-sm" (click)="evaluationPdf()"><app-icon name="download" /> Descargar evaluación</button>
              <a class="btn-ghost btn-sm" [routerLink]="['/pacientes', patient()!.id]">Volver al expediente</a>
            </div>
          </div>
        </div>
      }

      <form class="grid gap-6 xl:grid-cols-3" (ngSubmit)="save()">
        <div class="space-y-6 xl:col-span-2">
          <!-- Datos de la consulta -->
          <section class="card space-y-4">
            <h2 class="text-lg font-extrabold">Datos de la consulta</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label" for="c-date">Fecha</label>
                <input id="c-date" class="input" type="date" name="date" [max]="today" [(ngModel)]="form.date" required />
              </div>
              <div>
                <span class="label">Tipo</span>
                <div class="flex rounded-xl bg-mist p-1 text-sm font-bold">
                  @for (t of typeOptions; track t.value) {
                    <button type="button" class="flex-1 cursor-pointer rounded-lg px-3 py-1.5" [class]="form.type === t.value ? 'bg-white text-ink shadow-soft' : 'text-muted'" (click)="form.type = t.value">
                      {{ t.label }}
                    </button>
                  }
                </div>
              </div>
            </div>
            @if (isNew() && appointments().length) {
              <div>
                <label class="label" for="c-appt">Cita (opcional)</label>
                <select id="c-appt" class="input" name="appointmentId" [(ngModel)]="form.appointmentId">
                  <option value="">Sin cita vinculada</option>
                  @for (a of appointments(); track a.id) {
                    <option [value]="a.id">{{ dateTime(a.startsAt) }} · {{ apptTypes[a.type] }}</option>
                  }
                </select>
                <p class="mt-1 text-xs text-muted">La cita quedará marcada como atendida.</p>
              </div>
            } @else if (detail()?.appointmentId) {
              <p class="text-sm text-muted"><app-icon name="calendar" /> Vinculada a una cita de la agenda.</p>
            }
            <div>
              <label class="label" for="c-reason">Motivo</label>
              <textarea id="c-reason" class="input" rows="2" name="reason" maxlength="1000" [(ngModel)]="form.texts.reason"></textarea>
            </div>
          </section>

          <!-- Antropometría -->
          <section class="card space-y-4">
            <div>
              <h2 class="text-lg font-extrabold">Antropometría y composición corporal</h2>
              @if (isNew() && heightFromLast()) {
                <p class="text-xs text-muted">Talla y peso habitual precargados de la última consulta.</p>
              }
            </div>
            @if (patient(); as p) {
              <div class="flex flex-wrap gap-2">
                <span class="chip bg-mist text-ink">Edad: {{ age() }} años</span>
                <span class="chip bg-mist text-ink">Sexo: {{ p.sex === 'FEMALE' ? 'Femenino' : 'Masculino' }}</span>
              </div>
            }
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              @for (m of measures; track m.key) {
                <div>
                  <label class="label" [for]="'c-' + m.key">{{ m.label }} <span class="normal-case">({{ m.unit }})</span></label>
                  <input
                    class="input"
                    type="number"
                    inputmode="decimal"
                    [id]="'c-' + m.key"
                    [name]="m.key"
                    [min]="m.min"
                    [max]="m.max"
                    [step]="m.step"
                    [(ngModel)]="form.nums[m.key]"
                  />
                </div>
              }
              <div class="col-span-2 sm:col-span-1 lg:col-span-2">
                <span class="label">Presión arterial <span class="normal-case">(mmHg)</span></span>
                <div class="flex items-center gap-2">
                  <input class="input" type="number" inputmode="numeric" name="systolicBp" min="50" max="260" step="1" placeholder="Sistólica" aria-label="Presión sistólica" [(ngModel)]="form.nums.systolicBp" />
                  <span class="text-muted">/</span>
                  <input class="input" type="number" inputmode="numeric" name="diastolicBp" min="30" max="160" step="1" placeholder="Diastólica" aria-label="Presión diastólica" [(ngModel)]="form.nums.diastolicBp" />
                </div>
              </div>
              <div>
                <label class="label" for="c-wrist">Muñeca <span class="normal-case">(cm)</span></label>
                <input class="input" id="c-wrist" name="wristCm" type="number" inputmode="decimal" min="8" max="30" step="0.1" [(ngModel)]="form.wristCm" />
              </div>
            </div>

            <!-- Pliegues y % de grasa calculado -->
            <div class="border-t border-line pt-4">
              <h3 class="font-extrabold">Pliegues cutáneos <span class="text-sm font-semibold text-muted">(mm)</span></h3>
              <p class="mb-3 text-xs text-muted">Llena los que midas con el plicómetro y elige el método para calcular el porcentaje de grasa.</p>
              <div class="overflow-x-auto rounded-xl border border-line">
                <table class="table-base">
                  <thead>
                    <tr>
                      <th>Pliegue</th>
                      @for (r of readingIndexes; track r) {
                        <th class="text-center">Toma {{ r + 1 }}</th>
                      }
                      <th class="text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (f of skinfoldFields; track f.key) {
                      <tr>
                        <td class="font-semibold">{{ f.label }}</td>
                        @for (r of readingIndexes; track r) {
                          <td class="px-1 py-1.5 text-center">
                            <input
                              class="input w-20 px-2 py-1.5 text-center"
                              type="number"
                              inputmode="decimal"
                              min="1"
                              max="80"
                              step="0.5"
                              [name]="'sf-' + f.key + '-' + r"
                              [attr.aria-label]="f.label + ', toma ' + (r + 1)"
                              [(ngModel)]="form.readings[f.key][r]"
                            />
                          </td>
                        }
                        <td class="text-right font-bold">{{ average(f.key) ?? '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="mt-4 space-y-2">
                @for (r of fatResults(); track r.method) {
                  <div class="flex items-center gap-3 rounded-xl border px-3 py-2" [class]="r.method === form.fatMethod ? 'border-brand-500 bg-brand-50' : 'border-line'">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold">{{ r.label }}</p>
                      @if (r.missing) {
                        <p class="text-xs text-muted">{{ r.missing }}</p>
                      }
                    </div>
                    <span class="w-16 text-right text-lg font-extrabold" [class.text-soft]="r.bodyFatPct === null">{{ r.bodyFatPct !== null ? r.bodyFatPct + ' %' : '—' }}</span>
                    <button type="button" class="btn-secondary btn-sm" [disabled]="r.bodyFatPct === null" (click)="useBodyFat(r.method, r.bodyFatPct)">
                      {{ r.method === form.fatMethod && form.nums.bodyFatPct === r.bodyFatPct ? 'En uso' : 'Usar' }}
                    </button>
                  </div>
                }
              </div>
            </div>
          </section>

          <!-- Evaluación clínica -->
          <section class="card space-y-4">
            <h2 class="text-lg font-extrabold">Evaluación clínica</h2>
            <div>
              <label class="label" for="c-findings">Hallazgos clínicos</label>
              <textarea id="c-findings" class="input" rows="3" name="clinicalFindings" maxlength="4000" [(ngModel)]="form.texts.clinicalFindings"></textarea>
            </div>
            <div>
              <label class="label" for="c-dx">Diagnóstico nutricional</label>
              <textarea id="c-dx" class="input" rows="3" name="diagnosis" maxlength="4000" [(ngModel)]="form.texts.diagnosis"></textarea>
            </div>
          </section>

          <!-- Seguimiento -->
          @if (form.type === 'FOLLOW_UP') {
            <section class="card space-y-4">
              <h2 class="text-lg font-extrabold">Seguimiento</h2>
              <div>
                <label class="label" for="c-symptoms">Síntomas</label>
                <textarea id="c-symptoms" class="input" rows="2" name="symptoms" maxlength="4000" [(ngModel)]="form.texts.symptoms"></textarea>
              </div>
              <div>
                <span class="label">Adherencia al plan</span>
                @if (form.nums.adherencePct === null || form.nums.adherencePct === undefined) {
                  <button type="button" class="btn-outline btn-sm" (click)="form.nums.adherencePct = 80">Registrar adherencia</button>
                } @else {
                  <div class="flex items-center gap-4">
                    <input
                      type="range"
                      class="flex-1 accent-brand-600"
                      name="adherencePct"
                      min="0"
                      max="100"
                      step="5"
                      aria-label="Adherencia al plan"
                      [(ngModel)]="form.nums.adherencePct"
                    />
                    <span class="w-14 text-right text-lg font-extrabold" [class]="adherenceTone()">{{ form.nums.adherencePct }} %</span>
                    <button type="button" class="btn-ghost btn-sm" (click)="form.nums.adherencePct = null" aria-label="Quitar adherencia"><app-icon name="x" /></button>
                  </div>
                }
              </div>
              <div>
                <label class="label" for="c-changes">Cambios de tratamiento</label>
                <textarea id="c-changes" class="input" rows="2" name="treatmentChanges" maxlength="4000" [(ngModel)]="form.texts.treatmentChanges"></textarea>
              </div>
            </section>
          }

          <section class="card space-y-4">
            <h2 class="text-lg font-extrabold">Plan de acción</h2>
            <div>
              <label class="label" for="c-next">Próximos pasos</label>
              <textarea id="c-next" class="input" rows="2" name="nextSteps" maxlength="4000" [(ngModel)]="form.texts.nextSteps"></textarea>
            </div>
            <div>
              <label class="label" for="c-notes">Notas</label>
              <textarea id="c-notes" class="input" rows="3" name="notes" maxlength="4000" [(ngModel)]="form.texts.notes"></textarea>
            </div>
          </section>
        </div>

        <!-- Columna lateral: indicadores en vivo, comparación y planes -->
        <aside class="space-y-6">
          <section class="card xl:sticky xl:top-4">
            <h2 class="mb-1 text-lg font-extrabold">Indicadores</h2>
            <p class="mb-3 text-xs text-muted">Se calculan mientras escribes.</p>
            @if (indicators().length) {
              <ul class="space-y-2">
                @for (i of indicators(); track i.key) {
                  <li class="rounded-xl px-3 py-2" [class]="i.alert ? 'bg-coral-100' : 'bg-canvas'">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="text-sm" [class]="i.alert ? 'text-coral-700' : 'text-muted'">{{ i.label }}</span>
                      <span class="font-extrabold whitespace-nowrap" [class]="i.alert ? 'text-coral-700' : 'text-ink'">{{ i.value }} {{ i.unit }}</span>
                    </div>
                    @if (i.formula) {
                      <p class="text-[11px] text-soft">{{ i.formula }}</p>
                    }
                    @if (i.status) {
                      <p class="flex items-center gap-1 text-xs font-bold" [class]="i.alert ? 'text-danger-500' : 'text-brand-700'">
                        @if (i.alert) {
                          <app-icon name="warning" />
                        }
                        {{ i.status }}
                      </p>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-muted">Escribe peso y talla para ver el IMC, peso ideal y rango saludable.</p>
            }

            <app-error [message]="error()" />
            <div class="mt-4 flex flex-col gap-2">
              <button type="submit" class="btn-primary w-full" [disabled]="saving()">
                {{ saving() ? 'Guardando…' : isNew() ? 'Guardar consulta' : 'Guardar cambios' }}
              </button>
              @if (savedOk()) {
                <p class="flex items-center justify-center gap-1 text-sm font-bold text-brand-700"><app-icon name="check" /> Cambios guardados</p>
              }
            </div>
          </section>

          @if (detail(); as d) {
            @if (d.previous) {
              <section class="card">
                <h2 class="mb-1 text-lg font-extrabold">Comparación</h2>
                <p class="mb-3 text-xs text-muted">Frente a la consulta del {{ date(d.previous.date) }}</p>
                <table class="table-base">
                  <thead>
                    <tr><th>Medida</th><th class="text-right">Antes</th><th class="text-right">Ahora</th><th class="text-right">Dif.</th></tr>
                  </thead>
                  <tbody>
                    @for (r of comparison(); track r.label) {
                      <tr>
                        <td>{{ r.label }}</td>
                        <td class="text-right">{{ r.before ?? '—' }}</td>
                        <td class="text-right">{{ r.now ?? '—' }}</td>
                        <td class="text-right font-bold" [class]="r.tone">{{ r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + r.diff }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
            <section class="card">
              <h2 class="mb-3 text-lg font-extrabold">Planes vinculados</h2>
              @if (d.mealPlans.length) {
                <ul class="divide-y divide-line">
                  @for (plan of d.mealPlans; track plan.id) {
                    <li>
                      <a class="flex items-center justify-between gap-2 py-2 hover:text-brand-700" [routerLink]="['/planes', plan.id]">
                        <span>
                          <span class="block font-bold">{{ plan.title }}</span>
                          <span class="text-xs text-muted">{{ plan.targetKcal }} kcal</span>
                        </span>
                        <app-badge [badge]="planStatus[plan.status]" />
                      </a>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-sm text-muted">Ningún plan usa esta consulta todavía.</p>
              }
              <button type="button" class="btn-secondary btn-sm mt-3 w-full" (click)="createPlan()" [disabled]="busy()">
                <app-icon name="plus" /> Crear plan alimentario
              </button>
            </section>
          }
        </aside>
      </form>
    }
  `,
})
export class ConsultationForm {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // Llegan de la ruta: patientId al crear, consultationId al editar.
  readonly patientId = input<string>();
  readonly consultationId = input<string>();

  protected readonly measures = MEASURES;
  protected readonly typeOptions: { value: ConsultationType; label: string }[] = [
    { value: 'INITIAL', label: 'Evaluación inicial' },
    { value: 'FOLLOW_UP', label: 'Seguimiento' },
  ];
  protected readonly apptTypes = appointmentTypeLabels;
  protected readonly planStatus = planStatusLabels;
  protected readonly today = todayIso();
  protected readonly date = (iso: string | null | undefined) => formatDate(iso);
  protected readonly dateTime = formatDateTime;
  protected readonly name = (p: PatientInfo | null) => fullName(p);

  protected readonly isNew = computed(() => !this.consultationId());
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly busy = signal(false);
  protected readonly savedOk = signal(false);
  protected readonly justSaved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly patient = signal<PatientInfo | null>(null);
  protected readonly detail = signal<ConsultationDetail | null>(null);
  protected readonly appointments = signal<Patient['appointments']>([]);
  protected readonly heightFromLast = signal(false);
  private readonly ageYears = signal<number | null>(null);
  private previousWeight: number | null = null;
  private initialWeight: number | null = null;

  protected form = this.emptyForm();
  protected readonly skinfoldFields = SKINFOLDS;

  constructor() {
    effect(() => {
      const pid = this.patientId();
      const cid = this.consultationId();
      untracked(() => void (cid ? this.loadExisting(cid) : pid ? this.loadNew(pid) : null));
    });
  }

  private emptyForm() {
    return {
      date: todayIso(),
      type: 'INITIAL' as ConsultationType,
      appointmentId: '',
      nums: Object.fromEntries(NUM_KEYS.map((k) => [k, null])) as Record<NumKey, number | null>,
      texts: Object.fromEntries(TEXT_KEYS.map((k) => [k, ''])) as Record<TextKey, string>,
      // Hasta tres tomas por pliegue; se usa el promedio de las que tengan valor.
      readings: Object.fromEntries(SKINFOLDS.map((f) => [f.key, Array(READINGS).fill(null)])) as Record<keyof Skinfolds, (number | null)[]>,
      wristCm: null as number | null,
      fatMethod: null as BodyFatMethod | null,
    };
  }

  // % de grasa con cada método según las medidas escritas.
  protected fatResults() {
    const p = this.patient();
    if (!p) return [];
    const n = this.form.nums;
    const folds = this.averages();
    return BODY_FAT_METHODS.map((m) =>
      bodyFat(m.value, {
        sex: p.sex,
        ageYears: this.age(),
        weightKg: this.num(n.weightKg),
        heightCm: this.num(n.heightCm),
        waistCm: this.num(n.waistCm),
        hipCm: this.num(n.hipCm),
        neckCm: this.num(n.neckCm),
        skinfolds: folds,
      }),
    );
  }

  protected readonly readingIndexes = Array.from({ length: READINGS }, (_, i) => i);

  protected average(key: keyof Skinfolds): number | null {
    const values = this.form.readings[key].map((v) => this.num(v)).filter((v): v is number => v !== null && v > 0);
    return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  }

  private averages(): Skinfolds {
    return Object.fromEntries(SKINFOLDS.map((f) => [f.key, this.average(f.key)])) as Skinfolds;
  }

  protected useBodyFat(method: BodyFatMethod, pct: number | null) {
    if (pct === null) return;
    this.form.nums.bodyFatPct = pct;
    this.form.fatMethod = method;
  }

  // Nueva consulta: datos del paciente y talla de la última consulta.
  private async loadNew(patientId: string) {
    this.loading.set(true);
    this.error.set(null);
    this.detail.set(null);
    this.form = this.emptyForm();
    try {
      const [patient, past] = await Promise.all([
        this.api.get<Patient>(`/patients/${patientId}`),
        this.api.get<Consultation[]>(`/patients/${patientId}/consultations`),
      ]);
      this.patient.set(patient);
      this.form.type = past.length ? 'FOLLOW_UP' : 'INITIAL';
      const lastHeight = past.find((c) => c.heightCm !== null)?.heightCm ?? null;
      this.form.nums.heightCm = lastHeight !== null ? Number(lastHeight) : null;
      const lastUsual = (past as (Consultation & { usualWeightKg?: number | null })[]).find((c) => c.usualWeightKg)?.usualWeightKg ?? null;
      this.form.nums.usualWeightKg = lastUsual !== null ? Number(lastUsual) : null;
      this.heightFromLast.set(lastHeight !== null);
      this.previousWeight = this.num(past.find((c) => c.weightKg !== null)?.weightKg);
      this.initialWeight = this.num([...past].reverse().find((c) => c.weightKg !== null)?.weightKg);
      this.appointments.set(patient.appointments.filter((a) => a.status === 'SCHEDULED'));
      // Si hay una cita hoy, se propone vincularla.
      const todayAppt = this.appointments().find((a) => a.startsAt.slice(0, 10) === this.today);
      if (todayAppt) this.form.appointmentId = todayAppt.id;
    } catch (err) {
      this.patient.set(null);
      this.error.set(errorMessage(err, 'No pudimos cargar al paciente.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadExisting(id: string) {
    this.loading.set(true);
    this.error.set(null);
    // Viene de crear la consulta: se muestran las acciones siguientes.
    this.justSaved.set(!!(history.state as { saved?: boolean } | null)?.saved);
    try {
      const d = await this.api.get<ConsultationDetail>(`/consultations/${id}`);
      this.applyDetail(d);
      const list = await this.api.get<Consultation[]>(`/patients/${d.patientId}/consultations`).catch(() => [] as Consultation[]);
      const first = [...list].reverse().find((c) => c.weightKg !== null);
      this.initialWeight = first && first.id !== id ? this.num(first.weightKg) : null;
    } catch (err) {
      this.patient.set(null);
      this.error.set(errorMessage(err, 'No pudimos cargar la consulta.'));
    } finally {
      this.loading.set(false);
    }
  }

  private applyDetail(d: ConsultationDetail) {
    this.detail.set(d);
    this.patient.set(d.patient);
    this.ageYears.set(d.ageYears);
    this.previousWeight = this.num(d.previous?.weightKg);
    const form = this.emptyForm();
    form.date = d.date.slice(0, 10);
    form.type = d.type;
    for (const k of NUM_KEYS) form.nums[k] = this.num(d[k]);
    for (const k of TEXT_KEYS) form.texts[k] = d[k] ?? '';
    const extra = (d as ConsultationDetail & { extraMeasures?: ExtraMeasures | null }).extraMeasures;
    for (const f of SKINFOLDS) {
      const saved = extra?.skinfoldReadings?.[f.key] ?? (extra?.skinfolds?.[f.key] ? [extra.skinfolds[f.key]!] : []);
      form.readings[f.key] = Array.from({ length: READINGS }, (_, i) => saved[i] ?? null);
    }
    form.wristCm = extra?.wristCm ?? null;
    form.fatMethod = extra?.bodyFatMethod ?? null;
    this.form = form;
  }

  protected age(): number {
    const p = this.patient();
    if (this.ageYears() !== null && !this.isNew()) return this.ageYears()!;
    return p?.birthDate ? ageFrom(p.birthDate, new Date(`${this.form.date || this.today}T12:00:00Z`)) : 0;
  }

  // Indicadores calculados con los valores actuales del formulario.
  protected indicators(): Indicator[] {
    const p = this.patient();
    if (!p) return [];
    const n = this.form.nums;
    return anthropometry({
      sex: p.sex,
      ageYears: this.age(),
      weightKg: this.num(n.weightKg),
      heightCm: this.num(n.heightCm),
      waistCm: this.num(n.waistCm),
      hipCm: this.num(n.hipCm),
      usualWeightKg: this.num(n.usualWeightKg),
      bodyFatPct: this.num(n.bodyFatPct),
      previousWeightKg: this.previousWeight,
      initialWeightKg: this.initialWeight,
    });
  }

  protected comparison() {
    const prev = this.detail()?.previous;
    if (!prev) return [];
    const rows: { key: NumKey; label: string; lowerIsBetter?: boolean }[] = [
      { key: 'weightKg', label: 'Peso (kg)' },
      { key: 'waistCm', label: 'Cintura (cm)', lowerIsBetter: true },
      { key: 'hipCm', label: 'Cadera (cm)' },
      { key: 'bodyFatPct', label: '% grasa', lowerIsBetter: true },
      { key: 'muscleMassKg', label: 'Masa muscular (kg)', lowerIsBetter: false },
    ];
    return rows.map((r) => {
      const before = this.num(prev[r.key]);
      const now = this.num(this.form.nums[r.key]);
      const diff = before !== null && now !== null ? Math.round((now - before) * 10) / 10 : null;
      let tone = 'text-muted';
      if (diff && r.lowerIsBetter !== undefined) tone = (r.lowerIsBetter ? diff < 0 : diff > 0) ? 'text-brand-700' : 'text-coral-700';
      return { label: r.label, before, now, diff, tone };
    });
  }

  protected adherenceTone() {
    const v = this.form.nums.adherencePct ?? 0;
    return v >= 75 ? 'text-brand-700' : v >= 50 ? 'text-amber-700' : 'text-coral-700';
  }

  // Cuerpo para la API: números como number y vacíos omitidos (o null al editar para borrarlos).
  private body(): Record<string, unknown> | string {
    const editing = !this.isNew();
    const body: Record<string, unknown> = { date: this.form.date, type: this.form.type };
    if (!editing && this.form.appointmentId) body['appointmentId'] = this.form.appointmentId;
    for (const k of TEXT_KEYS) {
      const v = this.form.texts[k].trim();
      if (v) body[k] = v;
      else if (editing) body[k] = null;
    }
    for (const k of NUM_KEYS) {
      let v = this.num(this.form.nums[k]);
      if (v === null) {
        if (editing) body[k] = null;
        continue;
      }
      if (INT_KEYS.includes(k)) v = Math.round(v);
      const measure = MEASURES.find((m) => m.key === k);
      const [min, max, label]: [number, number, string] = measure ? [measure.min, measure.max, measure.label] : LIMITS[k]!;
      if (v < min || v > max) return `${label}: el valor debe estar entre ${min} y ${max}.`;
      body[k] = v;
    }
    // Pliegues, muñeca y método del % de grasa se guardan juntos en las medidas adicionales.
    const skinfolds = Object.fromEntries(Object.entries(this.averages()).filter(([, v]) => v !== null));
    const skinfoldReadings = Object.fromEntries(
      SKINFOLDS.map((f) => [f.key, this.form.readings[f.key].map((v) => this.num(v)).filter((v): v is number => v !== null && v > 0)]).filter(
        ([, list]) => (list as number[]).length,
      ),
    );
    const wrist = this.num(this.form.wristCm);
    const extra: ExtraMeasures = {
      ...(Object.keys(skinfolds).length ? { skinfolds, skinfoldReadings } : {}),
      ...(wrist ? { wristCm: wrist } : {}),
      ...(this.form.fatMethod ? { bodyFatMethod: this.form.fatMethod } : {}),
    };
    if (Object.keys(extra).length || editing) body['extraMeasures'] = extra;
    return body;
  }

  protected async save() {
    this.error.set(null);
    this.savedOk.set(false);
    if (!this.form.date) {
      this.error.set('Indica la fecha de la consulta.');
      return;
    }
    const body = this.body();
    if (typeof body === 'string') {
      this.error.set(body);
      return;
    }
    this.saving.set(true);
    try {
      if (this.isNew()) {
        const created = await this.api.post<Consultation>(`/patients/${this.patient()!.id}/consultations`, body);
        await this.router.navigate(['/consultas', created.id], { replaceUrl: true, state: { saved: true } });
      } else {
        await this.api.patch(`/consultations/${this.consultationId()}`, body);
        this.applyDetail(await this.api.get<ConsultationDetail>(`/consultations/${this.consultationId()}`));
        this.savedOk.set(true);
      }
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos guardar la consulta.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async createPlan() {
    const d = this.detail();
    if (!d) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const plan = await this.api.post<{ id: string }>(`/patients/${d.patientId}/meal-plans`, { consultationId: d.id });
      await this.router.navigate(['/planes', plan.id]);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos crear el plan.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async evaluationPdf() {
    const id = this.consultationId();
    if (!id) return;
    this.error.set(null);
    try {
      await this.api.openPdf(`/reports/consultations/${id}/evaluation.pdf`);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos generar la evaluación.'));
    }
  }

  // Los campos numéricos pueden llegar como "" o como texto (Decimal): se normalizan.
  private num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
