import { Component, input, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Patient, Sex } from '../../core/types';
import { ErrorBanner } from '../../shared/ui';

// Datos que acepta POST /patients y PATCH /patients/:id.
export interface PatientFormValue {
  firstName: string;
  lastName: string;
  sex: Sex;
  birthDate: string;
  documentId?: string | null;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  reason?: string | null;
  goal?: string | null;
  notes?: string | null;
}

const OPTIONAL = ['documentId', 'phone', 'email', 'occupation', 'address', 'reason', 'goal', 'notes'] as const;

// Formulario de datos generales del paciente (alta y edición).
@Component({
  selector: 'app-patient-form',
  imports: [FormsModule, ErrorBanner],
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="pf-first">Nombre *</label>
          <input id="pf-first" class="input" name="firstName" maxlength="60" [(ngModel)]="form.firstName" required />
        </div>
        <div>
          <label class="label" for="pf-last">Apellido *</label>
          <input id="pf-last" class="input" name="lastName" maxlength="60" [(ngModel)]="form.lastName" required />
        </div>
        <div>
          <label class="label" for="pf-sex">Sexo *</label>
          <select id="pf-sex" class="input" name="sex" [(ngModel)]="form.sex">
            <option value="FEMALE">Femenino</option>
            <option value="MALE">Masculino</option>
          </select>
        </div>
        <div>
          <label class="label" for="pf-birth">Fecha de nacimiento *</label>
          <input id="pf-birth" class="input" type="date" name="birthDate" [max]="today" [(ngModel)]="form.birthDate" required />
        </div>
        <div>
          <label class="label" for="pf-doc">Cédula / documento</label>
          <input id="pf-doc" class="input" name="documentId" maxlength="30" [(ngModel)]="form.documentId" />
        </div>
        <div>
          <label class="label" for="pf-phone">Teléfono</label>
          <input id="pf-phone" class="input" type="tel" name="phone" maxlength="30" [(ngModel)]="form.phone" />
        </div>
        <div>
          <label class="label" for="pf-email">Correo electrónico</label>
          <input id="pf-email" class="input" type="email" name="email" [(ngModel)]="form.email" />
        </div>
        <div>
          <label class="label" for="pf-occ">Ocupación</label>
          <input id="pf-occ" class="input" name="occupation" maxlength="80" [(ngModel)]="form.occupation" />
        </div>
      </div>
      <div>
        <label class="label" for="pf-address">Dirección</label>
        <input id="pf-address" class="input" name="address" maxlength="200" [(ngModel)]="form.address" />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="pf-reason">Motivo de consulta</label>
          <textarea id="pf-reason" class="input" rows="2" name="reason" maxlength="1000" [(ngModel)]="form.reason"></textarea>
        </div>
        <div>
          <label class="label" for="pf-goal">Objetivo</label>
          <textarea id="pf-goal" class="input" rows="2" name="goal" maxlength="1000" [(ngModel)]="form.goal"></textarea>
        </div>
      </div>
      <div>
        <label class="label" for="pf-notes">Notas</label>
        <textarea id="pf-notes" class="input" rows="2" name="notes" maxlength="4000" [(ngModel)]="form.notes"></textarea>
      </div>

      <app-error [message]="localError ?? error()" />

      <div class="flex justify-end gap-2">
        <button type="button" class="btn-outline" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : submitLabel() }}</button>
      </div>
    </form>
  `,
})
export class PatientForm implements OnInit {
  readonly patient = input<Patient | null>(null);
  readonly submitLabel = input('Guardar');
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<PatientFormValue>();
  readonly cancelled = output<void>();

  protected readonly today = new Date().toISOString().slice(0, 10);
  protected localError: string | null = null;
  protected form: { [K in (typeof OPTIONAL)[number] | 'firstName' | 'lastName' | 'birthDate']: string } & { sex: Sex } = {
    firstName: '',
    lastName: '',
    sex: 'FEMALE',
    birthDate: '',
    documentId: '',
    phone: '',
    email: '',
    occupation: '',
    address: '',
    reason: '',
    goal: '',
    notes: '',
  };

  ngOnInit() {
    const p = this.patient();
    if (!p) return;
    this.form.firstName = p.firstName;
    this.form.lastName = p.lastName;
    this.form.sex = p.sex;
    this.form.birthDate = p.birthDate.slice(0, 10);
    for (const key of OPTIONAL) this.form[key] = p[key] ?? '';
  }

  protected submit() {
    this.localError = null;
    const f = this.form;
    if (!f.firstName.trim() || !f.lastName.trim() || !f.birthDate) {
      this.localError = 'Completa nombre, apellido y fecha de nacimiento.';
      return;
    }
    const editing = !!this.patient();
    const value: PatientFormValue = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      sex: f.sex,
      birthDate: f.birthDate,
    };
    for (const key of OPTIONAL) {
      const v = (f[key] ?? '').trim();
      // Al crear se omiten los vacíos; al editar se envía null para poder borrarlos.
      if (v) value[key] = v;
      else if (editing) value[key] = null;
    }
    this.saved.emit(value);
  }
}
