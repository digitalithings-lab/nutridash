import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { foodSourceLabels, servings as fmtServings } from '../../core/format';
import { Food, PlanItem, PlanMeal, Recipe } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, ErrorBanner, Modal } from '../../shared/ui';
import { PlanStore } from './plan-store';

type PickerTab = 'foods' | 'recipes' | 'custom';

// Paso 5: menú. Alimentos, recetas y sustituciones equivalentes para cada tiempo de comida.
@Component({
  selector: 'app-step-menu',
  imports: [FormsModule, Icon, Modal, Badge, ErrorBanner],
  template: `
    <div class="space-y-4">
      @for (meal of store.plan()?.meals ?? []; track meal.id) {
        <section class="rounded-2xl border border-line">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h3 class="font-extrabold">{{ meal.name }} <span class="text-sm font-semibold text-muted">{{ meal.time }}</span></h3>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                @for (c of coverage(meal); track c.key) {
                  <span class="chip" [class]="c.state === 'ok' ? 'bg-brand-100 text-brand-700' : c.state === 'over' ? 'bg-coral-100 text-coral-700' : 'bg-mist text-muted'" [title]="c.name">
                    <span class="size-2 rounded-full" [style.background]="store.groupColor(c.key)"></span>
                    {{ c.short }} {{ fmt(c.menu) }}/{{ fmt(c.planned) }}
                  </span>
                }
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm text-muted">{{ meal.menuTotals.kcal }} / {{ meal.plannedTotals.kcal }} kcal</span>
              @if (!store.readonly()) {
                <button class="btn-secondary btn-sm" (click)="openPicker(meal)"><app-icon name="plus" size="sm" /> Agregar</button>
              }
            </div>
          </header>

          @if (mains(meal).length) {
            <ul class="divide-y divide-line">
              @for (item of mains(meal); track item.id) {
                <li class="px-4 py-3">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="size-2.5 shrink-0 rounded-full" [style.background]="itemColor(item)"></span>
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold">{{ itemName(item) }}</p>
                      <p class="text-xs text-muted">{{ itemAmount(item) }} · {{ round(item.macros.kcal) }} kcal · C {{ round(item.macros.choG) }} · P {{ round(item.macros.proG) }} · G {{ round(item.macros.fatG) }}</p>
                    </div>
                    @if (!store.readonly()) {
                      <input
                        class="input w-20 px-2 py-1.5 text-center"
                        type="number"
                        step="0.25"
                        min="0.25"
                        [ngModel]="item.servings"
                        (change)="changeServings(item, $any($event.target).value)"
                        aria-label="Porciones"
                      />
                      @if (item.food) {
                        <button class="btn-ghost btn-sm" (click)="openSubstitutes(meal, item)" title="Agregar sustitución equivalente">
                          <app-icon name="swap" size="sm" /> Sustituir
                        </button>
                      }
                      <button class="rounded-lg p-1.5 text-muted hover:bg-danger-100 hover:text-danger-500" (click)="remove(item)" aria-label="Quitar">
                        <app-icon name="trash" size="sm" />
                      </button>
                    }
                  </div>
                  @if (substitutes(meal, item).length) {
                    <ul class="mt-2 ml-5 space-y-1 border-l-2 border-brand-100 pl-3">
                      @for (sub of substitutes(meal, item); track sub.id) {
                        <li class="flex items-center gap-2 text-sm">
                          <span class="text-xs font-bold text-brand-600">o</span>
                          <span class="flex-1">{{ itemName(sub) }} <span class="text-muted">· {{ itemAmount(sub) }}</span></span>
                          @if (!store.readonly()) {
                            <button class="rounded p-1 text-muted hover:text-danger-500" (click)="remove(sub)" aria-label="Quitar sustitución">
                              <app-icon name="x" size="sm" />
                            </button>
                          }
                        </li>
                      }
                    </ul>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="px-4 py-5 text-sm text-muted">Sin alimentos todavía. Agrega alimentos que cubran los intercambios de este tiempo.</p>
          }
        </section>
      }
    </div>

    <app-error class="mt-4 block" [message]="localError()" />

    @if (!store.readonly()) {
      <div class="mt-6 flex justify-end">
        <button class="btn-primary" (click)="next.emit()">Continuar a la revisión</button>
      </div>
    }

    @if (picker(); as p) {
      <app-modal [title]="'Agregar a ' + p.meal.name" [wide]="true" (closed)="picker.set(null)">
        <div class="mb-4 inline-flex rounded-xl bg-mist p-1">
          @for (t of tabs; track t.key) {
            <button class="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-bold" [class]="pickerTab() === t.key ? 'bg-white text-brand-700 shadow-soft' : 'text-muted'" (click)="pickerTab.set(t.key)">
              {{ t.label }}
            </button>
          }
        </div>

        @if (pickerTab() === 'foods') {
          <div class="mb-3 flex flex-wrap gap-1.5">
            <button class="chip cursor-pointer" [class]="!groupFilter() ? 'bg-ink text-white' : 'bg-mist text-muted'" (click)="setGroup(null)">Todos</button>
            @for (c of coverage(p.meal); track c.key) {
              <button class="chip cursor-pointer" [class]="groupFilter() === c.key ? 'bg-ink text-white' : 'bg-mist text-muted'" (click)="setGroup(c.key)">
                <span class="size-2 rounded-full" [style.background]="store.groupColor(c.key)"></span>{{ c.short }}
                @if (c.state === 'missing') {
                  <span class="text-coral-700">· faltan {{ fmt(c.planned - c.menu) }}</span>
                }
              </button>
            }
          </div>
          <input class="input mb-3" placeholder="Buscar alimento…" [ngModel]="search()" (ngModelChange)="onSearch($event)" aria-label="Buscar alimento" />
          <div class="max-h-80 overflow-y-auto rounded-xl border border-line">
            @for (f of foods(); track f.id) {
              <button class="flex w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-canvas" [class.bg-brand-50]="selectedFood()?.id === f.id" (click)="pickFood(f)">
                <span class="size-2.5 shrink-0 rounded-full" [style.background]="f.group?.color ?? '#97a8a2'"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">{{ f.name }}</span>
                  <span class="block text-xs text-muted">{{ f.portionText }} · {{ f.kcal }} kcal · {{ f.group?.name ?? 'Sin grupo' }}</span>
                </span>
                <app-badge [badge]="sourceLabels[f.source]" />
              </button>
            } @empty {
              <p class="px-3 py-6 text-center text-sm text-muted">{{ loadingFoods() ? 'Buscando…' : 'No hay alimentos con ese filtro.' }}</p>
            }
          </div>
        } @else if (pickerTab() === 'recipes') {
          <div class="max-h-96 overflow-y-auto rounded-xl border border-line">
            @for (r of recipes(); track r.id) {
              <button class="flex w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-canvas" [class.bg-brand-50]="selectedRecipe()?.id === r.id" (click)="selectedRecipe.set(r)">
                <app-icon name="book" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">{{ r.name }}</span>
                  <span class="block text-xs text-muted">{{ r.perServing.kcal }} kcal por ración · {{ recipeExchanges(r) }}</span>
                </span>
              </button>
            } @empty {
              <p class="px-3 py-6 text-center text-sm text-muted">Aún no tienes recetas. Créalas en la sección Recetas.</p>
            }
          </div>
        } @else {
          <label class="label" for="customName">Nombre</label>
          <input id="customName" class="input" [(ngModel)]="customName" placeholder="Ej.: Té sin azúcar" />
          <p class="mt-2 text-xs text-muted">Los elementos libres no suman calorías ni intercambios.</p>
        }

        <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div>
            <label class="label" for="pickServings">{{ pickerTab() === 'recipes' ? 'Raciones' : 'Porciones' }}</label>
            <input id="pickServings" class="input w-28" type="number" step="0.25" min="0.25" [(ngModel)]="pickServings" />
          </div>
          @if (pickerTab() === 'foods' && selectedFood(); as f) {
            <p class="pb-2.5 text-sm text-muted">{{ f.name }}: {{ amountText(f.portionText, pickServings) }} · {{ round(f.kcal * pickServings) }} kcal</p>
          }
          <button class="btn-primary ml-auto" [disabled]="!canAdd() || store.saving()" (click)="add()">Agregar</button>
        </div>
      </app-modal>
    }

    @if (subs(); as s) {
      <app-modal [title]="'Sustituciones para ' + itemName(s.item)" (closed)="subs.set(null)">
        <p class="mb-3 text-sm text-muted">Alimentos del mismo grupo: {{ s.item.servings }} porción(es) de cualquiera equivale a lo indicado.</p>
        <div class="max-h-96 overflow-y-auto rounded-xl border border-line">
          @for (f of s.options; track f.id) {
            <button class="flex w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-canvas" (click)="addSubstitute(s.meal, s.item, f)">
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold">{{ f.name }}</span>
                <span class="block text-xs text-muted">{{ amountText(f.portionText, s.item.servings) }}</span>
              </span>
              <app-badge [badge]="sourceLabels[f.source]" />
              <app-icon name="plus" size="sm" />
            </button>
          } @empty {
            <p class="px-3 py-6 text-center text-sm text-muted">{{ s.loading ? 'Buscando equivalentes…' : 'No hay equivalentes disponibles en este modo.' }}</p>
          }
        </div>
      </app-modal>
    }
  `,
})
export class StepMenu {
  protected readonly store = inject(PlanStore);
  private readonly api = inject(ApiService);
  readonly next = output<void>();

