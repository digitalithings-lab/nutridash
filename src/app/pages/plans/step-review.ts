import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { servings as fmtServings } from '../../core/format';
import { Icon } from '../../shared/icon';
import { ErrorBanner } from '../../shared/ui';
import { ChecksTable } from './checks-table';
import { PlanStore } from './plan-store';

// Paso 6: validación contra el objetivo, textos para el paciente y aprobación profesional.
@Component({
  selector: 'app-step-review',
  imports: [FormsModule, Icon, ChecksTable, ErrorBanner],
  template: `
    @if (store.plan(); as plan) {
      <h3 class="mb-2 font-bold">Intercambios vs. objetivo</h3>
      <app-checks-table [checks]="plan.validation.exchangeChecks" />

      <h3 class="mt-6 mb-2 font-bold">Menú vs. objetivo</h3>
      @if (plan.validation.menuChecks.length) {
        <app-checks-table [checks]="plan.validation.menuChecks" />
      } @else {
        <p class="text-sm text-muted">El menú aún no tiene alimentos.</p>
      }

      @if (plan.validation.distributionIssues.length) {
        <div class="mt-4 rounded-xl bg-coral-100 px-4 py-3 text-sm text-coral-700">
          <p class="font-bold">Distribución por tiempos de comida</p>
          @for (d of plan.validation.distributionIssues; track d.key) {
            <p>{{ store.groupName(d.key) }}: asignado {{ fmt(d.assigned) }} de {{ fmt(d.daily) }} porciones.</p>
          }
        </div>
      }

      <div class="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <label class="label" for="title">Título del plan</label>
          <input id="title" class="input" [(ngModel)]="title" [disabled]="plan.status === 'ARCHIVED'" />

          <p class="label mt-4">Objetivos para el paciente</p>
          <div class="space-y-2">
            @for (o of objectives(); track $index; let i = $index) {
              <div class="flex gap-2">
                <input class="input" [ngModel]="o" (ngModelChange)="setObjective(i, $event)" [disabled]="plan.status === 'ARCHIVED'" [attr.aria-label]="'Objetivo ' + (i + 1)" />
                <button class="rounded-lg p-2 text-muted hover:bg-danger-100 hover:text-danger-500" (click)="removeObjective(i)" [disabled]="plan.status === 'ARCHIVED'" aria-label="Quitar objetivo">
                  <app-icon name="x" size="sm" />
                </button>
              </div>
            }
            @if (objectives().length < 10 && plan.status !== 'ARCHIVED') {
              <button class="btn-ghost btn-sm" (click)="objectives.update((l) => [...l, ''])"><app-icon name="plus" size="sm" /> Objetivo</button>
            }
          </div>
        </div>
        <div>
          <label class="label" for="recs">Recomendaciones (aparecen en el PDF)</label>
          <textarea id="recs" class="input min-h-32" [(ngModel)]="recommendations" [disabled]="plan.status === 'ARCHIVED'" placeholder="Hidratación, horarios, preparación de alimentos…"></textarea>
          <label class="label mt-4" for="notes">Notas internas</label>
          <textarea id="notes" class="input min-h-20" [(ngModel)]="notes" [disabled]="plan.status === 'ARCHIVED'" placeholder="Solo las ves tú"></textarea>
        </div>
      </div>
      @if (plan.status !== 'ARCHIVED') {
        <div class="mt-3 flex justify-end">
          <button class="btn-outline btn-sm" [disabled]="store.saving()" (click)="saveTexts()">Guardar textos</button>
        </div>
      }

      <div class="mt-8 rounded-2xl border-2 p-5" [class]="plan.status === 'APPROVED' ? 'border-brand-200 bg-brand-50' : 'border-line'">
        @if (plan.status === 'DRAFT') {
          <h3 class="text-lg font-extrabold">Aprobación profesional</h3>
          @if (plan.validation.ready) {
            <p class="mt-1 text-sm text-brand-700">Todo coincide con el objetivo dentro de la tolerancia.</p>
          } @else {
            <ul class="mt-2 space-y-1 text-sm text-coral-700">
              @for (w of plan.validation.warnings; track w) {
                <li class="flex gap-2"><app-icon name="warning" size="sm" /> {{ w }}</li>
              }
            </ul>
            <label class="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" class="mt-0.5 size-4 accent-brand-600" [(ngModel)]="acknowledge" />
              Revisé las diferencias y apruebo el plan con mi criterio profesional.
            </label>
          }
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="btn-primary" [disabled]="store.saving() || (!plan.validation.ready && !acknowledge)" (click)="approve()">
              <app-icon name="check" size="sm" /> Aprobar plan
            </button>
            <button class="btn-outline" (click)="pdf('plan')"><app-icon name="eye" size="sm" /> Vista previa PDF</button>
          </div>
        } @else {
          <h3 class="text-lg font-extrabold">{{ plan.status === 'APPROVED' ? 'Plan aprobado' : 'Plan archivado' }}</h3>
          <p class="mt-1 text-sm text-muted">
            {{ plan.status === 'APPROVED' ? 'Listo para entregar al paciente.' : 'Este plan fue reemplazado por uno más reciente.' }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="btn-primary" (click)="pdf('plan')"><app-icon name="download" size="sm" /> PDF para el paciente</button>
            <button class="btn-outline" (click)="pdf('calculations')"><app-icon name="document" size="sm" /> Informe de cálculos</button>
            @if (plan.status === 'APPROVED') {
              <button class="btn-ghost" [disabled]="store.saving()" (click)="reopen()">Reabrir para ajustar</button>
            }
          </div>
        }
      </div>
      <app-error class="mt-3 block" [message]="pdfError()" />
    }
  `,
})
export class StepReview {
  protected readonly store = inject(PlanStore);
  private readonly api = inject(ApiService);
  protected readonly fmt = fmtServings;

  protected title = '';
  protected recommendations = '';
  protected notes = '';
  protected acknowledge = false;
  protected readonly objectives = signal<string[]>([]);
  protected readonly pdfError = signal<string | null>(null);

  constructor() {
    let loadedId: string | null = null;
    effect(() => {
      const p = this.store.plan();
      if (!p || loadedId === p.id) return;
      loadedId = p.id;
      this.title = p.title;
      this.recommendations = p.recommendations ?? '';
      this.notes = p.notes ?? '';
      this.objectives.set([...p.objectives]);
    });
  }

  protected setObjective(i: number, value: string) {
    this.objectives.update((l) => l.map((o, j) => (j === i ? value : o)));
  }

  protected removeObjective(i: number) {
    this.objectives.update((l) => l.filter((_, j) => j !== i));
  }

  async saveTexts(): Promise<boolean> {
    return this.store.run('patch', '', {
      title: this.title.trim() || 'Plan alimentario',
      objectives: this.objectives().map((o) => o.trim()).filter(Boolean),
      recommendations: this.recommendations.trim() || null,
      notes: this.notes.trim() || null,
    });
  }

  async approve() {
    if (!(await this.saveTexts())) return;
    await this.store.run('post', '/approve', { acknowledgeWarnings: this.acknowledge });
  }

  async reopen() {
    await this.store.run('post', '/reopen');
  }

  async pdf(kind: 'plan' | 'calculations') {
    this.pdfError.set(null);
    try {
      await this.api.openPdf(`/reports/meal-plans/${this.store.plan()!.id}/${kind}.pdf`);
    } catch (err) {
      this.pdfError.set(errorMessage(err, 'No se pudo generar el PDF.'));
    }
  }
}
