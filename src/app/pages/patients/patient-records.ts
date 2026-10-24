import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { Background, DietHistory, Patient } from '../../core/types';
import { Icon } from '../../shared/icon';
import { ErrorBanner } from '../../shared/ui';

interface Field {
  key: string;
  label: string;
  placeholder?: string;
  rows?: number;
}

const BACKGROUND_FIELDS: Field[] = [
  { key: 'pathological', label: 'Patológicos', placeholder: 'Diabetes, hipertensión, dislipidemia…' },
  { key: 'family', label: 'Heredofamiliares', placeholder: 'Enfermedades en padres, hermanos…' },
  { key: 'surgical', label: 'Quirúrgicos' },
  { key: 'allergies', label: 'Alergias alimentarias' },
  { key: 'intolerances', label: 'Intolerancias', placeholder: 'Lactosa, gluten…' },
  { key: 'gastrointestinal', label: 'Gastrointestinales', placeholder: 'Estreñimiento, reflujo, distensión…' },
  { key: 'gynecological', label: 'Gineco-obstétricos', placeholder: 'Ciclo menstrual, embarazos, menopausia…' },
  { key: 'smoking', label: 'Tabaco' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'physicalActivity', label: 'Actividad física', placeholder: 'Tipo, frecuencia y duración' },
  { key: 'sleep', label: 'Sueño', placeholder: 'Horas y calidad' },
  { key: 'stress', label: 'Estrés' },
  { key: 'notes', label: 'Notas', rows: 3 },
];

const DIET_FIELDS: Field[] = [
  { key: 'recall24h', label: 'Recordatorio de 24 horas', placeholder: 'Desayuno, merienda, almuerzo, cena…', rows: 5 },
  { key: 'foodFrequency', label: 'Frecuencia de consumo', rows: 4 },
  { key: 'preferences', label: 'Preferencias' },
  { key: 'aversions', label: 'Aversiones' },
  { key: 'waterIntake', label: 'Consumo de agua', placeholder: 'Vasos o litros al día' },
  { key: 'appetite', label: 'Apetito' },
  { key: 'eatsOutside', label: 'Come fuera de casa', placeholder: '¿Cuántas veces y dónde?' },
  { key: 'whoCooks', label: '¿Quién cocina?' },
  { key: 'supplements', label: 'Suplementos' },
  { key: 'previousDiets', label: 'Dietas anteriores' },
  { key: 'notes', label: 'Notas', rows: 3 },
];

// Pestaña de antecedentes: PUT /patients/:id/background.
@Component({
  selector: 'app-background-tab',
  imports: [FormsModule, ErrorBanner, Icon],
  template: `
    <form class="card space-y-5" (ngSubmit)="save()">
      <div>
        <h2 class="text-lg font-extrabold">Antecedentes</h2>
        <p class="text-sm text-muted">Las alergias e intolerancias se muestran como alerta en el resumen del expediente.</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        @for (f of fields; track f.key) {
          <div [class]="(f.key === 'notes') ? 'md:col-span-2' : ''">
            <label class="label" [for]="'bg-' + f.key">{{ f.label }}</label>
            <textarea
              class="input"
              [id]="'bg-' + f.key"
              [name]="f.key"
              [rows]="f.rows ?? 2"
              maxlength="4000"
              [placeholder]="f.placeholder ?? ''"
              [(ngModel)]="form[f.key]"
            ></textarea>
          </div>
        }
      </div>
      <app-error [message]="error()" />
      <div class="flex items-center justify-end gap-3">
        @if (savedOk()) {
          <span class="flex items-center gap-1 text-sm font-bold text-brand-700"><app-icon name="check" /> Guardado</span>
        }
        <button class="btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar antecedentes' }}</button>
      </div>
    </form>
  `,
})
export class BackgroundTab implements OnInit {
  private readonly api = inject(ApiService);
  readonly patient = input.required<Patient>();
  readonly changed = output<void>();