  protected readonly fmt = fmtServings;
  protected readonly sourceLabels = foodSourceLabels;
  protected readonly round = (n: number) => Math.round(n);
  protected readonly tabs: { key: PickerTab; label: string }[] = [
    { key: 'foods', label: 'Alimentos' },
    { key: 'recipes', label: 'Recetas' },
    { key: 'custom', label: 'Otro' },
  ];

  protected readonly localError = signal<string | null>(null);
  protected readonly picker = signal<{ meal: PlanMeal } | null>(null);
  protected readonly pickerTab = signal<PickerTab>('foods');
  protected readonly groupFilter = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly foods = signal<Food[]>([]);
  protected readonly loadingFoods = signal(false);
  protected readonly selectedFood = signal<Food | null>(null);
  protected readonly selectedRecipe = signal<Recipe | null>(null);
  protected readonly recipes = signal<Recipe[]>([]);
  protected readonly subs = signal<{ meal: PlanMeal; item: PlanItem; options: Food[]; loading: boolean } | null>(null);
  protected pickServings = 1;
  protected customName = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private recipesLoaded = false;

  protected readonly canAdd = computed(() => {
    const tab = this.pickerTab();
    if (tab === 'foods') return !!this.selectedFood();
    if (tab === 'recipes') return !!this.selectedRecipe();
    return true;
  });

