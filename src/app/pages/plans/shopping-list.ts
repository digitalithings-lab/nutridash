import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { servings as fmtServings } from '../../core/format';
import { FoodThumb, GiBadge } from '../../shared/food';
import { Icon } from '../../shared/icon';
import { ErrorBanner, Modal } from '../../shared/ui';

interface ShoppingItem {
  foodId: string | null;
  name: string;
  brand: string | null;
  imageId: string | null;
  servings: number;
  portionText: string | null;
  grams: number | null;
  glycemicIndex: number | null;
}

interface ShoppingExtra {
  name: string;
  quantity?: string;
  note?: string;
}

interface ShoppingList {
  days: number;
  sections: { key: string; name: string; color: string; items: ShoppingItem[] }[];
  extras: ShoppingExtra[];
}

// Lista de supermercado del plan: se calcula del menú y se le pueden sumar artículos a mano.
@Component({
  selector: 'app-shopping-list',
  imports: [FormsModule, Icon, Modal, ErrorBanner, FoodThumb, GiBadge],
  template: `
    <app-modal title="Lista de supermercado" [wide]="true" (closed)="closed.emit()">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold text-muted">Para</span>
        @for (d of dayOptions; track d) {
          <button type="button" class="chip cursor-pointer" [class]="days() === d ? 'bg-brand-600 text-white' : 'bg-mist text-muted'" (click)="setDays(d)">
            {{ d }} {{ d === 1 ? 'día' : 'días' }}
          </button>
        }
        <button type="button" class="btn-outline btn-sm ml-auto" (click)="pdf()"><app-icon name="download" size="sm" /> PDF</button>
      </div>

      <app-error [message]="error()" />

      @if (list(); as l) {
        @if (!l.sections.length && !l.extras.length) {
          <p class="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">El menú aún no tiene alimentos. Agrégalos en el paso «Menú» y la lista se arma sola.</p>
        }
        <div class="space-y-5">
          @for (s of l.sections; track s.key) {
            <section>
              <h3 class="mb-2 flex items-center gap-2 text-sm font-extrabold tracking-wide text-muted uppercase">
                <span class="size-2.5 rounded-full" [style.background]="s.color"></span>{{ s.name }}
              </h3>
              <ul class="divide-y divide-line rounded-xl border border-line">
                @for (i of s.items; track i.name) {
                  <li class="flex items-center gap-3 px-3 py-2.5">
                    <app-food-thumb [imageId]="i.imageId" [name]="i.name" [color]="s.color" [size]="36" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-bold">{{ i.name }}@if (i.brand) {<span class="font-semibold text-muted"> · {{ i.brand }}</span>}</p>
                      <p class="text-xs text-muted">{{ fmt(i.servings) }} × {{ i.portionText ?? 'porción' }}</p>
                    </div>
                    <app-gi-badge [value]="i.glycemicIndex" />
                    <span class="w-20 text-right text-sm font-extrabold">{{ i.grams ? '≈ ' + i.grams + ' g' : '' }}</span>
                  </li>
                }
              </ul>
            </section>
          }
        </div>

        <section class="mt-6">
          <h3 class="mb-2 text-sm font-extrabold tracking-wide text-muted uppercase">Otros artículos</h3>
          <div class="space-y-2">
            @for (e of extras(); track $index; let i = $index) {
              <div class="grid grid-cols-[1fr_110px_auto] gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                <input class="input py-2" placeholder="Artículo" maxlength="80" [ngModel]="e.name" (ngModelChange)="patch(i, 'name', $event)" [attr.aria-label]="'Artículo ' + (i + 1)" />
                <input class="input py-2" placeholder="Cantidad" maxlength="40" [ngModel]="e.quantity" (ngModelChange)="patch(i, 'quantity', $event)" aria-label="Cantidad" />
                <input class="input hidden py-2 sm:block" placeholder="Nota" maxlength="120" [ngModel]="e.note" (ngModelChange)="patch(i, 'note', $event)" aria-label="Nota" />
                <button type="button" class="btn-ghost btn-sm text-danger-500" (click)="removeExtra(i)" aria-label="Quitar artículo"><app-icon name="trash" size="sm" /></button>
              </div>
            }
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" class="btn-ghost btn-sm" (click)="addExtra()"><app-icon name="plus" size="sm" /> Agregar artículo</button>
            @if (dirty()) {
              <button type="button" class="btn-primary btn-sm ml-auto" [disabled]="saving()" (click)="saveExtras()">{{ saving() ? 'Guardando…' : 'Guardar artículos' }}</button>
            }
          </div>
        </section>
        <p class="mt-4 text-xs text-muted">Cantidades aproximadas según el menú (sin las sustituciones). El paciente ve esta lista en su app.</p>
      } @else if (!error()) {
        <div class="space-y-2"><div class="skeleton h-12"></div><div class="skeleton h-12"></div><div class="skeleton h-12"></div></div>
      }
    </app-modal>
  `,
})
export class ShoppingListDialog {
  private readonly api = inject(ApiService);
  readonly planId = input.required<string>();
  readonly closed = output<void>();

  protected readonly fmt = fmtServings;
  protected readonly dayOptions = [1, 3, 7, 14];
  protected readonly days = signal(7);
  protected readonly list = signal<ShoppingList | null>(null);
  protected readonly extras = signal<ShoppingExtra[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.planId();
      void this.load();
    });
  }

  protected setDays(d: number) {
    this.days.set(d);
    void this.load();
  }

  private async load() {
    this.error.set(null);
    try {
      const l = await this.api.get<ShoppingList>(`/meal-plans/${this.planId()}/shopping-list?days=${this.days()}`);
      this.list.set(l);
      if (!this.dirty()) this.extras.set(l.extras.map((e) => ({ ...e })));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos armar la lista.'));
    }
  }

  protected addExtra() {
    this.extras.update((l) => [...l, { name: '', quantity: '', note: '' }]);
    this.dirty.set(true);
  }

  protected removeExtra(i: number) {
    this.extras.update((l) => l.filter((_, j) => j !== i));
    this.dirty.set(true);
  }

  protected patch(i: number, field: keyof ShoppingExtra, value: string) {
    this.extras.update((l) => l.map((e, j) => (j === i ? { ...e, [field]: value } : e)));
    this.dirty.set(true);
  }

  protected async saveExtras() {
    this.saving.set(true);
    this.error.set(null);
    try {
      const extras = this.extras().filter((e) => e.name.trim());
      await this.api.put(`/meal-plans/${this.planId()}/shopping-extras`, { extras });
      this.dirty.set(false);
      await this.load();
    } catch (err) {
      this.error.set(errorMessage(err, 'No se pudieron guardar los artículos.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async pdf() {
    try {
      await this.api.openPdf(`/reports/meal-plans/${this.planId()}/shopping.pdf?days=${this.days()}`);
    } catch (err) {
      this.error.set(errorMessage(err, 'No se pudo generar el PDF.'));
    }
  }
}