  protected readonly fields = BACKGROUND_FIELDS;
  protected form: Record<string, string> = {};
  protected readonly saving = signal(false);
  protected readonly savedOk = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit() {
    const bg = (this.patient().background ?? {}) as Record<string, unknown>;
    for (const f of this.fields) this.form[f.key] = (bg[f.key] as string | null) ?? '';
  }

  protected async save() {
    this.saving.set(true);
    this.savedOk.set(false);
    this.error.set(null);
    const body: Record<string, string | null> = {};
    for (const f of this.fields) body[f.key] = this.form[f.key]?.trim() || null;
    try {
      await this.api.put<Background>(`/patients/${this.patient().id}/background`, body);
      this.savedOk.set(true);
      this.changed.emit();
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos guardar los antecedentes.'));
    } finally {
      this.saving.set(false);
    }
  }
}

// Pestaña de historia alimentaria: PUT /patients/:id/diet-history.
@Component({
  selector: 'app-diet-history-tab',
  imports: [FormsModule, ErrorBanner, Icon],
  template: `
    <form class="card space-y-5" (ngSubmit)="save()">
      <h2 class="text-lg font-extrabold">Historia alimentaria</h2>
      <div class="max-w-xs">
        <label class="label" for="dh-meals">Comidas al día</label>
        <input id="dh-meals" class="input" type="number" min="1" max="10" step="1" name="mealsPerDay" [(ngModel)]="mealsPerDay" />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        @for (f of fields; track f.key) {
          <div [class]="(f.key === 'recall24h' || f.key === 'foodFrequency' || f.key === 'notes') ? 'md:col-span-2' : ''">
            <label class="label" [for]="'dh-' + f.key">{{ f.label }}</label>
            <textarea
              class="input"
              [id]="'dh-' + f.key"
              [name]="f.key"
              [rows]="f.rows ?? 2"
              maxlength="4000"
              [placeholder]="f.placeholder ?? ''"
              [(ngModel)]="form[f.key]"
            ></textarea>
          </div>
        }
      </div>
      <app-error [message]="error()" />
      <div class="flex items-center justify-end gap-3">
        @if (savedOk()) {
          <span class="flex items-center gap-1 text-sm font-bold text-brand-700"><app-icon name="check" /> Guardado</span>
        }
        <button class="btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar historia' }}</button>
      </div>
    </form>
  `,
})
export class DietHistoryTab implements OnInit {
  private readonly api = inject(ApiService);
  readonly patient = input.required<Patient>();
  readonly changed = output<void>();

  protected readonly fields = DIET_FIELDS;
  protected form: Record<string, string> = {};
  protected mealsPerDay: number | null = null;
  protected readonly saving = signal(false);
  protected readonly savedOk = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit() {
    const dh = (this.patient().dietHistory ?? {}) as Record<string, unknown>;
    for (const f of this.fields) this.form[f.key] = (dh[f.key] as string | null) ?? '';
    this.mealsPerDay = (dh['mealsPerDay'] as number | null) ?? null;
  }

  protected async save() {
    this.error.set(null);
    this.savedOk.set(false);
    const meals = this.mealsPerDay === null || (this.mealsPerDay as unknown) === '' ? null : Number(this.mealsPerDay);
    if (meals !== null && (!Number.isInteger(meals) || meals < 1 || meals > 10)) {
      this.error.set('Las comidas al día deben ser un número entero entre 1 y 10.');
      return;
    }
    const body: Record<string, string | number | null> = { mealsPerDay: meals };
    for (const f of this.fields) body[f.key] = this.form[f.key]?.trim() || null;
    this.saving.set(true);
    try {
      await this.api.put<DietHistory>(`/patients/${this.patient().id}/diet-history`, body);
      this.savedOk.set(true);
      this.changed.emit();
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos guardar la historia alimentaria.'));
    } finally {
      this.saving.set(false);
    }
  }
}