  protected mains(meal: PlanMeal) {
    return meal.items.filter((i) => !i.substituteOfId);
  }

  protected substitutes(meal: PlanMeal, item: PlanItem) {
    return meal.items.filter((i) => i.substituteOfId === item.id);
  }

  // Intercambios planeados vs. cubiertos por el menú en un tiempo de comida.
  protected coverage(meal: PlanMeal) {
    const keys = new Set([...Object.keys(meal.exchanges), ...Object.keys(meal.menuExchanges)]);
    return this.store
      .groups()
      .filter((g) => keys.has(g.key))
      .map((g) => {
        const planned = meal.exchanges[g.key] ?? 0;
        const menu = Math.round((meal.menuExchanges[g.key] ?? 0) * 100) / 100;
        const state = Math.abs(menu - planned) < 0.01 ? 'ok' : menu > planned ? 'over' : 'missing';
        return { key: g.key, name: g.name, short: g.name.split(/[ ,]/)[0], planned, menu, state };
      });
  }

  protected itemName(item: PlanItem) {
    return item.food?.name ?? item.recipe?.name ?? item.customName ?? '';
  }

  protected itemColor(item: PlanItem) {
    return item.food?.group?.color ?? (item.recipe ? '#8b74d6' : '#97a8a2');
  }

  protected itemAmount(item: PlanItem) {
    if (item.food) return this.amountText(item.food.portionText, item.servings);
    if (item.recipe) return `${fmtServings(item.servings)} ración(es)`;
    return `${fmtServings(item.servings)} porción(es)`;
  }

