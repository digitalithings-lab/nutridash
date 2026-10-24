import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  consultationTypeLabels,
  formatDate,
  formatDateTime,
  fullName,
  planStatusLabels,
  sexLabels,
} from '../../core/format';
import { MealPlanSummary, Patient } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, Empty, ErrorBanner, Modal, SkeletonCards, Tabs } from '../../shared/ui';
import { PatientAppTab } from './patient-app-tab';
import { EvolutionTab } from './patient-evolution';
import { PatientForm, PatientFormValue } from './patient-form';
import { LabsTab, MedicationsTab } from './patient-meds-labs';
import { BackgroundTab, DietHistoryTab } from './patient-records';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'antecedentes', label: 'Antecedentes' },
  { key: 'alimentacion', label: 'Historia alimentaria' },
  { key: 'medicacion', label: 'Medicación' },
  { key: 'laboratorios', label: 'Laboratorios' },
  { key: 'consultas', label: 'Consultas' },
  { key: 'planes', label: 'Planes' },
  { key: 'evolucion', label: 'Evolución' },
  { key: 'app', label: 'App del paciente' },
];

@Component({
  selector: 'app-patient-detail',
  imports: [
    RouterLink,
    Icon,
    Badge,
    Empty,
    ErrorBanner,
    Modal,
    SkeletonCards,
    Tabs,
    PatientForm,
    BackgroundTab,
    DietHistoryTab,
    MedicationsTab,
    LabsTab,
    EvolutionTab,
    PatientAppTab,
  ],
  template: `
    <a routerLink="/pacientes" class="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
      <app-icon name="chevronLeft" /> Pacientes
    </a>

    @if (loading()) {
      <div class="card mb-6 space-y-3">
        <div class="skeleton h-7 w-1/3"></div>
        <div class="skeleton h-4 w-1/2"></div>
      </div>
      <app-skeleton-cards [count]="3" />
    } @else if (patient(); as p) {
      <!-- Encabezado del expediente -->
      <header class="card mb-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex min-w-0 items-start gap-4">
            <span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl font-extrabold text-brand-700">
              {{ p.firstName[0] }}{{ p.lastName[0] }}
            </span>
            <div class="min-w-0">
              <h1 class="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight">
                {{ name(p) }}
                @if (p.archivedAt) {
                  <span class="chip bg-mist text-muted">Archivado</span>
                }
              </h1>
              <p class="text-sm text-muted">{{ p.age }} años · {{ sex[p.sex] }}</p>
              <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                @if (p.phone) {
                  <a class="inline-flex items-center gap-1 hover:text-ink" [href]="'tel:' + p.phone"><app-icon name="phone" /> {{ p.phone }}</a>
                }
                @if (p.email) {
                  <a class="hover:text-ink" [href]="'mailto:' + p.email">{{ p.email }}</a>
                }
              </p>
              @if (p.goal) {
                <p class="mt-2 text-sm"><span class="font-bold">Objetivo:</span> {{ p.goal }}</p>
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <a class="btn-primary" [routerLink]="['/pacientes', p.id, 'consultas', 'nueva']"><app-icon name="plus" /> Nueva consulta</a>
            <button class="btn-secondary" (click)="newPlan()" [disabled]="busy()"><app-icon name="clipboard" /> Nuevo plan</button>
            <button class="btn-outline" (click)="openEdit()"><app-icon name="edit" /> Editar</button>
            <button class="btn-outline" (click)="toggleArchive()" [disabled]="busy()">
              <app-icon [name]="p.archivedAt ? 'refresh' : 'archive'" /> {{ p.archivedAt ? 'Reactivar' : 'Archivar' }}
            </button>
            <button class="btn-danger" (click)="confirmDelete.set(true)" aria-label="Eliminar paciente"><app-icon name="trash" /></button>
          </div>
        </div>
        @if (alerts().length) {
          <div class="mt-4 flex flex-wrap gap-2">
            @for (a of alerts(); track a.label) {
              <span class="chip bg-coral-100 text-coral-700"><app-icon name="warning" /> {{ a.label }}: {{ a.text }}</span>
            }
          </div>
        }
      </header>

      <app-error [message]="error()" />
      <div class="mt-2"></div>

      <app-tabs [tabs]="tabs" [active]="activeTab()" (changed)="setTab($event)" />

      @switch (activeTab()) {
        @case ('resumen') {
          <div class="grid gap-4 lg:grid-cols-3">
            <section class="card lg:col-span-1">
              <h2 class="mb-3 text-lg font-extrabold">Datos generales</h2>
              <dl class="space-y-2 text-sm">
                @for (row of generalData(); track row.label) {
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted">{{ row.label }}</dt>
                    <dd class="text-right font-semibold">{{ row.value || '—' }}</dd>
                  </div>
                }
              </dl>
              @if (p.reason) {
                <p class="mt-4 text-xs font-bold tracking-wide text-muted uppercase">Motivo de consulta</p>
                <p class="text-sm">{{ p.reason }}</p>
              }
              @if (p.notes) {
                <p class="mt-4 text-xs font-bold tracking-wide text-muted uppercase">Notas</p>
                <p class="text-sm whitespace-pre-line">{{ p.notes }}</p>
              }
            </section>

            <div class="space-y-4 lg:col-span-2">
              <section class="card">
                <h2 class="mb-3 text-lg font-extrabold">Alertas</h2>
                @if (alerts().length) {
                  <ul class="space-y-2">
                    @for (a of alerts(); track a.label) {
                      <li class="flex items-start gap-2 rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-700">
                        <app-icon name="warning" />
                        <span><span class="font-bold">{{ a.label }}:</span> {{ a.text }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-sm text-muted">Sin alergias ni intolerancias registradas.</p>
                }
              </section>

              <div class="grid gap-4 md:grid-cols-2">
                <section class="card">
                  <div class="mb-3 flex items-center justify-between">
                    <h2 class="text-lg font-extrabold">Últimas consultas</h2>
                    @if (p.consultations.length > 3) {
                      <button class="btn-ghost btn-sm" (click)="setTab('consultas')">Ver todas</button>
                    }
                  </div>
                  @if (p.consultations.length) {
                    <ul class="divide-y divide-line">
                      @for (c of p.consultations.slice(0, 3); track c.id) {
                        <li>
                          <a class="flex items-center justify-between gap-3 py-2 hover:text-brand-700" [routerLink]="['/consultas', c.id]">
                            <span>
                              <span class="block font-bold">{{ date(c.date) }}</span>
                              <span class="text-xs text-muted">{{ types[c.type] }}</span>
                            </span>
                            <span class="text-sm font-semibold">{{ c.weightKg !== null ? c.weightKg + ' kg' : '' }}</span>
                          </a>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-sm text-muted">Sin consultas todavía.</p>
                  }
                </section>

                <section class="card">
                  <h2 class="mb-3 text-lg font-extrabold">Plan vigente</h2>
                  @if (currentPlan(); as plan) {
                    <a class="block rounded-xl border border-line p-3 hover:bg-canvas" [routerLink]="['/planes', plan.id]">
                      <div class="flex items-start justify-between gap-2">
                        <p class="font-bold">{{ plan.title }}</p>
                        <app-badge [badge]="planStatus[plan.status]" />
                      </div>
                      <p class="mt-1 text-2xl font-extrabold text-brand-700">{{ plan.targetKcal }} <span class="text-sm">kcal</span></p>
                      <p class="text-xs text-muted">
                        {{ plan.approvedAt ? 'Aprobado el ' + date(plan.approvedAt) : 'Creado el ' + date(plan.createdAt) }}
                      </p>
                    </a>
                  } @else {
                    <p class="text-sm text-muted">Sin plan alimentario.</p>
                    <button class="btn-secondary btn-sm mt-3" (click)="newPlan()" [disabled]="busy()"><app-icon name="plus" /> Crear plan</button>
                  }
                </section>
              </div>

              <section class="card">
                <h2 class="mb-3 text-lg font-extrabold">Próximas citas</h2>
                @if (upcoming().length) {
                  <ul class="divide-y divide-line">
                    @for (a of upcoming(); track a.id) {
                      <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <span class="block font-bold">{{ dateTime(a.startsAt) }}</span>
                          <span class="text-xs text-muted">{{ apptTypes[a.type] }} · {{ a.durationMinutes }} min</span>
                        </span>
                        <app-badge [badge]="apptStatus[a.status]" />
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-sm text-muted">Sin citas programadas. <a routerLink="/agenda" class="font-bold text-brand-700 hover:underline">Ir a la agenda</a></p>
                }
              </section>
            </div>
          </div>
        }
        @case ('antecedentes') {
          <app-background-tab [patient]="p" (changed)="reload()" />
        }
        @case ('alimentacion') {
          <app-diet-history-tab [patient]="p" (changed)="reload()" />
        }
        @case ('medicacion') {
          <app-medications-tab [patient]="p" (changed)="reload()" />
        }
        @case ('laboratorios') {
          <app-labs-tab [patient]="p" (changed)="reload()" />
        }
        @case ('consultas') {
          <div class="card">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-lg font-extrabold">Consultas</h2>
              <a class="btn-primary btn-sm" [routerLink]="['/pacientes', p.id, 'consultas', 'nueva']"><app-icon name="plus" /> Nueva consulta</a>
            </div>
            @if (p.consultations.length === 0) {
              <app-empty emoji="🩺" title="Sin consultas" text="Registra la evaluación inicial para empezar a medir la evolución." />
            } @else {
              <div class="-mx-5 overflow-x-auto">
                <table class="table-base">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th class="text-right">Peso</th>
                      <th>Diagnóstico</th>
                      <th class="text-right">Adherencia</th>
                      <th><span class="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of p.consultations; track c.id) {
                      <tr class="cursor-pointer hover:bg-canvas" (click)="go(['/consultas', c.id])">
                        <td class="font-bold whitespace-nowrap text-brand-700">{{ date(c.date) }}</td>
                        <td class="whitespace-nowrap">{{ types[c.type] }}</td>
                        <td class="text-right whitespace-nowrap">{{ c.weightKg !== null ? c.weightKg + ' kg' : '—' }}</td>
                        <td class="max-w-sm truncate text-muted">{{ c.diagnosis ?? '—' }}</td>
                        <td class="text-right">{{ c.adherencePct !== null ? c.adherencePct + ' %' : '—' }}</td>
                        <td class="text-right">
                          <button class="btn-ghost btn-sm" (click)="$event.stopPropagation(); pdf('/reports/consultations/' + c.id + '/evaluation.pdf')">
                            <app-icon name="document" /> PDF
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
        @case ('planes') {
          <div class="card">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-lg font-extrabold">Planes alimentarios</h2>
              <button class="btn-primary btn-sm" (click)="newPlan()" [disabled]="busy()"><app-icon name="plus" /> Nuevo plan</button>
            </div>
            @if (p.mealPlans.length === 0) {
              <app-empty emoji="🍽️" title="Sin planes" text="Crea un plan alimentario a partir de la última consulta." />
            } @else {
              <ul class="divide-y divide-line">
                @for (plan of p.mealPlans; track plan.id) {
                  <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <a class="min-w-0 flex-1" [routerLink]="['/planes', plan.id]">
                      <p class="flex flex-wrap items-center gap-2 font-bold hover:text-brand-700">
                        {{ plan.title }} <app-badge [badge]="planStatus[plan.status]" />
                      </p>
                      <p class="text-sm text-muted">
                        {{ plan.targetKcal }} kcal · Creado el {{ date(plan.createdAt) }}
                        @if (plan.approvedAt) {
                          · Aprobado el {{ date(plan.approvedAt) }}
                        }
                      </p>
                    </a>
                    <div class="flex gap-1">
                      <button class="btn-ghost btn-sm" (click)="duplicate(plan)" [disabled]="busy()"><app-icon name="copy" /> Duplicar</button>
                      <button class="btn-ghost btn-sm" (click)="pdf('/reports/meal-plans/' + plan.id + '/plan.pdf')"><app-icon name="document" /> PDF</button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        }
        @case ('evolucion') {
          <app-evolution-tab [patientId]="p.id" />
        }
        @case ('app') {
          <app-patient-app-tab [patientId]="p.id" />
        }
      }

      @if (editing()) {
        <app-modal title="Editar datos del paciente" [wide]="true" (closed)="editing.set(false)">
          <app-patient-form [patient]="p" [saving]="saving()" [error]="formError()" (saved)="saveEdit($event)" (cancelled)="editing.set(false)" />
        </app-modal>
      }

      @if (confirmDelete()) {
        <app-modal title="Eliminar paciente" (closed)="confirmDelete.set(false)">
          <div class="space-y-4">
            <div class="flex items-start gap-3 rounded-xl bg-danger-100 p-4 text-sm text-danger-500">
              <app-icon name="warning" />
              <p>
                Se eliminará <strong>{{ name(p) }}</strong> con todo su expediente: {{ p.consultations.length }} consultas,
                {{ p.mealPlans.length }} planes, laboratorios, medicación y citas. Esta acción no se puede deshacer.
              </p>
            </div>
            @if (!p.archivedAt) {
              <p class="text-sm text-muted">Si solo quieres sacarlo de la lista de activos, es mejor archivarlo.</p>
            }
            <app-error [message]="formError()" />
            <div class="flex flex-wrap justify-end gap-2">
              <button class="btn-outline" (click)="confirmDelete.set(false)">Cancelar</button>
              @if (!p.archivedAt) {
                <button class="btn-secondary" (click)="confirmDelete.set(false); toggleArchive()">Archivar en su lugar</button>
              }
              <button class="btn-danger" (click)="remove()" [disabled]="busy()"><app-icon name="trash" /> Eliminar definitivamente</button>
            </div>
          </div>
        </app-modal>
      }
    } @else {
      <app-error [message]="error()" />
    }
  `,
})
export class PatientDetail {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly patientId = input.required<string>();
  // Pestaña activa en la URL (?tab=), para volver al mismo lugar.
  readonly tab = input<string>();

