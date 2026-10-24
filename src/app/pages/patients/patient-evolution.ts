import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { consultationTypeLabels, formatDate } from '../../core/format';
import { Evolution, EvolutionPoint } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner, SkeletonCards } from '../../shared/ui';

export interface ChartPoint {
  label: string;
  value: number;
}

// Gráfico de líneas en SVG puro, adaptable al ancho del contenedor.
@Component({
  selector: 'app-line-chart',
  template: `
    @if (points().length === 0) {
      <p class="py-10 text-center text-sm text-muted">No hay datos de esta medida en las consultas registradas.</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="h-auto w-full" role="img" [attr.aria-label]="'Evolución de ' + name()">
        <!-- Líneas guía del eje Y -->
        @for (t of geometry().ticks; track $index) {
          <line [attr.x1]="PAD_L" [attr.x2]="W - PAD_R" [attr.y1]="t.y" [attr.y2]="t.y" class="stroke-line" stroke-width="1" />
          <text [attr.x]="PAD_L - 8" [attr.y]="t.y + 4" text-anchor="end" class="fill-soft text-[11px]">{{ t.value }}</text>
        }
        <!-- Área y línea -->
        <path [attr.d]="geometry().area" class="fill-brand-100" opacity="0.6" />
        <path [attr.d]="geometry().line" fill="none" class="stroke-brand-600" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        @for (p of geometry().dots; track $index) {
          <g>
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4.5" class="fill-white stroke-brand-600" stroke-width="2.5">
              <title>{{ p.label }}: {{ p.value }} {{ unit() }}</title>
            </circle>
            @if (p.showValue) {
              <text [attr.x]="p.x" [attr.y]="p.y - 10" text-anchor="middle" class="fill-ink text-[11px] font-bold">{{ p.value }}</text>
            }
            @if (p.showLabel) {
              <text [attr.x]="p.x" [attr.y]="H - 8" text-anchor="middle" class="fill-muted text-[11px]">{{ p.label }}</text>
            }
          </g>
        }
      </svg>
    }
  `,
})
export class LineChart {
  readonly points = input.required<ChartPoint[]>();
  readonly name = input('');
  readonly unit = input('');

  protected readonly W = 640;
  protected readonly H = 240;
  protected readonly PAD_L = 44;
  protected readonly PAD_R = 20;
  private readonly PAD_T = 24;
  private readonly PAD_B = 32;

