import { DialogService } from '../../shared/dialog';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatDate, todayIso } from '../../core/format';
import { LabResult, Medication, Patient } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner, Modal } from '../../shared/ui';

// Al crear se omiten los textos vacíos; al editar se envían como null para borrarlos.
function clean(value: Record<string, unknown>, editing: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
      else if (editing) out[k] = null;
    } else if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

// Pestaña de medicación y suplementos.
@Component({
  selector: 'app-medications-tab',
  imports: [FormsModule, Icon, Empty, ErrorBanner, Modal],
  template: `
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-extrabold">Medicación y suplementos</h2>
          <p class="text-sm text-muted">{{ meds().length }} medicamentos · {{ supplements().length }} suplementos</p>
        </div>
        <button class="btn-primary btn-sm" (click)="openForm(null)"><app-icon name="plus" /> Agregar</button>
      </div>
      <app-error [message]="error()" />

      @if (patient().medications.length === 0) {
        <app-empty emoji="💊" title="Sin medicación registrada" text="Registra medicamentos y suplementos para tenerlos en cuenta en el plan." />
      } @else {
        @for (group of groups(); track group.title) {
          @if (group.items.length) {
            <h3 class="mt-4 mb-2 text-xs font-bold tracking-wide text-muted uppercase">{{ group.title }}</h3>
            <ul class="divide-y divide-line rounded-xl border border-line">
              @for (m of group.items; track m.id) {
                <li class="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="grid size-9 shrink-0 place-items-center rounded-lg" [class]="m.isSupplement ? 'bg-violet-100 text-violet-500' : 'bg-sky-100 text-sky-700'">
                      <app-icon [name]="m.isSupplement ? 'beaker' : 'pill'" />
                    </span>
                    <div class="min-w-0">
                      <p class="font-bold">
                        {{ m.name }}
                        @if (m.endedOn) {
                          <span class="chip ml-1 bg-mist text-muted">Suspendido</span>
                        }
                      </p>
                      <p class="text-sm text-muted">{{ joinText(m.dose, m.frequency) || 'Sin dosis indicada' }}</p>
                      <p class="text-xs text-soft">
                        @if (m.startedOn) { Desde {{ date(m.startedOn) }} }
                        @if (m.endedOn) { · Hasta {{ date(m.endedOn) }} }
                      </p>
                      @if (m.notes) {
                        <p class="mt-1 text-sm">{{ m.notes }}</p>
                      }
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button class="btn-ghost btn-sm" (click)="openForm(m)" aria-label="Editar"><app-icon name="edit" /></button>
                    <button class="btn-ghost btn-sm text-danger-500" (click)="remove(m)" aria-label="Eliminar"><app-icon name="trash" /></button>
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </div>

    @if (editing()) {
      <app-modal [title]="editing()!.id ? 'Editar medicación' : 'Agregar medicación'" (closed)="editing.set(null)">
        <form class="space-y-4" (ngSubmit)="save()">
          <div class="flex rounded-xl bg-mist p-1 text-sm font-bold">
            <button type="button" class="flex-1 cursor-pointer rounded-lg px-3 py-1.5" [class]="!form.isSupplement ? 'bg-white shadow-soft' : 'text-muted'" (click)="form.isSupplement = false">Medicamento</button>
            <button type="button" class="flex-1 cursor-pointer rounded-lg px-3 py-1.5" [class]="form.isSupplement ? 'bg-white shadow-soft' : 'text-muted'" (click)="form.isSupplement = true">Suplemento</button>
          </div>
          <div>
            <label class="label" for="med-name">Nombre *</label>
            <input id="med-name" class="input" name="name" maxlength="100" [(ngModel)]="form.name" required />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="med-dose">Dosis</label>
              <input id="med-dose" class="input" name="dose" maxlength="60" placeholder="500 mg" [(ngModel)]="form.dose" />
            </div>
            <div>
              <label class="label" for="med-freq">Frecuencia</label>
              <input id="med-freq" class="input" name="frequency" maxlength="60" placeholder="Cada 12 horas" [(ngModel)]="form.frequency" />
            </div>
            <div>
              <label class="label" for="med-start">Inicio</label>
              <input id="med-start" class="input" type="date" name="startedOn" [(ngModel)]="form.startedOn" />
            </div>
            <div>
              <label class="label" for="med-end">Fin</label>
              <input id="med-end" class="input" type="date" name="endedOn" [(ngModel)]="form.endedOn" />
            </div>
          </div>
          <div>
            <label class="label" for="med-notes">Notas</label>
            <textarea id="med-notes" class="input" rows="2" name="notes" maxlength="500" [(ngModel)]="form.notes"></textarea>
          </div>
          <app-error [message]="formError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="editing.set(null)">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class MedicationsTab {
  // Une los textos no vacíos con un separador.
  protected joinText(...parts: (string | null | undefined)[]) {
    return parts.filter((p) => p).join(' · ');
  }

  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);
  readonly patient = input.required<Patient>();
  readonly changed = output<void>();

  protected readonly date = (iso: string | null) => formatDate(iso, 'short');
  protected readonly meds = computed(() => this.patient().medications.filter((m) => !m.isSupplement));
  protected readonly supplements = computed(() => this.patient().medications.filter((m) => m.isSupplement));
  protected readonly groups = computed(() => [
    { title: 'Medicamentos', items: this.meds() },
    { title: 'Suplementos', items: this.supplements() },
  ]);

  protected readonly editing = signal<{ id: string | null } | null>(null);
  protected form = { name: '', dose: '', frequency: '', isSupplement: false, startedOn: '', endedOn: '', notes: '' };
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected openForm(m: Medication | null) {
    this.formError.set(null);
    this.form = {
      name: m?.name ?? '',
      dose: m?.dose ?? '',
      frequency: m?.frequency ?? '',
      isSupplement: m?.isSupplement ?? false,
      startedOn: m?.startedOn?.slice(0, 10) ?? '',
      endedOn: m?.endedOn?.slice(0, 10) ?? '',
      notes: m?.notes ?? '',
    };
    this.editing.set({ id: m?.id ?? null });
  }

  protected async save() {
    if (!this.form.name.trim()) {
      this.formError.set('Escribe el nombre.');
      return;
    }
    const id = this.editing()?.id;
    const base = `/patients/${this.patient().id}/medications`;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const body = clean(this.form, !!id);
      if (id) await this.api.put(`${base}/${id}`, body);
      else await this.api.post(base, body);
      this.editing.set(null);
      this.changed.emit();
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar la medicación.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(m: Medication) {
    const ok = await this.dialog.confirm({ title: `¿Eliminar «${m.name}»?`, message: 'Se quitará del expediente del paciente.', confirmLabel: 'Eliminar', tone: 'danger', icon: 'trash' });
    if (!ok) return;
    this.error.set(null);
    try {
      await this.api.delete(`/patients/${this.patient().id}/medications/${m.id}`);
      this.changed.emit();
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos eliminar la medicación.'));
    }
  }
}

// Pestaña de resultados de laboratorio.
@Component({
  selector: 'app-labs-tab',
  imports: [FormsModule, Icon, Empty, ErrorBanner, Modal],
  template: `
    <div class="card">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-extrabold">Laboratorios</h2>
        <button class="btn-primary btn-sm" (click)="openForm(null)"><app-icon name="plus" /> Agregar resultado</button>
      </div>
      <app-error [message]="error()" />

      @if (patient().labResults.length === 0) {
        <app-empty emoji="🧪" title="Sin resultados de laboratorio" text="Registra glucosa, perfil lipídico, hemoglobina y otros valores." />
      } @else {
        <div class="-mx-5 overflow-x-auto">
          <table class="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Prueba</th>
                <th>Resultado</th>
                <th>Referencia</th>
                <th>Notas</th>
                <th class="w-24"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (l of patient().labResults; track l.id) {
                <tr>
                  <td class="whitespace-nowrap">{{ date(l.takenOn) }}</td>
                  <td class="font-bold">{{ l.name }}</td>
                  <td class="whitespace-nowrap">{{ l.value }} {{ l.unit ?? '' }}</td>
                  <td class="text-muted">{{ l.reference ?? '—' }}</td>
                  <td class="max-w-xs text-muted">{{ l.notes ?? '' }}</td>
                  <td class="whitespace-nowrap text-right">
                    <button class="btn-ghost btn-sm" (click)="openForm(l)" aria-label="Editar"><app-icon name="edit" /></button>
                    <button class="btn-ghost btn-sm text-danger-500" (click)="remove(l)" aria-label="Eliminar"><app-icon name="trash" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (editing()) {
      <app-modal [title]="editing()!.id ? 'Editar resultado' : 'Agregar resultado'" (closed)="editing.set(null)">
        <form class="space-y-4" (ngSubmit)="save()">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="lab-date">Fecha *</label>
              <input id="lab-date" class="input" type="date" name="takenOn" [(ngModel)]="form.takenOn" required />
            </div>
            <div>
              <label class="label" for="lab-name">Prueba *</label>
              <input id="lab-name" class="input" name="name" maxlength="80" placeholder="Glucosa en ayunas" [(ngModel)]="form.name" required />
            </div>
            <div>
              <label class="label" for="lab-value">Resultado *</label>
              <input id="lab-value" class="input" name="value" maxlength="40" [(ngModel)]="form.value" required />
            </div>
            <div>
              <label class="label" for="lab-unit">Unidad</label>
              <input id="lab-unit" class="input" name="unit" maxlength="20" placeholder="mg/dL" [(ngModel)]="form.unit" />
            </div>
          </div>
          <div>
            <label class="label" for="lab-ref">Valor de referencia</label>
            <input id="lab-ref" class="input" name="reference" maxlength="60" placeholder="70–100" [(ngModel)]="form.reference" />
          </div>
          <div>
            <label class="label" for="lab-notes">Notas</label>
            <textarea id="lab-notes" class="input" rows="2" name="notes" maxlength="500" [(ngModel)]="form.notes"></textarea>
          </div>
          <app-error [message]="formError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="editing.set(null)">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class LabsTab {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);
  readonly patient = input.required<Patient>();
  readonly changed = output<void>();

  protected readonly date = (iso: string | null) => formatDate(iso, 'short');
  protected readonly editing = signal<{ id: string | null } | null>(null);
  protected form = { takenOn: '', name: '', value: '', unit: '', reference: '', notes: '' };
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected openForm(l: LabResult | null) {
    this.formError.set(null);
    this.form = {
      takenOn: l?.takenOn.slice(0, 10) ?? todayIso(),
      name: l?.name ?? '',
      value: l?.value ?? '',
      unit: l?.unit ?? '',
      reference: l?.reference ?? '',
      notes: l?.notes ?? '',
    };
    this.editing.set({ id: l?.id ?? null });
  }

  protected async save() {
    if (!this.form.takenOn || !this.form.name.trim() || !this.form.value.trim()) {
      this.formError.set('Completa la fecha, la prueba y el resultado.');
      return;
    }
    const id = this.editing()?.id;
    const base = `/patients/${this.patient().id}/labs`;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const body = clean(this.form, !!id);
      if (id) await this.api.put(`${base}/${id}`, body);
      else await this.api.post(base, body);
      this.editing.set(null);
      this.changed.emit();
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar el resultado.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(l: LabResult) {
    const ok = await this.dialog.confirm({
      title: '¿Eliminar este resultado?',
      details: [
        { label: 'Prueba', value: l.name },
        { label: 'Fecha', value: this.date(l.takenOn) },
      ],
      confirmLabel: 'Eliminar',
      tone: 'danger',
      icon: 'trash',
    });
    if (!ok) return;
    this.error.set(null);
    try {
      await this.api.delete(`/patients/${this.patient().id}/labs/${l.id}`);
      this.changed.emit();
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos eliminar el resultado.'));
    }
  }
}