  protected readonly tabs = TABS;
  protected readonly sex = sexLabels;
  protected readonly types = consultationTypeLabels;
  protected readonly planStatus = planStatusLabels;
  protected readonly apptStatus = appointmentStatusLabels;
  protected readonly apptTypes = appointmentTypeLabels;
  protected readonly name = fullName;
  protected readonly date = (iso: string | null) => formatDate(iso);
  protected readonly dateTime = formatDateTime;

  protected readonly patient = signal<Patient | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly activeTab = computed(() => {
    const t = this.tab();
    return TABS.some((x) => x.key === t) ? t! : 'resumen';
  });

  protected readonly alerts = computed(() => {
    const bg = this.patient()?.background;
    const out: { label: string; text: string }[] = [];
    if (bg?.allergies?.trim()) out.push({ label: 'Alergias', text: bg.allergies });
    if (bg?.intolerances?.trim()) out.push({ label: 'Intolerancias', text: bg.intolerances });
    return out;
  });

  protected readonly generalData = computed(() => {
    const p = this.patient();
    if (!p) return [];
    return [
      { label: 'Nacimiento', value: formatDate(p.birthDate) },
      { label: 'Documento', value: p.documentId },
      { label: 'Teléfono', value: p.phone },
      { label: 'Correo', value: p.email },
      { label: 'Ocupación', value: p.occupation },
      { label: 'Dirección', value: p.address },
      { label: 'Paciente desde', value: formatDate(p.createdAt) },
    ];
  });