  protected readonly geometry = computed(() => {
    const pts = this.points();
    const values = pts.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    // Margen para que la línea no toque los bordes.
    const span = max - min || Math.max(Math.abs(max) * 0.1, 1);
    min -= span * 0.15;
    max += span * 0.15;
    const plotW = this.W - this.PAD_L - this.PAD_R;
    const plotH = this.H - this.PAD_T - this.PAD_B;
    const x = (i: number) => this.PAD_L + (pts.length === 1 ? plotW / 2 : (i * plotW) / (pts.length - 1));
    const y = (v: number) => this.PAD_T + plotH - ((v - min) / (max - min)) * plotH;

    const step = Math.max(1, Math.ceil(pts.length / 7));
    const dots = pts.map((p, i) => ({
      ...p,
      x: x(i),
      y: y(p.value),
      showLabel: i % step === 0 || i === pts.length - 1,
      showValue: pts.length <= 12 || i === 0 || i === pts.length - 1,
    }));
    const line = dots.map((d, i) => `${i ? 'L' : 'M'}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ');
    const bottom = this.PAD_T + plotH;
    const area = dots.length > 1 ? `${line} L${dots[dots.length - 1].x.toFixed(1)},${bottom} L${dots[0].x.toFixed(1)},${bottom} Z` : '';
    const ticks = Array.from({ length: 4 }, (_, i) => {
      const v = min + ((max - min) * i) / 3;
      return { value: Math.round(v * 10) / 10, y: y(v) };
    });
    return { dots, line, area, ticks };
  });
}

type MetricKey = 'weightKg' | 'bmi' | 'waistCm' | 'bodyFatPct' | 'adherencePct';

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'bmi', label: 'IMC', unit: 'kg/m²' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  { key: 'bodyFatPct', label: '% grasa', unit: '%' },
  { key: 'adherencePct', label: 'Adherencia', unit: '%' },
];

// Filas de la comparación entre dos consultas. "lowerIsBetter" decide el color de la diferencia.
const COMPARE_ROWS: { key: keyof EvolutionPoint; label: string; unit: string; lowerIsBetter?: boolean }[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'bmi', label: 'IMC', unit: '' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm', lowerIsBetter: true },
  { key: 'hipCm', label: 'Cadera', unit: 'cm' },
  { key: 'whr', label: 'Índice cintura-cadera', unit: '', lowerIsBetter: true },
  { key: 'bodyFatPct', label: '% grasa', unit: '%', lowerIsBetter: true },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg', lowerIsBetter: false },
  { key: 'adherencePct', label: 'Adherencia', unit: '%', lowerIsBetter: false },
];

// Pestaña de evolución: resumen, gráfico y comparación entre consultas.
@Component({
  selector: 'app-evolution-tab',
  imports: [RouterLink, Icon, Empty, ErrorBanner, SkeletonCards, LineChart],
  template: `
    <app-error [message]="error()" />
    @if (loading()) {
      <app-skeleton-cards [count]="4" grid="grid-cols-2 md:grid-cols-4" />
    } @else if (data(); as evo) {
      @if (evo.points.length === 0) {
        <div class="card">
          <app-empty emoji="📈" title="Aún no hay consultas" text="La evolución aparece cuando registras mediciones en las consultas." />
        </div>
      } @else {
        <div class="mb-4 flex justify-end">
          <button class="btn-outline btn-sm" (click)="progressPdf()"><app-icon name="document" /> Informe de progreso</button>
        </div>

        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="card">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">Peso inicial</p>
            <p class="text-2xl font-extrabold">{{ kg(evo.summary.initialWeightKg) }}</p>
          </div>
          <div class="card">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">Peso actual</p>
            <p class="text-2xl font-extrabold">{{ kg(evo.summary.currentWeightKg) }}</p>
          </div>
          <div class="card">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">Cambio</p>
            <p class="text-2xl font-extrabold" [class]="changeClass(evo.summary.weightChangeKg)">
              {{ evo.summary.weightChangeKg === null ? '—' : signed(evo.summary.weightChangeKg) + ' kg' }}
            </p>
          </div>
          <div class="card">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">IMC</p>
            <p class="text-2xl font-extrabold">
              {{ evo.summary.currentBmi ?? '—' }}
              @if (evo.summary.initialBmi !== null && evo.summary.initialBmi !== evo.summary.currentBmi) {
                <span class="text-sm font-semibold text-muted">desde {{ evo.summary.initialBmi }}</span>
              }
            </p>
          </div>
        </div>

        <div class="card mt-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-extrabold">Evolución de {{ metric().label.toLowerCase() }}</h2>
            <div class="flex flex-wrap gap-1 rounded-xl bg-mist p-1 text-xs font-bold" role="group" aria-label="Medida">
              @for (m of metrics; track m.key) {
                <button class="cursor-pointer rounded-lg px-2.5 py-1.5" [class]="metricKey() === m.key ? 'bg-white text-ink shadow-soft' : 'text-muted'" (click)="metricKey.set(m.key)">
                  {{ m.label }}
                </button>
              }
            </div>
          </div>
          <app-line-chart [points]="chartPoints()" [name]="metric().label" [unit]="metric().unit" />
        </div>

        <div class="card mt-4">
          <div class="mb-3">
            <h2 class="text-lg font-extrabold">Consultas</h2>
            <p class="text-sm text-muted">Marca dos consultas para compararlas lado a lado.</p>
          </div>
          <div class="-mx-5 overflow-x-auto">
            <table class="table-base">
              <thead>
                <tr>
                  <th class="w-10"><span class="sr-only">Comparar</span></th>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th class="text-right">Peso</th>
                  <th class="text-right">IMC</th>
                  <th class="text-right">Cintura</th>
                  <th class="text-right">Cadera</th>
                  <th class="text-right">% grasa</th>
                  <th class="text-right">M. muscular</th>
                  <th class="text-right">ICC</th>
                  <th class="text-right">Adherencia</th>
                </tr>
              </thead>
              <tbody>
                @for (p of evo.points; track p.consultationId) {
                  <tr [class]="selected().includes(p.consultationId) ? 'bg-brand-50' : ''">
                    <td>
                      <input
                        type="checkbox"
                        class="size-4 accent-brand-600"
                        [checked]="selected().includes(p.consultationId)"
                        (change)="toggle(p.consultationId)"
                        [attr.aria-label]="'Comparar consulta del ' + date(p.date)"
                      />
                    </td>
                    <td class="whitespace-nowrap">
                      <a class="font-bold text-brand-700 hover:underline" [routerLink]="['/consultas', p.consultationId]">{{ date(p.date) }}</a>
                    </td>
                    <td class="whitespace-nowrap">{{ types[p.type] }}</td>
                    <td class="text-right">{{ p.weightKg ?? '—' }}</td>
                    <td class="text-right">{{ p.bmi ?? '—' }}</td>
                    <td class="text-right">{{ p.waistCm ?? '—' }}</td>
                    <td class="text-right">{{ p.hipCm ?? '—' }}</td>
                    <td class="text-right">{{ p.bodyFatPct ?? '—' }}</td>
                    <td class="text-right">{{ p.muscleMassKg ?? '—' }}</td>
                    <td class="text-right">{{ p.whr ?? '—' }}</td>
                    <td class="text-right">{{ p.adherencePct !== null ? p.adherencePct + ' %' : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        @if (comparison(); as cmp) {
          <div class="card mt-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h2 class="text-lg font-extrabold">Comparación</h2>
              <button class="btn-ghost btn-sm" (click)="selected.set([])"><app-icon name="x" /> Limpiar</button>
            </div>
            <div class="-mx-5 overflow-x-auto">
              <table class="table-base">
                <thead>
                  <tr>
                    <th>Medida</th>
                    <th class="text-right">{{ date(cmp.a.date) }}</th>
                    <th class="text-right">{{ date(cmp.b.date) }}</th>
                    <th class="text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of cmp.rows; track r.label) {
                    <tr>
                      <td class="font-bold">{{ r.label }}</td>
                      <td class="text-right">{{ r.a ?? '—' }} {{ r.a !== null ? r.unit : '' }}</td>
                      <td class="text-right">{{ r.b ?? '—' }} {{ r.b !== null ? r.unit : '' }}</td>
                      <td class="text-right font-bold" [class]="r.tone">{{ r.diff === null ? '—' : signed(r.diff) + ' ' + r.unit }}</td>
                    </tr>
                  }
                  @if (cmp.b.symptoms || cmp.b.treatmentChanges) {
                    <tr>
                      <td class="font-bold">Síntomas / cambios</td>
                      <td class="text-sm text-muted">{{ joinText(cmp.a.symptoms, cmp.a.treatmentChanges) || '—' }}</td>
                      <td colspan="2" class="text-sm text-muted">{{ joinText(cmp.b.symptoms, cmp.b.treatmentChanges) || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    }
  `,
})
export class EvolutionTab implements OnInit {
  // Une los textos no vacíos con un separador.
  protected joinText(...parts: (string | null | undefined)[]) {
    return parts.filter((p) => p).join(' · ');
  }

  private readonly api = inject(ApiService);
  readonly patientId = input.required<string>();

  protected readonly types = consultationTypeLabels;
  protected readonly metrics = METRICS;
  protected readonly date = (iso: string) => formatDate(iso, 'short');

  protected readonly data = signal<Evolution | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly metricKey = signal<MetricKey>('weightKg');
  protected readonly selected = signal<string[]>([]);

  protected readonly metric = computed(() => METRICS.find((m) => m.key === this.metricKey())!);

  protected readonly chartPoints = computed<ChartPoint[]>(() => {
    const key = this.metricKey();
    return (this.data()?.points ?? [])
      .filter((p) => p[key] !== null)
      .map((p) => ({ label: formatDate(p.date, 'short').replace(/ de \d{4}$/, ''), value: Number(p[key]) }));
  });

  // Ordena las dos consultas elegidas de la más antigua a la más reciente.
  protected readonly comparison = computed(() => {
    const ids = this.selected();
    const points = this.data()?.points ?? [];
    if (ids.length !== 2) return null;
    const [a, b] = points.filter((p) => ids.includes(p.consultationId));
    if (!a || !b) return null;
    const rows = COMPARE_ROWS.map((r) => {
      const va = a[r.key] as number | null;
      const vb = b[r.key] as number | null;
      const diff = va !== null && vb !== null ? Math.round((vb - va) * 100) / 100 : null;
      let tone = 'text-muted';
      if (diff && r.lowerIsBetter !== undefined) {
        const good = r.lowerIsBetter ? diff < 0 : diff > 0;
        tone = good ? 'text-brand-700' : 'text-coral-700';
      }
      return { label: r.label, unit: r.unit, a: va, b: vb, diff, tone };
    });
    return { a, b, rows };
  });

  ngOnInit() {
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.api.get<Evolution>(`/patients/${this.patientId()}/evolution`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar la evolución.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggle(id: string) {
    const current = this.selected();
    if (current.includes(id)) this.selected.set(current.filter((x) => x !== id));
    // Con dos ya marcadas, se descarta la que se marcó primero.
    else this.selected.set([...current, id].slice(-2));
  }

  protected async progressPdf() {
    this.error.set(null);
    try {
      await this.api.openPdf(`/reports/patients/${this.patientId()}/progress.pdf`);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos generar el informe de progreso.'));
    }
  }

  protected kg(v: number | null) {
    return v === null ? '—' : `${v} kg`;
  }

  protected signed(v: number) {
    return v > 0 ? `+${v}` : `${v}`;
  }

  protected changeClass(v: number | null) {
    if (!v) return 'text-ink';
    return v < 0 ? 'text-brand-700' : 'text-coral-700';
  }
}
