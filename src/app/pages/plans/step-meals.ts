import { DialogService } from '../../shared/dialog';
import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { totalsFromServings } from '../../core/calc';
import { servings as fmtServings } from '../../core/format';
import { Icon } from '../../shared/icon';
import { PlanStore } from './plan-store';

interface MealRow {
  id?: string;
  name: string;
  time: string | null;
  notes: string | null;
  exchanges: Record<string, number>;
}

// Paso 4: reparto de los intercambios diarios entre los tiempos de comida.
@Component({
  selector: 'app-step-meals',
  imports: [FormsModule, Icon],
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">Ajusta las porciones de cada grupo en cada tiempo de comida. La última fila debe coincidir con el total diario.</p>
      @if (!store.readonly()) {
        <div class="flex gap-2">
          <button class="btn-outline btn-sm" [disabled]="store.saving()" (click)="addMeal()"><app-icon name="plus" size="sm" /> Tiempo de comida</button>
          <button class="btn-secondary btn-sm" [disabled]="store.saving()" (click)="redistribute()"><app-icon name="wand" size="sm" /> Repartir automáticamente</button>
        </div>
      }
    </div>

    <div class="overflow-x-auto rounded-2xl border border-line">
      <table class="table-base min-w-[720px]">
        <thead>
          <tr>
            <th class="min-w-48">Tiempo de comida</th>
            @for (g of groups(); track g.key) {
              <th class="text-center" [title]="g.name">
                <span class="mx-auto mb-1 block size-2.5 rounded-full" [style.background]="g.color"></span>
                {{ short(g.name) }}
              </th>
            }
            <th class="text-right">Kcal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (meal of meals(); track $index; let i = $index) {
            <tr>
              <td>
                <div class="flex gap-2">
                  <input class="input min-w-28 px-2 py-1.5 font-semibold" [ngModel]="meal.name" (ngModelChange)="update(i, 'name', $event)" [disabled]="store.readonly()" aria-label="Nombre del tiempo de comida" />
                  <input class="input w-24 px-2 py-1.5" type="time" [ngModel]="meal.time" (ngModelChange)="update(i, 'time', $event || null)" [disabled]="store.readonly()" aria-label="Hora" />
                </div>
              </td>
              @for (g of groups(); track g.key) {
                <td class="px-1 text-center">
                  <input
                    class="input w-14 px-1 py-1.5 text-center"
                    type="number"
                    step="0.5"
                    min="0"
                    [ngModel]="meal.exchanges[g.key] || null"
                    (ngModelChange)="setServing(i, g.key, $event)"
                    [disabled]="store.readonly()"
                    [attr.aria-label]="g.name + ' en ' + meal.name"
                  />
                </td>
              }
              <td class="text-right font-semibold">{{ mealKcal(meal) }}</td>
              <td>
                @if (!store.readonly() && meals().length > 1) {
                  <button class="rounded-lg p-1.5 text-muted hover:bg-danger-100 hover:text-danger-500" (click)="removeMeal(i)" aria-label="Quitar tiempo de comida">
                    <app-icon name="trash" size="sm" />
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="font-bold">
            <td class="px-3 py-3">Asignado</td>
            @for (g of groups(); track g.key) {
              <td class="px-1 py-3 text-center" [class]="sumOk(g.key) ? 'text-brand-700' : 'bg-coral-100 text-coral-700'">
                {{ fmt(assigned()[g.key] ?? 0) }}<span class="font-normal text-muted">/{{ fmt(daily()[g.key] ?? 0) }}</span>
              </td>
            }
            <td class="px-3 py-3 text-right">{{ totalKcal() }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    @if (duplicateName(); as dup) {
      <p class="mt-3 text-sm font-semibold text-danger-500">Hay dos tiempos de comida llamados «{{ dup }}». Cambia uno de los nombres para poder guardar.</p>
    }
    @if (!allOk()) {
      <p class="mt-3 text-sm font-semibold text-coral-700">Hay grupos cuya suma no coincide con el total diario (marcados en naranja).</p>
    }

    @if (!store.readonly()) {
      <div class="mt-6 flex justify-end gap-2">
        @if (dirty()) {
          <span class="self-center text-sm text-amber-700">Cambios sin guardar</span>
        }
        <button class="btn-primary" [disabled]="store.saving() || !validNames()" (click)="save()">
          {{ store.saving() ? 'Guardando…' : 'Guardar y continuar' }}
        </button>
      </div>
    }
  `,
})
export class StepMeals {
  protected readonly store = inject(PlanStore);
  private readonly dialog = inject(DialogService);
  readonly next = output<void>();
  protected readonly fmt = fmtServings;

  protected readonly meals = signal<MealRow[]>([]);
  protected readonly dirty = signal(false);
  protected readonly daily = computed(() => this.store.plan()?.daily ?? {});

  // Solo se muestran los grupos con porciones en el día o ya asignados a alguna comida.
  protected readonly groups = computed(() => {
    const used = new Set([...Object.keys(this.daily()), ...this.meals().flatMap((m) => Object.keys(m.exchanges))]);
    return this.store.groups().filter((g) => used.has(g.key));
  });

  protected readonly assigned = computed(() => {
    const sum: Record<string, number> = {};
    for (const m of this.meals()) for (const [k, v] of Object.entries(m.exchanges)) sum[k] = (sum[k] ?? 0) + Number(v || 0);
    return sum;
  });
  protected readonly allOk = computed(() => this.groups().every((g) => this.sumOk(g.key)));
  protected readonly duplicateName = computed(() => {
    const seen = new Set<string>();
    for (const m of this.meals()) {
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) return m.name.trim();
      seen.add(key);
    }
    return null;
  });
  protected readonly validNames = computed(() => this.meals().every((m) => m.name.trim().length > 0) && !this.duplicateName());
  protected readonly totalKcal = computed(() => this.meals().reduce((s, m) => s + this.mealKcal(m), 0));

  constructor() {
    effect(() => {
      const p = this.store.plan();
      if (!p) return;
      this.meals.set(p.meals.map((m) => ({ id: m.id, name: m.name, time: m.time, notes: m.notes, exchanges: { ...m.exchanges } })));
      this.dirty.set(false);
    });
  }

  protected short(name: string) {
    return name.split(/[ ,]/)[0];
  }

  protected sumOk(key: string) {
    return Math.abs((this.assigned()[key] ?? 0) - (this.daily()[key] ?? 0)) < 0.01;
  }

  protected mealKcal(meal: MealRow) {
    return totalsFromServings(this.store.groups(), meal.exchanges).kcal;
  }

  protected update(i: number, field: 'name' | 'time', value: string | null) {
    this.meals.update((list) => list.map((m, j) => (j === i ? { ...m, [field]: value } : m)));
    this.dirty.set(true);
  }

  protected setServing(i: number, key: string, value: unknown) {
    const n = Math.max(0, Math.round(Number(value) * 2) / 2 || 0);
    this.meals.update((list) =>
      list.map((m, j) => {
        if (j !== i) return m;
        const exchanges = { ...m.exchanges };
        if (n > 0) exchanges[key] = n;
        else delete exchanges[key];
        return { ...m, exchanges };
      }),
    );
    this.dirty.set(true);
  }

  protected addMeal() {
    // Nombre único: «Colación», «Colación 2», …
    const names = new Set(this.meals().map((m) => m.name.trim().toLowerCase()));
    let name = 'Colación';
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `Colación ${n}`;
    this.meals.update((list) => [...list, { name, time: null, notes: null, exchanges: {} }]);
    this.dirty.set(true);
  }

  protected async removeMeal(i: number) {
    const meal = this.meals()[i];
    const items = this.store.plan()?.meals.find((m) => m.id === meal.id)?.items.length ?? 0;
    if (items) {
      const ok = await this.dialog.confirm({
        title: `¿Quitar «${meal.name}»?`,
        message: `Tiene ${items} alimento(s) en el menú que también se quitarán al guardar.`,
        confirmLabel: 'Quitar',
        tone: 'danger',
        icon: 'trash',
      });
      if (!ok) return;
    }
    this.meals.update((list) => list.filter((_, j) => j !== i));
    this.dirty.set(true);
  }

  private body() {
    return {
      meals: this.meals().map((m) => ({
        id: m.id,
        name: m.name.trim(),
        time: m.time || null,
        notes: m.notes,
        exchanges: m.exchanges,
      })),
    };
  }

  async redistribute() {
    // Guarda primero los nombres y tiempos actuales, luego reparte.
    if (this.dirty() && !(await this.store.run('put', '/meals', this.body()))) return;
    await this.store.run('post', '/distribute');
  }

  async save() {
    if (await this.store.run('put', '/meals', this.body())) this.next.emit();
  }
}