  // Plan aprobado más reciente; si no hay, el último borrador.
  protected readonly currentPlan = computed<MealPlanSummary | null>(() => {
    const plans = this.patient()?.mealPlans ?? [];
    return plans.find((p) => p.status === 'APPROVED') ?? plans.find((p) => p.status === 'DRAFT') ?? null;
  });

  protected readonly upcoming = computed(() => {
    const now = Date.now();
    return (this.patient()?.appointments ?? []).filter((a) => a.status === 'SCHEDULED' && new Date(a.startsAt).getTime() >= now - 60 * 60 * 1000);
  });

  constructor() {
    // Recarga al cambiar de paciente sin salir de la ruta.
    effect(() => {
      const id = this.patientId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.patient.set(await this.api.get<Patient>(`/patients/${id}`));
    } catch (err) {
      this.patient.set(null);
      this.error.set(errorMessage(err, 'No pudimos cargar el expediente.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Recarga sin esqueleto para no perder el estado de la pestaña.
  protected async reload() {
    try {
      this.patient.set(await this.api.get<Patient>(`/patients/${this.patientId()}`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos actualizar el expediente.'));
    }
  }

  protected setTab(key: string) {
    void this.router.navigate([], { queryParams: { tab: key === 'resumen' ? null : key }, replaceUrl: true });
  }

  protected go(commands: string[]) {
    void this.router.navigate(commands);
  }

  protected async newPlan() {
    await this.run(async () => {
      const plan = await this.api.post<{ id: string }>(`/patients/${this.patientId()}/meal-plans`, {});
      await this.router.navigate(['/planes', plan.id]);
    }, 'No pudimos crear el plan.');
  }

  protected async duplicate(plan: MealPlanSummary) {
    await this.run(async () => {
      const copy = await this.api.post<{ id: string }>(`/meal-plans/${plan.id}/duplicate`, {});
      await this.router.navigate(['/planes', copy.id]);
    }, 'No pudimos duplicar el plan.');
  }

  protected async toggleArchive() {
    const p = this.patient();
    if (!p) return;
    await this.run(async () => {
      await this.api.post(`/patients/${p.id}/${p.archivedAt ? 'restore' : 'archive'}`, {});
      await this.reload();
    }, p.archivedAt ? 'No pudimos reactivar al paciente.' : 'No pudimos archivar al paciente.');
  }

  protected async pdf(path: string) {
    this.error.set(null);
    try {
      await this.api.openPdf(path);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos generar el PDF.'));
    }
  }

  protected openEdit() {
    this.formError.set(null);
    this.editing.set(true);
  }

  protected async saveEdit(value: PatientFormValue) {
    this.saving.set(true);
    this.formError.set(null);
    try {
      await this.api.patch(`/patients/${this.patientId()}`, value);
      this.editing.set(false);
      await this.reload();
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar los cambios.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove() {
    this.busy.set(true);
    this.formError.set(null);
    try {
      await this.api.delete(`/patients/${this.patientId()}`);
      await this.router.navigateByUrl('/pacientes');
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos eliminar al paciente.'));
    } finally {
      this.busy.set(false);
    }
  }

  // Ejecuta una acción mostrando el error en el banner del expediente.
  private async run(action: () => Promise<void>, fallback: string) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
    } finally {
      this.busy.set(false);
    }
  }
}
