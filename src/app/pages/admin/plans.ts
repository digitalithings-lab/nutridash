import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatMoney } from '../../core/format';
import { SubscriptionPlan } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner, Modal, PageHeader, SkeletonCards } from '../../shared/ui';

interface PlanModel {
  id: string | null;
  code: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  maxPatients: number | null;
  features: string;
  active: boolean;
  sortOrder: number;
}

@Component({
  selector: 'app-admin-plans',
  imports: [FormsModule, Icon, Empty, ErrorBanner, Modal, PageHeader, SkeletonCards],
  template: `
    <app-page-header title="Planes" subtitle="Planes comerciales que ven las nutricionistas.">
      <button class="btn-primary" (click)="open(null)"><app-icon name="plus" size="sm" /> Nuevo plan</button>
    </app-page-header>
    <app-error [message]="error()" />

    @if (loading()) {
      <app-skeleton-cards [count]="3" />
    } @else if (!plans().length) {
      <div class="card"><app-empty emoji="💳" title="Sin planes" text="Crea el primer plan comercial." /></div>
    } @else {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (p of plans(); track p.id) {
          <article class="card flex flex-col" [class.opacity-60]="!p.active">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-xs font-bold tracking-wide text-muted">{{ p.code }}</p>
                <h2 class="text-lg font-extrabold">{{ p.name }}</h2>
              </div>
              <span class="chip" [class]="p.active ? 'bg-brand-100 text-brand-700' : 'bg-mist text-muted'">{{ p.active ? 'Activo' : 'Inactivo' }}</span>
            </div>
            <p class="mt-2 text-2xl font-extrabold text-brand-700">{{ money(p.priceCents, p.currency) }}<span class="text-sm font-bold text-muted"> / mes</span></p>
            @if (p.description) {
              <p class="mt-1 text-sm text-muted">{{ p.description }}</p>
            }
            <p class="mt-2 text-sm font-bold">{{ p.maxPatients ? 'Hasta ' + p.maxPatients + ' pacientes' : 'Pacientes ilimitados' }}</p>
            <ul class="mt-2 space-y-1 text-sm">
              @for (feat of p.features; track $index) {
                <li class="flex gap-2"><span class="text-brand-600">✓</span>{{ feat }}</li>
              }
            </ul>
            <div class="mt-auto flex items-center justify-between gap-2 pt-4">
              <span class="text-xs text-muted">{{ p._count?.subscriptions ?? 0 }} suscripciones · orden {{ p.sortOrder }}</span>
              <button class="btn-outline btn-sm" (click)="open(p)"><app-icon name="edit" size="sm" /> Editar</button>
            </div>
          </article>
        }
      </div>
    }

    @if (form(); as f) {
      <app-modal [title]="f.id ? 'Editar plan' : 'Nuevo plan'" (closed)="form.set(null)">
        <form class="space-y-4" (ngSubmit)="save()">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="pl-code">Código</label>
              <input id="pl-code" class="input uppercase" name="code" maxlength="30" placeholder="PROFESIONAL" [(ngModel)]="f.code" required />
            </div>
            <div>
              <label class="label" for="pl-name">Nombre</label>
              <input id="pl-name" class="input" name="name" maxlength="60" [(ngModel)]="f.name" required />
            </div>
          </div>
          <div>
            <label class="label" for="pl-desc">Descripción</label>
            <input id="pl-desc" class="input" name="description" maxlength="300" [(ngModel)]="f.description" />
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="label" for="pl-price">Precio mensual ($)</label>
              <input id="pl-price" class="input" type="number" min="0" step="0.01" name="price" [(ngModel)]="f.price" required />
            </div>
            <div>
              <label class="label" for="pl-currency">Moneda</label>
              <input id="pl-currency" class="input uppercase" name="currency" maxlength="3" [(ngModel)]="f.currency" />
            </div>
            <div>
              <label class="label" for="pl-max">Máx. pacientes</label>
              <input id="pl-max" class="input" type="number" min="1" step="1" name="maxPatients" placeholder="Ilimitado" [(ngModel)]="f.maxPatients" />
            </div>
          </div>
          <div>
            <label class="label" for="pl-feat">Características (una por línea)</label>
            <textarea id="pl-feat" class="input" rows="5" name="features" [(ngModel)]="f.features"></textarea>
          </div>
          <div class="grid items-end gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="pl-order">Orden</label>
              <input id="pl-order" class="input" type="number" step="1" name="sortOrder" [(ngModel)]="f.sortOrder" />
            </div>
            <label class="flex items-center gap-2 pb-2.5 text-sm font-bold">
              <input type="checkbox" class="size-4 accent-brand-600" name="active" [(ngModel)]="f.active" /> Visible para nuevas altas
            </label>
          </div>
          <app-error [message]="formError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="form.set(null)">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar plan' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class AdminPlans implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly money = formatMoney;

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly form = signal<PlanModel | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  ngOnInit() {
    void this.load();
  }

  private async load() {
    try {
      this.plans.set(await this.api.get<SubscriptionPlan[]>('/admin/plans'));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar los planes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected open(p: SubscriptionPlan | null) {
    this.formError.set(null);
    this.form.set(
      p
        ? {
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description ?? '',
            price: p.priceCents / 100,
            currency: p.currency,
            maxPatients: p.maxPatients,
            features: p.features.join('\n'),
            active: p.active,
            sortOrder: p.sortOrder,
          }
        : {
            id: null,
            code: '',
            name: '',
            description: '',
            price: null,
            currency: 'USD',
            maxPatients: null,
            features: '',
            active: true,
            sortOrder: (this.plans().at(-1)?.sortOrder ?? 0) + 1,
          },
    );
  }

  protected async save() {
    const f = this.form();
    if (!f) return;
    this.formError.set(null);
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,30}$/.test(code)) return this.formError.set('El código debe ir en mayúsculas, sin espacios (letras, números o _).');
    if (f.name.trim().length < 2) return this.formError.set('Escribe el nombre del plan.');
    const price = Number(f.price);
    if (f.price === null || String(f.price) === '' || Number.isNaN(price) || price < 0) return this.formError.set('Indica un precio válido.');
    const currency = (f.currency || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return this.formError.set('La moneda debe tener 3 letras (p. ej., USD).');
    const max = f.maxPatients === null || String(f.maxPatients) === '' ? null : Math.round(Number(f.maxPatients));
    if (max !== null && (Number.isNaN(max) || max < 1)) return this.formError.set('El máximo de pacientes debe ser 1 o más, o vacío para ilimitado.');
    const features = f.features
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (features.length > 20) return this.formError.set('Máximo 20 características.');

    const body = {
      code,
      name: f.name.trim(),
      description: f.description.trim() || null,
      priceCents: Math.round(price * 100),
      currency,
      maxPatients: max,
      features,
      active: f.active,
      sortOrder: Math.round(Number(f.sortOrder) || 0),
    };
    this.saving.set(true);
    try {
      if (f.id) await this.api.patch(`/admin/plans/${f.id}`, body);
      else await this.api.post('/admin/plans', body);
      this.form.set(null);
      await this.load();
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar el plan.'));
    } finally {
      this.saving.set(false);
    }
  }
}
