import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import { appointmentStatusLabels, appointmentTypeLabels, formatTime, fullName, MONTHS, todayIso } from '../core/format';
import { Appointment, AppointmentStatus, AppointmentType, PatientListItem, PatientRef } from '../core/types';
import { Icon } from '../shared/icon';
import { Badge, Empty, ErrorBanner, Modal, PageHeader } from '../shared/ui';

interface DayCell {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  count: number;
}

const WEEK_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// YYYY-MM-DD en hora local.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeKey(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-agenda',
  imports: [FormsModule, RouterLink, Icon, Badge, Empty, ErrorBanner, Modal, PageHeader],
  template: `
    <app-page-header title="Agenda" subtitle="Tus citas del mes y del día.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" size="sm" /> Nueva cita</button>
    </app-page-header>

    <app-error [message]="error()" />

    <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <!-- Calendario mensual -->
      <section class="card">
        <div class="mb-4 flex items-center justify-between gap-2">
          <button class="btn-ghost btn-sm" (click)="moveMonth(-1)" aria-label="Mes anterior"><app-icon name="chevronLeft" size="sm" /></button>
          <div class="text-center">
            <h2 class="text-lg font-extrabold">{{ monthLabel() }}</h2>
            <button class="text-xs font-bold text-brand-700 hover:underline" (click)="goToday()">Ir a hoy</button>
          </div>
          <button class="btn-ghost btn-sm" (click)="moveMonth(1)" aria-label="Mes siguiente"><app-icon name="chevronRight" size="sm" /></button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-bold tracking-wide text-muted uppercase">
          @for (w of weekHeaders; track w) {
            <div class="py-1">{{ w }}</div>
          }
        </div>
        <div class="grid grid-cols-7 gap-1" [class.opacity-60]="loading()">
          @for (cell of cells(); track cell.key) {
            <button
              class="relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-xl text-sm font-bold transition sm:aspect-auto sm:h-16"
              [class]="cellClass(cell)"
              (click)="select(cell)"
              [attr.aria-label]="cell.key + (cell.count ? ', ' + cell.count + ' citas' : '')"
            >
              <span>{{ cell.day }}</span>
              @if (cell.count) {
                <span class="mt-0.5 flex items-center gap-0.5">
                  @if (cell.count <= 3) {
                    @for (d of dots(cell.count); track d) {
                      <span class="size-1.5 rounded-full" [class]="selected() === cell.key ? 'bg-white' : 'bg-brand-500'"></span>
                    }
                  } @else {
                    <span class="text-[10px]" [class]="selected() === cell.key ? 'text-white' : 'text-brand-700'">{{ cell.count }}</span>
                  }
                </span>
              }
            </button>
          }
        </div>
      </section>

      <!-- Citas del día -->
      <section class="card">
        <div class="mb-4 flex items-center justify-between gap-2">
          <h2 class="text-lg font-extrabold first-letter:uppercase">{{ selectedLabel() }}</h2>
          <button class="btn-secondary btn-sm" (click)="openNew(selected())"><app-icon name="plus" size="sm" /> Agendar</button>
        </div>
        @if (loading() && !dayAppointments().length) {
          <div class="space-y-3">
            <div class="skeleton h-16"></div>
            <div class="skeleton h-16"></div>
          </div>
        } @else if (!dayAppointments().length) {
          <app-empty emoji="📅" title="Sin citas este día" text="Agenda una cita para este día con el botón de arriba." />
        } @else {
          <ul class="space-y-3">
            @for (a of dayAppointments(); track a.id) {
              <li class="rounded-xl border border-line p-3">
                <div class="flex items-start gap-3">
                  <div class="w-14 shrink-0 text-center">
                    <p class="text-base font-extrabold text-ink">{{ time(a.startsAt) }}</p>
                    <p class="text-xs text-muted">{{ a.durationMinutes }} min</p>
                  </div>
                  <div class="min-w-0 flex-1">
                    <a class="font-bold text-ink hover:text-brand-700 hover:underline" [routerLink]="['/pacientes', a.patientId]">{{ name(a.patient) }}</a>
                    <div class="mt-1 flex flex-wrap items-center gap-1.5">
                      <span class="chip bg-mist text-muted">{{ typeLabels[a.type] }}</span>
                      <app-badge [badge]="statusLabels[a.status]" />
                    </div>
                    @if (a.notes) {
                      <p class="mt-1.5 text-sm text-muted">{{ a.notes }}</p>
                    }
                    @if (a.responseNote) {
                      <p class="mt-1 text-xs text-muted">Tu respuesta: {{ a.responseNote }}</p>
                    }
                  </div>
                </div>
                @if (a.status === 'REQUESTED') {
                  <div class="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2">
                    <span class="flex-1 text-xs font-semibold text-amber-700">El paciente pidió esta cita desde la app</span>
                    <button class="btn-primary btn-sm" [disabled]="busy() === a.id" (click)="respond(a, 'SCHEDULED')"><app-icon name="check" size="sm" /> Aceptar</button>
                    <button class="btn-outline btn-sm" [disabled]="busy() === a.id" (click)="respond(a, 'REJECTED')">Rechazar</button>
                  </div>
                } @else if (a.status !== 'REJECTED') {
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <button class="btn-primary btn-sm" (click)="registerConsultation(a)">
                    <app-icon name="clipboard" size="sm" /> {{ a.consultation ? 'Ver consulta' : 'Registrar consulta' }}
                  </button>
                  @if (a.status !== 'COMPLETED') {
                    <button class="btn-outline btn-sm" [disabled]="busy() === a.id" (click)="setStatus(a, 'COMPLETED')">Atendida</button>
                  }
                  @if (a.status === 'SCHEDULED') {
                    <button class="btn-outline btn-sm" [disabled]="busy() === a.id" (click)="setStatus(a, 'NO_SHOW')">No asistió</button>
                    <button class="btn-outline btn-sm" [disabled]="busy() === a.id" (click)="setStatus(a, 'CANCELLED')">Cancelar</button>
                  } @else {
                    <button class="btn-ghost btn-sm" [disabled]="busy() === a.id" (click)="setStatus(a, 'SCHEDULED')">Reabrir</button>
                  }
                  <button class="btn-ghost btn-sm" (click)="openEdit(a)" aria-label="Editar o reprogramar"><app-icon name="edit" size="sm" /> Editar</button>
                  <button class="btn-ghost btn-sm text-danger-500" [disabled]="busy() === a.id" (click)="remove(a)" aria-label="Borrar cita">
                    <app-icon name="trash" size="sm" />
                  </button>
                </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    </div>

    @if (form(); as f) {
      <app-modal [title]="f.id ? 'Editar cita' : 'Nueva cita'" (closed)="form.set(null)">
        <form class="space-y-4" (ngSubmit)="save()">
          <div>
            <label class="label" for="ap-patient">Paciente</label>
            @if (f.patient) {
              <div class="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
                <span class="font-bold">{{ name(f.patient) }}</span>
                @if (!f.id) {
                  <button type="button" class="text-xs font-bold text-brand-700 hover:underline" (click)="clearPatient()">Cambiar</button>
                }
              </div>
            } @else {
              <input
                id="ap-patient"
                class="input"
                name="patientSearch"
                placeholder="Busca por nombre, cédula o correo"
                autocomplete="off"
                [(ngModel)]="patientSearch"
                (ngModelChange)="searchPatients()"
              />
              @if (searching()) {
                <p class="mt-2 text-xs text-muted">Buscando…</p>
              } @else if (patientResults().length) {
                <ul class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line">
                  @for (p of patientResults(); track p.id) {
                    <li>
                      <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-mist" (click)="pickPatient(p)">
                        <span class="font-bold">{{ name(p) }}</span>
                        <span class="text-muted"> · {{ p.age }} años</span>
                      </button>
                    </li>
                  }
                </ul>
              } @else if (patientSearch.trim()) {
                <p class="mt-2 text-xs text-muted">Sin resultados.</p>
              }
            }
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="label" for="ap-date">Fecha</label>
              <input id="ap-date" class="input" type="date" name="date" [(ngModel)]="f.date" required />
            </div>
            <div>
              <label class="label" for="ap-time">Hora</label>
              <input id="ap-time" class="input" type="time" name="time" [(ngModel)]="f.time" required />
            </div>
            <div>
              <label class="label" for="ap-duration">Duración (min)</label>
              <input id="ap-duration" class="input" type="number" min="10" max="240" step="5" name="duration" [(ngModel)]="f.durationMinutes" />
            </div>
          </div>
          <div>
            <label class="label" for="ap-type">Tipo</label>
            <select id="ap-type" class="input" name="type" [(ngModel)]="f.type">
              @for (t of types; track t) {
                <option [value]="t">{{ typeLabels[t] }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label" for="ap-notes">Notas</label>
            <textarea id="ap-notes" class="input" rows="3" name="notes" maxlength="1000" [(ngModel)]="f.notes"></textarea>
          </div>
          <app-error [message]="formError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="form.set(null)">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cita' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class Agenda implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly weekHeaders = WEEK_HEADERS;
  protected readonly typeLabels = appointmentTypeLabels;
  protected readonly statusLabels = appointmentStatusLabels;
  protected readonly types = Object.keys(appointmentTypeLabels) as AppointmentType[];
  protected readonly time = formatTime;
  protected readonly name = fullName;

  protected readonly year = signal(new Date().getFullYear());
  protected readonly month = signal(new Date().getMonth());
  protected readonly selected = signal(todayIso());
  protected readonly appointments = signal<Appointment[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly form = signal<{
    id: string | null;
    patient: PatientRef | null;
    date: string;
    time: string;
    durationMinutes: number;
    type: AppointmentType;
    notes: string;
  } | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected patientSearch = '';
  protected readonly patientResults = signal<PatientListItem[]>([]);
  protected readonly searching = signal(false);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly monthLabel = computed(() => `${MONTHS[this.month()]} ${this.year()}`);

  // Primer lunes visible de la cuadrícula.
  private readonly gridStart = computed(() => {
    const first = new Date(this.year(), this.month(), 1);
    const offset = (first.getDay() + 6) % 7;
    return new Date(this.year(), this.month(), 1 - offset);
  });

  private readonly gridDays = computed(() => {
    const last = new Date(this.year(), this.month() + 1, 0);
    const start = this.gridStart();
    const total = Math.ceil(((last.getTime() - start.getTime()) / 86_400_000 + 1) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  });

  private readonly byDay = computed(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of this.appointments()) {
      const key = dayKey(new Date(a.startsAt));
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  });

  protected readonly cells = computed<DayCell[]>(() => {
    const today = todayIso();
    const counts = this.byDay();
    return this.gridDays().map((d) => {
      const key = dayKey(d);
      return {
        key,
        day: d.getDate(),
        inMonth: d.getMonth() === this.month(),
        isToday: key === today,
        // Las canceladas no cuentan en el calendario.
        count: (counts.get(key) ?? []).filter((a) => a.status !== 'CANCELLED' && a.status !== 'REJECTED').length,
      };
    });
  });

  protected readonly dayAppointments = computed(() => this.byDay().get(this.selected()) ?? []);

  protected readonly selectedLabel = computed(() =>
    new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${this.selected()}T12:00:00`)),
  );

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    const days = this.gridDays();
    const from = days[0];
    const last = days[days.length - 1];
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await this.api.get<Appointment[]>(
        `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      this.appointments.set(list);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar la agenda.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected moveMonth(delta: number) {
    const d = new Date(this.year(), this.month() + delta, 1);
    this.year.set(d.getFullYear());
    this.month.set(d.getMonth());
    this.selected.set(dayKey(d));
    void this.load();
  }

  protected goToday() {
    const now = new Date();
    const changed = now.getFullYear() !== this.year() || now.getMonth() !== this.month();
    this.year.set(now.getFullYear());
    this.month.set(now.getMonth());
    this.selected.set(todayIso());
    if (changed) void this.load();
  }

  protected select(cell: DayCell) {
    this.selected.set(cell.key);
    if (!cell.inMonth) {
      const d = new Date(`${cell.key}T12:00:00`);
      this.year.set(d.getFullYear());
      this.month.set(d.getMonth());
      void this.load();
    }
  }

  protected cellClass(cell: DayCell): string {
    if (this.selected() === cell.key) return 'bg-brand-600 text-white shadow-soft';
    const base = cell.inMonth ? 'text-ink hover:bg-mist' : 'text-soft hover:bg-mist';
    return cell.isToday ? `${base} ring-2 ring-brand-500 ring-inset text-brand-700` : base;
  }

  protected dots(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  // ─── Formulario ───

  protected openNew(date = this.selected()) {
    this.formError.set(null);
    this.patientSearch = '';
    this.patientResults.set([]);
    this.form.set({ id: null, patient: null, date, time: '09:00', durationMinutes: 45, type: 'CONTROL', notes: '' });
  }

  protected openEdit(a: Appointment) {
    const d = new Date(a.startsAt);
    this.formError.set(null);
    this.form.set({
      id: a.id,
      patient: a.patient,
      date: dayKey(d),
      time: timeKey(d),
      durationMinutes: a.durationMinutes,
      type: a.type,
      notes: a.notes ?? '',
    });
  }

  protected searchPatients() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = this.patientSearch.trim();
    if (!term) {
      this.patientResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(async () => {
      this.searching.set(true);
      try {
        const list = await this.api.get<PatientListItem[]>(`/patients?search=${encodeURIComponent(term)}`);
        this.patientResults.set(list.slice(0, 20));
      } catch {
        this.patientResults.set([]);
      } finally {
        this.searching.set(false);
      }
    }, 250);
  }

  protected pickPatient(p: PatientListItem) {
    this.form.update((f) => (f ? { ...f, patient: { id: p.id, firstName: p.firstName, lastName: p.lastName } } : f));
  }

  protected clearPatient() {
    this.form.update((f) => (f ? { ...f, patient: null } : f));
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.formError.set(null);
    if (!f.patient) return this.formError.set('Elige un paciente.');
    if (!f.date || !f.time) return this.formError.set('Indica la fecha y la hora.');
    const duration = Number(f.durationMinutes) || 45;
    if (duration < 10 || duration > 240) return this.formError.set('La duración debe estar entre 10 y 240 minutos.');
    const [y, m, d] = f.date.split('-').map(Number);
    const [hh, mm] = f.time.split(':').map(Number);
    const startsAt = new Date(y, m - 1, d, hh, mm).toISOString();
    const notes = f.notes.trim();

    this.saving.set(true);
    try {
      if (f.id) {
        await this.api.patch(`/appointments/${f.id}`, { startsAt, durationMinutes: duration, type: f.type, notes });
      } else {
        await this.api.post('/appointments', {
          patientId: f.patient.id,
          startsAt,
          durationMinutes: duration,
          type: f.type,
          ...(notes ? { notes } : {}),
        });
      }
      this.form.set(null);
      // Lleva el calendario al día de la cita.
      this.year.set(y);
      this.month.set(m - 1);
      this.selected.set(f.date);
      await this.load();
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar la cita.'));
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Acciones ───

  // Respuesta a una solicitud de la app, con un mensaje opcional para el paciente.
  protected respond(a: Appointment, status: 'SCHEDULED' | 'REJECTED') {
    const note = prompt(
      status === 'SCHEDULED' ? 'Mensaje para el paciente (opcional):' : 'Motivo del rechazo para el paciente (opcional):',
      '',
    );
    if (note === null) return;
    void this.setStatus(a, status, note.trim() || undefined);
  }

  protected async setStatus(a: Appointment, status: AppointmentStatus, responseNote?: string) {
    this.busy.set(a.id);
    this.error.set(null);
    try {
      await this.api.patch(`/appointments/${a.id}`, { status, ...(responseNote ? { responseNote } : {}) });
      this.appointments.update((list) => list.map((x) => (x.id === a.id ? { ...x, status, responseNote: responseNote ?? x.responseNote } : x)));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos actualizar la cita.'));
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(a: Appointment) {
    if (!confirm(`¿Borrar la cita de ${fullName(a.patient)}?`)) return;
    this.busy.set(a.id);
    this.error.set(null);
    try {
      await this.api.delete(`/appointments/${a.id}`);
      this.appointments.update((list) => list.filter((x) => x.id !== a.id));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos borrar la cita.'));
    } finally {
      this.busy.set(null);
    }
  }

  protected registerConsultation(a: Appointment) {
    if (a.consultation) void this.router.navigate(['/consultas', a.consultation.id]);
    else void this.router.navigate(['/pacientes', a.patientId, 'consultas', 'nueva'], { queryParams: { appointmentId: a.id } });
  }
}
