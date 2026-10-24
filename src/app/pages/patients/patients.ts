import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatDate, formatDateTime, fullName, sexLabels } from '../../core/format';
import { Patient, PatientListItem } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner, Modal, PageHeader } from '../../shared/ui';
import { PatientForm, PatientFormValue } from './patient-form';

@Component({
  selector: 'app-patients',
  imports: [FormsModule, PageHeader, Empty, ErrorBanner, Modal, Icon, PatientForm],
  template: `
    <app-page-header title="Pacientes" subtitle="Expedientes, mediciones y planes de cada paciente.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" /> Nuevo paciente</button>
    </app-page-header>

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label class="relative flex-1">
        <span class="sr-only">Buscar paciente</span>
        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft"><app-icon name="search" /></span>
        <input
          class="input pl-10"
          type="search"
          placeholder="Buscar por nombre, cédula, teléfono o correo"
          [ngModel]="search()"
          (ngModelChange)="onSearch($event)"
        />
      </label>
      <div class="flex rounded-xl bg-mist p-1 text-sm font-bold" role="group" aria-label="Filtrar pacientes">
        <button class="cursor-pointer rounded-lg px-3 py-1.5" [class]="!archived() ? 'bg-white text-ink shadow-soft' : 'text-muted'" (click)="setArchived(false)">
          Activos
        </button>
        <button class="cursor-pointer rounded-lg px-3 py-1.5" [class]="archived() ? 'bg-white text-ink shadow-soft' : 'text-muted'" (click)="setArchived(true)">
          Archivados
        </button>
      </div>
    </div>

    <app-error [message]="error()" />

    <div class="card mt-2 overflow-hidden p-0">
      @if (loading()) {
        <div class="space-y-3 p-5" aria-busy="true">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="skeleton h-10 w-full"></div>
          }
        </div>
      } @else if (patients().length === 0) {
        @if (search()) {
          <app-empty emoji="🔎" title="Sin resultados" [text]="'No encontramos pacientes que coincidan con «' + search() + '».'" />
        } @else if (archived()) {
          <app-empty emoji="🗂️" title="No hay pacientes archivados" text="Los pacientes que archives aparecerán aquí." />
        } @else {
          <app-empty title="Aún no tienes pacientes" text="Registra tu primer paciente para empezar su expediente.">
            <button class="btn-primary mt-2" (click)="openNew()"><app-icon name="plus" /> Nuevo paciente</button>
          </app-empty>
        }
      } @else {
        <!-- Tabla en pantallas medianas y grandes -->
        <div class="hidden overflow-x-auto md:block">
          <table class="table-base">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Edad</th>
                <th>Sexo</th>
                <th class="text-right">Último peso</th>
                <th class="text-right">IMC</th>
                <th>Última consulta</th>
                <th>Próxima cita</th>
                <th class="text-right">Plan vigente</th>
              </tr>
            </thead>
            <tbody>
              @for (p of patients(); track p.id) {
                <tr class="cursor-pointer hover:bg-canvas" (click)="open(p)" tabindex="0" (keydown.enter)="open(p)">
                  <td>
                    <p class="font-bold text-ink">{{ name(p) }}</p>
                    @if (p.goal) {
                      <p class="max-w-xs truncate text-xs text-muted">{{ p.goal }}</p>
                    }
                  </td>
                  <td>{{ p.age }} años</td>
                  <td>{{ sex[p.sex] }}</td>
                  <td class="text-right">{{ p.lastWeightKg !== null ? p.lastWeightKg + ' kg' : '—' }}</td>
                  <td class="text-right">{{ p.lastBmi ?? '—' }}</td>
                  <td>{{ date(p.lastConsultation) }}</td>
                  <td>
                    @if (p.nextAppointment) {
                      <span class="chip bg-sky-100 text-sky-700">{{ dateTime(p.nextAppointment) }}</span>
                    } @else {
                      <span class="text-soft">—</span>
                    }
                  </td>
                  <td class="text-right">{{ p.activePlanKcal ? p.activePlanKcal + ' kcal' : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Tarjetas en móvil -->
        <ul class="divide-y divide-line md:hidden">
          @for (p of patients(); track p.id) {
            <li>
              <button class="flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-left hover:bg-canvas" (click)="open(p)">
                <div class="min-w-0">
                  <p class="font-bold text-ink">{{ name(p) }}</p>
                  <p class="text-xs text-muted">{{ p.age }} años · {{ sex[p.sex] }}</p>
                  <p class="mt-1 text-xs text-muted">
                    Última consulta: {{ date(p.lastConsultation) }}
                    @if (p.nextAppointment) {
                      · Cita: {{ dateTime(p.nextAppointment) }}
                    }
                  </p>
                </div>
                <div class="shrink-0 text-right text-sm">
                  <p class="font-bold">{{ p.lastWeightKg !== null ? p.lastWeightKg + ' kg' : '—' }}</p>
                  <p class="text-xs text-muted">IMC {{ p.lastBmi ?? '—' }}</p>
                  @if (p.activePlanKcal) {
                    <p class="text-xs font-bold text-brand-700">{{ p.activePlanKcal }} kcal</p>
                  }
                </div>
              </button>
            </li>
          }
        </ul>
      }
    </div>

    @if (showNew()) {
      <app-modal title="Nuevo paciente" [wide]="true" (closed)="showNew.set(false)">
        <app-patient-form submitLabel="Crear paciente" [saving]="saving()" [error]="formError()" (saved)="create($event)" (cancelled)="showNew.set(false)" />
      </app-modal>
    }
  `,
})
export class Patients implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly sex = sexLabels;
  protected readonly date = (iso: string | null) => formatDate(iso, 'short');
  protected readonly dateTime = formatDateTime;
  protected readonly name = fullName;

  protected readonly patients = signal<PatientListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly archived = signal(false);

  protected readonly showNew = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private timer?: ReturnType<typeof setTimeout>;
  private requestId = 0;

  constructor() {
    void this.load();
    // El acceso rápido del inicio abre directamente el formulario de nuevo paciente.
    if (inject(ActivatedRoute).snapshot.queryParamMap.has('nuevo')) this.showNew.set(true);
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  // Espera a que se deje de escribir antes de consultar.
  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  protected setArchived(value: boolean) {
    if (this.archived() === value) return;
    this.archived.set(value);
    void this.load();
  }

  private async load() {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    const params = new URLSearchParams();
    if (this.search().trim()) params.set('search', this.search().trim());
    if (this.archived()) params.set('archived', 'true');
    const query = params.toString();
    try {
      const list = await this.api.get<PatientListItem[]>(`/patients${query ? '?' + query : ''}`);
      // Ignora respuestas viejas si ya se lanzó otra búsqueda.
      if (id === this.requestId) this.patients.set(list);
    } catch (err) {
      if (id === this.requestId) this.error.set(errorMessage(err, 'No pudimos cargar los pacientes.'));
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected open(p: PatientListItem) {
    void this.router.navigate(['/pacientes', p.id]);
  }

  protected openNew() {
    this.formError.set(null);
    this.showNew.set(true);
  }

  protected async create(value: PatientFormValue) {
    this.saving.set(true);
    this.formError.set(null);
    try {
      const patient = await this.api.post<Patient>('/patients', value);
      this.showNew.set(false);
      await this.router.navigate(['/pacientes', patient.id]);
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos crear el paciente.'));
    } finally {
      this.saving.set(false);
    }
  }
}
