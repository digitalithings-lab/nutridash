import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { compare, totalsFromServings } from '../../core/calc';
import { exchangeModeLabels } from '../../core/format';
import { ExchangeMode } from '../../core/types';
import { Icon } from '../../shared/icon';
import { PlanStore } from './plan-store';
import { ChecksTable } from './checks-table';

// Paso 3: sistema de intercambios y porciones diarias por grupo.
@Component({
  selector: 'app-step-exchanges',
  imports: [FormsModule, Icon, ChecksTable],
  template: `
    <p class="label">Modo de trabajo</p>
    <div class="mb-6 grid gap-3 sm:grid-cols-3">
      @for (m of modes; track m.value) {
        <button
          type="button"
          class="cursor-pointer rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed"
          [class]="mode() === m.value ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-line-strong'"
          [disabled]="store.readonly() || store.saving()"
          (click)="changeMode(m.value)"
        >
          <p class="font-bold" [class.text-brand-700]="mode() === m.value">{{ m.label }}</p>
          <p class="mt-1 text-xs text-muted">{{ m.hint }}</p>
        </button>
      }
    </div>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">{{ store.plan()?.system?.name }} · {{ store.plan()?.system?.source }}</p>
      @if (!store.readonly()) {
        <button class="btn-secondary btn-sm" [disabled]="store.saving()" (click)="suggest()">
          <app-icon name="wand" size="sm" /> Sugerir intercambios
        </button>
      }
    </div>

    <div class="overflow-x-auto rounded-2xl border border-line">
      <table class="table-base">
        <thead>
          <tr>
            <th>Grupo</th>
            <th class="w-36">Porciones/día</th>
            <th class="text-right">Kcal</th>
            <th class="text-right">CHO</th>
            <th class="text-right">PRO</th>
            <th class="text-right">GRA</th>
          </tr>
        </thead>
        <tbody>
          @for (g of rows(); track g.key) {
            <tr [class.bg-canvas]="!g.servings">
              <td>
                <span class="flex items-center gap-2">
                  <span class="size-3 shrink-0 rounded-full" [style.background]="g.color"></span>
                  <span>
                    <span class="block font-semibold">{{ g.name }}</span>
                    <span class="block text-xs text-muted">{{ g.kcal }} kcal · {{ g.choG }}/{{ g.proG }}/{{ g.fatG }} g</span>
                  </span>
                </span>
              </td>
              <td>
                <div class="flex items-center gap-1">
                  <button class="btn-outline btn-sm px-2" [disabled]="store.readonly() || !g.servings" (click)="bump(g.key, -0.5)" aria-label="Quitar media porción">−</button>
                  <input
                    class="input w-16 px-2 text-center font-bold"
                    type="number"
                    step="0.5"
                    min="0"
                    [ngModel]="g.servings"
                    (ngModelChange)="setServings(g.key, $event)"
                    [disabled]="store.readonly()"
                    [attr.aria-label]="'Porciones de ' + g.name"
                  />
                  <button class="btn-outline btn-sm px-2" [disabled]="store.readonly()" (click)="bump(g.key, 0.5)" aria-label="Agregar media porción">+</button>
                </div>
              </td>
              <td class="text-right">{{ g.servings ? round(g.kcal * g.servings) : '—' }}</td>
              <td class="text-right">{{ g.servings ? round(g.choG * g.servings) : '—' }}</td>
              <td class="text-right">{{ g.servings ? round(g.proG * g.servings) : '—' }}</td>
              <td class="text-right">{{ g.servings ? round(g.fatG * g.servings) : '—' }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="bg-brand-50 font-bold">
            <td class="px-3 py-3">Total</td>
            <td class="px-3 py-3"></td>
            <td class="px-3 py-3 text-right">{{ totals().kcal }}</td>
            <td class="px-3 py-3 text-right">{{ totals().choG }}</td>
            <td class="px-3 py-3 text-right">{{ totals().proG }}</td>
            <td class="px-3 py-3 text-right">{{ totals().fatG }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <h3 class="mt-6 mb-2 font-bold">Comparación con el objetivo</h3>
    <app-checks-table [checks]="checks()" />

    @if (!store.readonly()) {
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        @if (dirty()) {
          <span class="self-center text-sm text-amber-700">Cambios sin guardar</span>
        }
        <button class="btn-primary" [disabled]="store.saving()" (click)="save()">
          {{ store.saving() ? 'Guardando…' : 'Guardar y continuar' }}
        </button>
      </div>
    }
  `,
})
export class StepExchanges {
  protected readonly store = inject(PlanStore);
  readonly next = output<void>();
  protected readonly round = (n: number) => Math.round(n * 10) / 10;

  protected readonly modes = (Object.keys(exchangeModeLabels) as ExchangeMode[]).map((value) => ({
    value,
    ...exchangeModeLabels[value],
  }));

  protected readonly servings = signal<Record<string, number>>({});
  protected readonly dirty = signal(false);
  protected readonly mode = computed(() => this.store.plan()?.exchangeMode ?? 'PANAMA');

  protected readonly rows = computed(() =>
    this.store.groups().map((g) => ({ ...g, servings: this.servings()[g.key] ?? 0 })),
  );
  protected readonly totals = computed(() => totalsFromServings(this.store.groups(), this.servings()));
  protected readonly checks = computed(() => {
    const target = this.store.plan()?.target;
    return target ? compare(target, this.totals()) : [];
  });

  constructor() {
    // Cada vez que el backend devuelve el plan, se toman sus porciones diarias.
    effect(() => {
      const p = this.store.plan();
      if (!p) return;
      this.servings.set({ ...p.daily });
      this.dirty.set(false);
    });
  }

  protected setServings(key: string, value: unknown) {
    const n = Math.max(0, Math.round(Number(value) * 2) / 2 || 0);
    this.servings.update((s) => ({ ...s, [key]: n }));
    this.dirty.set(true);
  }

  protected bump(key: string, delta: number) {
    this.setServings(key, (this.servings()[key] ?? 0) + delta);
  }

  async changeMode(mode: ExchangeMode) {
    if (mode === this.mode()) return;
    await this.store.run('put', '/exchange-mode', { exchangeMode: mode });
  }

  async suggest() {
    await this.store.run('post', '/suggest-exchanges');
  }

  async save() {
    const servings = Object.fromEntries(Object.entries(this.servings()).filter(([, v]) => v > 0));
    if (await this.store.run('put', '/exchanges', { servings })) this.next.emit();
  }
}
