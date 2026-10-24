import { Component, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatDate, formatDateTime } from '../../core/format';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner } from '../../shared/ui';

interface FoodItem {
  name: string;
  portion?: string;
  kcal: number;
}

interface AppActivity {
  access: {
    linked: boolean;
    email: string | null;
    lastLoginAt: string | null;
    inviteCode: string | null;
    inviteExpiresAt: string | null;
  };
  targetKcal: number | null;
  days: { date: string; kcal: number; choG: number; proG: number; fatG: number; entries: number; pctOfTarget: number | null }[];
  foodLogs: {
    id: string;
    date: string;
    mealName: string | null;
    description: string;
    items: FoodItem[];
    kcal: number;
    source: 'PHOTO' | 'MANUAL';
    confidence: string | null;
    createdAt: string;
  }[];
  weightLogs: { id: string; date: string; weightKg: number; note: string | null }[];
}

// Pestaña «App del paciente»: código para activar la app y lo que el paciente registra en ella.
@Component({
  selector: 'app-patient-app-tab',
  imports: [Icon, Empty, ErrorBanner],
  template: `
    <app-error class="mb-4 block" [message]="error()" />

    @if (data(); as d) {
      <section class="card mb-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-extrabold">Acceso a la app</h3>
            @if (d.access.linked) {
              <p class="mt-1 text-sm text-muted">
                Activa con <span class="font-semibold text-ink">{{ d.access.email }}</span>
                @if (d.access.lastLoginAt) {
                  · último ingreso {{ dateTime(d.access.lastLoginAt) }}
                }
              </p>
            } @else {
              <p class="mt-1 max-w-xl text-sm text-muted">
                Genera un código y compártelo con el paciente. Con él crea su cuenta en la app NutriPro, donde ve su plan aprobado,
                registra comidas con fotos y anota su peso.
              </p>
            }
          </div>
          @if (d.access.linked) {
            <button class="btn-danger btn-sm" [disabled]="busy()" (click)="revoke()">Quitar acceso</button>
          } @else {
            <button class="btn-primary" [disabled]="busy()" (click)="invite()">
              <app-icon name="link" size="sm" /> {{ d.access.inviteCode ? 'Generar código nuevo' : 'Generar código' }}
            </button>
          }
        </div>

        @if (!d.access.linked && d.access.inviteCode) {
          <div class="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-brand-50 p-5">
            <div>
              <p class="label">Código de invitación</p>
              <p class="font-mono text-3xl font-extrabold tracking-[0.3em] text-brand-700">{{ d.access.inviteCode }}</p>
              <p class="mt-1 text-xs text-muted">Vence el {{ date(d.access.inviteExpiresAt) }}. Solo se puede usar una vez.</p>
            </div>
            <button class="btn-outline btn-sm" (click)="copy(d.access.inviteCode)">
              <app-icon name="copy" size="sm" /> {{ copied() ? 'Copiado' : 'Copiar' }}
            </button>
          </div>
        }
      </section>

      @if (d.access.linked) {
        <div class="grid gap-6 xl:grid-cols-3">
          <section class="card xl:col-span-2">
            <h3 class="mb-1 text-lg font-extrabold">Comidas registradas</h3>
            <p class="mb-4 text-xs text-muted">Últimos 14 días. Las fotos son estimaciones de la IA hechas por el paciente; úsalas como referencia.</p>

            @if (d.days.length) {
              <div class="mb-5 flex gap-2 overflow-x-auto pb-1">
                @for (day of d.days; track day.date) {
                  <div class="min-w-28 rounded-xl border border-line px-3 py-2 text-center">
                    <p class="text-xs text-muted">{{ shortDate(day.date) }}</p>
                    <p class="text-lg font-extrabold">{{ day.kcal }}</p>
                    @if (day.pctOfTarget !== null) {
                      <p class="text-xs font-bold" [class]="day.pctOfTarget > 110 ? 'text-coral-700' : day.pctOfTarget < 70 ? 'text-amber-700' : 'text-brand-700'">
                        {{ day.pctOfTarget }} % de {{ d.targetKcal }}
                      </p>
                    }
                  </div>
                }
              </div>
            }

            @for (log of d.foodLogs; track log.id) {
              <div class="flex gap-3 border-t border-line py-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-xl" [class]="log.source === 'PHOTO' ? 'bg-sky-100 text-sky-700' : 'bg-mist text-muted'">
                  <app-icon [name]="log.source === 'PHOTO' ? 'eye' : 'edit'" size="sm" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ log.description }}</p>
                  <p class="text-xs text-muted">
                    {{ shortDate(log.date) }}{{ log.mealName ? ' · ' + log.mealName : '' }}
                    @if (log.confidence) {
                      · confianza {{ confidence[log.confidence] ?? log.confidence }}
                    }
                  </p>
                  <p class="mt-1 text-xs text-muted">{{ itemsText(log.items) }}</p>
                </div>
                <p class="shrink-0 font-bold">{{ log.kcal }} <span class="text-xs font-semibold text-muted">kcal</span></p>
              </div>
            } @empty {
              <app-empty emoji="📷" title="Sin comidas registradas" text="Cuando el paciente registre comidas en la app, aparecerán aquí." />
            }
          </section>

          <section class="card self-start">
            <h3 class="mb-3 text-lg font-extrabold">Pesos anotados</h3>
            @for (w of d.weightLogs; track w.id) {
              <div class="flex justify-between border-t border-line py-2 text-sm">
                <span class="text-muted">{{ shortDate(w.date) }}</span>
                <span class="font-bold">{{ w.weightKg }} kg</span>
              </div>
            } @empty {
              <p class="text-sm text-muted">El paciente aún no anota su peso.</p>
            }
          </section>
        </div>
      }
    } @else if (!error()) {
      <div class="card space-y-3"><div class="skeleton h-5 w-1/3"></div><div class="skeleton h-4 w-2/3"></div></div>
    }
  `,
})
export class PatientAppTab {
  private readonly api = inject(ApiService);
  readonly patientId = input.required<string>();

  protected readonly data = signal<AppActivity | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly dateTime = formatDateTime;
  protected readonly date = (iso: string | null) => formatDate(iso);
  protected readonly shortDate = (iso: string) => formatDate(iso, 'short');
  protected readonly confidence: Record<string, string> = { low: 'baja', medium: 'media', high: 'alta' };

  constructor() {
    effect(() => {
      this.patientId();
      void this.load();
    });
  }

  private async load() {
    this.error.set(null);
    try {
      this.data.set(await this.api.get<AppActivity>(`/patients/${this.patientId()}/app-activity`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar la actividad de la app.'));
    }
  }

  protected itemsText(items: FoodItem[]) {
    return (items ?? []).map((i) => `${i.name}${i.portion ? ` (${i.portion})` : ''} ${i.kcal} kcal`).join(' · ');
  }

  async invite() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.post(`/patients/${this.patientId()}/app-invite`);
      await this.load();
    } catch (err) {
      this.error.set(errorMessage(err, 'No se pudo generar el código.'));
    } finally {
      this.busy.set(false);
    }
  }

  async revoke() {
    if (!confirm('¿Quitar el acceso a la app? El paciente ya no podrá entrar; su expediente se conserva.')) return;
    this.busy.set(true);
    try {
      await this.api.delete(`/patients/${this.patientId()}/app-access`);
      await this.load();
    } catch (err) {
      this.error.set(errorMessage(err, 'No se pudo quitar el acceso.'));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código queda visible para copiarlo a mano.
    }
  }
}