  protected amountText(portion: string, n: number) {
    return n === 1 ? portion : `${fmtServings(n)} × ${portion}`;
  }

  protected recipeExchanges(r: Recipe) {
    return Object.entries(r.exchangesPerServing)
      .map(([k, v]) => `${fmtServings(v)} ${this.store.groupName(k).split(/[ ,]/)[0].toLowerCase()}`)
      .join(', ');
  }

  openPicker(meal: PlanMeal) {
    this.localError.set(null);
    this.picker.set({ meal });
    this.pickerTab.set('foods');
    this.selectedFood.set(null);
    this.selectedRecipe.set(null);
    this.customName = '';
    this.search.set('');
    // Empieza por el primer grupo al que le faltan porciones.
    const missing = this.coverage(meal).find((c) => c.state === 'missing');
    this.groupFilter.set(missing?.key ?? null);
    this.pickServings = missing ? Math.max(0.25, missing.planned - missing.menu) : 1;
    void this.loadFoods();
    if (!this.recipesLoaded) {
      this.recipesLoaded = true;
      this.api.get<Recipe[]>('/recipes').then((r) => this.recipes.set(r), () => (this.recipesLoaded = false));
    }
  }

  protected setGroup(key: string | null) {
    this.groupFilter.set(key);
    this.selectedFood.set(null);
    const c = key && this.picker() ? this.coverage(this.picker()!.meal).find((x) => x.key === key) : null;
    if (c && c.state === 'missing') this.pickServings = c.planned - c.menu;
    void this.loadFoods();
  }

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadFoods(), 250);
  }

  private async loadFoods() {
    const plan = this.store.plan();
    if (!plan) return;
    const params = new URLSearchParams({ source: plan.allowedFoodSources.join(','), limit: '80' });
    if (this.search().trim()) params.set('search', this.search().trim());
    if (this.groupFilter()) params.set('groupKey', this.groupFilter()!);
    this.loadingFoods.set(true);
    try {
      this.foods.set(await this.api.get<Food[]>(`/foods?${params}`));
    } catch (err) {
      this.localError.set(errorMessage(err));
    } finally {
      this.loadingFoods.set(false);
    }
  }

  protected pickFood(food: Food) {
    this.selectedFood.set(food);
  }

  async add() {
    const p = this.picker();
    if (!p) return;
    const servings = Math.max(0.25, Number(this.pickServings) || 1);
    const tab = this.pickerTab();
    const body =
      tab === 'foods'
        ? { foodId: this.selectedFood()!.id, servings }
        : tab === 'recipes'
          ? { recipeId: this.selectedRecipe()!.id, servings }
          : { customName: this.customName.trim() || 'Libre', servings };
    if (await this.store.run('post', `/meals/${p.meal.id}/items`, body)) this.picker.set(null);
  }

  async changeServings(item: PlanItem, value: string) {
    const n = Number(value);
    if (!n || n < 0.25 || n === item.servings) return;
    await this.store.run('patch', `/items/${item.id}`, { servings: n });
  }

  async remove(item: PlanItem) {
    await this.store.run('delete', `/items/${item.id}`);
  }

  async openSubstitutes(meal: PlanMeal, item: PlanItem) {
    if (!item.food) return;
    this.subs.set({ meal, item, options: [], loading: true });
    try {
      const allowed = new Set(this.store.plan()?.allowedFoodSources ?? []);
      const already = new Set(meal.items.map((i) => i.foodId));
      const options = (await this.api.get<Food[]>(`/foods/${item.food.id}/equivalents`)).filter(
        (f) => allowed.has(f.source) && !already.has(f.id),
      );
      this.subs.set({ meal, item, options, loading: false });
    } catch (err) {
      this.subs.set(null);
      this.localError.set(errorMessage(err));
    }
  }

  async addSubstitute(meal: PlanMeal, item: PlanItem, food: Food) {
    const ok = await this.store.run('post', `/meals/${meal.id}/items`, {
      foodId: food.id,
      servings: item.servings,
      substituteOfId: item.id,
    });
    if (ok) {
      const s = this.subs();
      if (s) this.subs.set({ ...s, options: s.options.filter((o) => o.id !== food.id) });
    }
  }
}
