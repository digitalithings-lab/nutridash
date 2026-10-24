import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { round } from '../../core/calc';
import { servings } from '../../core/format';
import { ExchangeSystem, Food, Macros, Recipe } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Empty, ErrorBanner, Modal, PageHeader, SkeletonCards } from '../../shared/ui';

interface IngredientRow {
  food: Food;
  servings: number;
  note: string;
}

interface RecipeModel {
  id: string | null;
  name: string;
  description: string;
  servings: number;
  instructions: string;
  ingredients: IngredientRow[];
}

@Component({
  selector: 'app-recipes',
  imports: [FormsModule, Icon, Empty, ErrorBanner, Modal, PageHeader, SkeletonCards],
  template: `
    <app-page-header title="Recetas" subtitle="Preparaciones con su aporte por ración e intercambios.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" size="sm" /> Nueva receta</button>
    </app-page-header>

    <app-error [message]="error()" />

    @if (loading()) {
      <app-skeleton-cards [count]="6" grid="sm:grid-cols-2 xl:grid-cols-3" />
    } @else if (!recipes().length) {
      <div class="card">
        <app-empty emoji="🍲" title="Aún no hay recetas" text="Crea tu primera receta combinando alimentos del catálogo.">
          <button class="btn-primary mt-2" (click)="openNew()">Crear receta</button>
        </app-empty>
      </div>
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        @for (r of recipes(); track r.id) {
          <article class="card flex flex-col">
            <div class="flex items-start justify-between gap-2">
              <h2 class="font-extrabold text-ink">{{ r.name }}</h2>
              @if (r.nutritionistId === null) {
                <span class="chip shrink-0 bg-sky-100 text-sky-700">Catálogo</span>
              } @else {
                <span class="chip shrink-0 bg-violet-100 text-violet-500">Propia</span>
              }
            </div>
            @if (r.description) {
              <p class="mt-1 line-clamp-2 text-sm text-muted">{{ r.description }}</p>
            }
            <div class="mt-4 flex items-end gap-2">
              <p class="text-3xl font-extrabold text-brand-700">{{ r.perServing.kcal }}</p>
              <p class="pb-1 text-sm font-bold text-muted">kcal / ración · {{ r.servings }} {{ r.servings === 1 ? 'ración' : 'raciones' }}</p>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-xl bg-amber-100 p-2"><p class="text-[10px] font-bold text-amber-700 uppercase">Carb.</p><p class="font-extrabold">{{ r.perServing.choG }} g</p></div>
              <div class="rounded-xl bg-coral-100 p-2"><p class="text-[10px] font-bold text-coral-700 uppercase">Prot.</p><p class="font-extrabold">{{ r.perServing.proG }} g</p></div>
              <div class="rounded-xl bg-sky-100 p-2"><p class="text-[10px] font-bold text-sky-700 uppercase">Grasa</p><p class="font-extrabold">{{ r.perServing.fatG }} g</p></div>
            </div>
            @if (exchangeList(r).length) {
              <div class="mt-3">
                <p class="label">Intercambios por ración</p>
                <div class="flex flex-wrap gap-1.5">
                  @for (x of exchangeList(r); track x.key) {
                    <span class="chip border border-line bg-white text-ink">
                      <span class="size-2 rounded-full" [style.background-color]="x.color"></span>{{ x.amount }} {{ x.name }}
                    </span>
                  }
                </div>
              </div>
            }
            <p class="mt-3 text-xs text-muted">{{ r.ingredients.length }} {{ r.ingredients.length === 1 ? 'ingrediente' : 'ingredientes' }}</p>
            <div class="mt-auto flex justify-end gap-2 pt-4">
              @if (r.nutritionistId === null) {
                <button class="btn-outline btn-sm" (click)="openEdit(r, true)"><app-icon name="eye" size="sm" /> Ver</button>
              } @else {
                <button class="btn-ghost btn-sm text-danger-500" [disabled]="busy() === r.id" (click)="remove(r)" aria-label="Borrar receta"><app-icon name="trash" size="sm" /></button>
                <button class="btn-outline btn-sm" (click)="openEdit(r, false)"><app-icon name="edit" size="sm" /> Editar</button>
              }
            </div>
          </article>
        }
      </div>
    }

    @if (form(); as f) {
      <app-modal [title]="readOnly() ? f.name : f.id ? 'Editar receta' : 'Nueva receta'" [wide]="true" (closed)="form.set(null)">
        <form class="space-y-4" (ngSubmit)="save()">
          @if (readOnly()) {
            <p class="rounded-xl bg-sky-100 px-3 py-2 text-sm text-sky-700">Receta del catálogo general: solo lectura.</p>
          }
          <fieldset class="space-y-4" [disabled]="readOnly()">
            <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div>
                <label class="label" for="rc-name">Nombre</label>
                <input id="rc-name" class="input" name="name" maxlength="100" [(ngModel)]="f.name" required />
              </div>
              <div>
                <label class="label" for="rc-servings">Raciones</label>
                <input id="rc-servings" class="input" type="number" min="1" max="50" step="1" name="servings" [(ngModel)]="f.servings" (ngModelChange)="touch()" />
              </div>
            </div>
            <div>
              <label class="label" for="rc-desc">Descripción</label>
              <input id="rc-desc" class="input" name="description" maxlength="500" [(ngModel)]="f.description" />
            </div>

            <div>
              <p class="label">Ingredientes</p>
              @if (!readOnly()) {
                <div class="relative">
                  <input class="input" placeholder="Buscar alimento para añadir…" name="foodSearch" autocomplete="off" [(ngModel)]="foodSearch" (ngModelChange)="searchFoods()" />
                  @if (foodResults().length) {
                    <ul class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-card">
                      @for (food of foodResults(); track food.id) {
                        <li>
                          <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-mist" (click)="addIngredient(food)">
                            <span><b>{{ food.name }}</b> <span class="text-muted">· {{ food.portionText }}</span></span>
                            <span class="shrink-0 text-xs text-muted">{{ food.kcal }} kcal</span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
              @if (!f.ingredients.length) {
                <p class="mt-3 text-sm text-muted">Añade al menos un ingrediente.</p>
              } @else {
                <ul class="mt-3 divide-y divide-line rounded-xl border border-line">
                  @for (row of f.ingredients; track $index; let i = $index) {
                    <li class="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div class="min-w-0 flex-1 basis-48">
                        <p class="truncate text-sm font-bold">{{ row.food.name }}</p>
                        <p class="text-xs text-muted">Porción: {{ row.food.portionText }} · {{ round(row.food.kcal * row.servings, 0) }} kcal</p>
                      </div>
                      <label class="flex items-center gap-1.5 text-xs text-muted">
                        <input class="input w-20 py-1.5" type="number" min="0.25" max="50" step="0.25" [name]="'srv' + i" [(ngModel)]="row.servings" (ngModelChange)="touch()" />
                        porciones
                      </label>
                      <input class="input w-full py-1.5 sm:w-40" placeholder="Nota (opcional)" maxlength="100" [name]="'note' + i" [(ngModel)]="row.note" />
                      @if (!readOnly()) {
                        <button type="button" class="btn-ghost btn-sm text-danger-500" (click)="removeIngredient(i)" aria-label="Quitar ingrediente"><app-icon name="x" size="sm" /></button>
                      }
                    </li>
                  }
                </ul>
              }
            </div>

            <!-- Totales en vivo -->
            <div class="grid gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-2">
              <div>
                <p class="label">Receta completa</p>
                <p class="text-sm"><b>{{ live().total.kcal }} kcal</b> · C {{ live().total.choG }} g · P {{ live().total.proG }} g · G {{ live().total.fatG }} g</p>
              </div>
              <div>
                <p class="label">Por ración</p>
                <p class="text-sm"><b>{{ live().per.kcal }} kcal</b> · C {{ live().per.choG }} g · P {{ live().per.proG }} g · G {{ live().per.fatG }} g</p>
              </div>
            </div>

            <div>
              <label class="label" for="rc-instr">Preparación</label>
              <textarea id="rc-instr" class="input" rows="5" maxlength="6000" name="instructions" [(ngModel)]="f.instructions"></textarea>
            </div>
          </fieldset>

          <app-error [message]="formError()" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="form.set(null)">{{ readOnly() ? 'Cerrar' : 'Cancelar' }}</button>
            @if (!readOnly()) {
              <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar receta' }}</button>
            }
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class Recipes implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly round = round;

  protected readonly recipes = signal<Recipe[]>([]);
  protected readonly systems = signal<ExchangeSystem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly form = signal<RecipeModel | null>(null);
  protected readonly readOnly = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  // Cambia cada vez que se edita una cantidad para recalcular los totales.
  private readonly version = signal(0);
  protected foodSearch = '';
  protected readonly foodResults = signal<Food[]>([]);
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly groupInfo = computed(() => {
    const map: Record<string, { name: string; color: string; order: number }> = {};
    for (const s of this.systems()) {
      for (const g of s.groups) map[g.key] ??= { name: g.name, color: g.color, order: g.sortOrder };
    }
    return map;
  });

  protected readonly live = computed(() => {
    this.version();
    const f = this.form();
    const total: Macros = { kcal: 0, choG: 0, proG: 0, fatG: 0 };
    for (const row of f?.ingredients ?? []) {
      const n = Number(row.servings) || 0;
      total.kcal += row.food.kcal * n;
      total.choG += row.food.choG * n;
      total.proG += row.food.proG * n;
      total.fatG += row.food.fatG * n;
    }
    const s = Math.max(1, Number(f?.servings) || 1);
    return {
      total: { kcal: Math.round(total.kcal), choG: round(total.choG), proG: round(total.proG), fatG: round(total.fatG) },
      per: { kcal: Math.round(total.kcal / s), choG: round(total.choG / s), proG: round(total.proG / s), fatG: round(total.fatG / s) },
    };
  });

  async ngOnInit() {
    try {
      const [recipes, systems] = await Promise.all([
        this.api.get<Recipe[]>('/recipes'),
        this.api.get<ExchangeSystem[]>('/exchange-systems'),
      ]);
      this.recipes.set(recipes);
      this.systems.set(systems);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar las recetas.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected exchangeList(r: Recipe) {
    const info = this.groupInfo();
    return Object.entries(r.exchangesPerServing)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => ({ key, amount: servings(n), name: info[key]?.name ?? key, color: info[key]?.color ?? '#bfd0ca', order: info[key]?.order ?? 99 }))
      .sort((a, b) => a.order - b.order);
  }

  protected touch() {
    this.version.update((v) => v + 1);
  }

  protected openNew() {
    this.readOnly.set(false);
    this.formError.set(null);
    this.foodSearch = '';
    this.foodResults.set([]);
    this.form.set({ id: null, name: '', description: '', servings: 1, instructions: '', ingredients: [] });
  }

  protected openEdit(r: Recipe, readOnly: boolean) {
    this.readOnly.set(readOnly);
    this.formError.set(null);
    this.foodSearch = '';
    this.foodResults.set([]);
    this.form.set({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      servings: r.servings,
      instructions: r.instructions ?? '',
      ingredients: r.ingredients.map((i) => ({ food: i.food, servings: i.servings, note: i.note ?? '' })),
    });
  }

  protected searchFoods() {
    if (this.timer) clearTimeout(this.timer);
    const term = this.foodSearch.trim();
    if (term.length < 2) {
      this.foodResults.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        this.foodResults.set(await this.api.get<Food[]>(`/foods?search=${encodeURIComponent(term)}&limit=20`));
      } catch {
        this.foodResults.set([]);
      }
    }, 250);
  }

  protected addIngredient(food: Food) {
    const f = this.form();
    if (!f) return;
    f.ingredients = [...f.ingredients, { food, servings: 1, note: '' }];
    this.foodSearch = '';
    this.foodResults.set([]);
    this.touch();
  }

  protected removeIngredient(index: number) {
    const f = this.form();
    if (!f) return;
    f.ingredients = f.ingredients.filter((_, i) => i !== index);
    this.touch();
  }

  protected async save() {
    const f = this.form();
    if (!f || this.readOnly()) return;
    this.formError.set(null);
    const count = Math.round(Number(f.servings));
    if (f.name.trim().length < 2) return this.formError.set('El nombre debe tener al menos 2 caracteres.');
    if (!count || count < 1 || count > 50) return this.formError.set('Las raciones deben estar entre 1 y 50.');
    if (!f.ingredients.length) return this.formError.set('Añade al menos un ingrediente.');
    if (f.ingredients.some((i) => !(Number(i.servings) >= 0.25 && Number(i.servings) <= 50))) {
      return this.formError.set('Cada ingrediente debe tener entre 0.25 y 50 porciones.');
    }
    const body = {
      name: f.name.trim(),
      // Se envía "" para poder vaciar el campo al editar.
      description: f.description.trim(),
      servings: count,
      instructions: f.instructions.trim(),
      ingredients: f.ingredients.map((i) => ({ foodId: i.food.id, servings: Number(i.servings), note: i.note.trim() || undefined })),
    };
    this.saving.set(true);
    try {
      const saved = f.id ? await this.api.patch<Recipe>(`/recipes/${f.id}`, body) : await this.api.post<Recipe>('/recipes', body);
      this.recipes.update((list) => {
        const next = f.id ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      });
      this.form.set(null);
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos guardar la receta.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(r: Recipe) {
    if (!confirm(`¿Borrar la receta "${r.name}"?`)) return;
    this.busy.set(r.id);
    this.error.set(null);
    try {
      await this.api.delete(`/recipes/${r.id}`);
      this.recipes.update((list) => list.filter((x) => x.id !== r.id));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos borrar la receta.'));
    } finally {
      this.busy.set(null);
    }
  }
}
