import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { foodSourceLabels } from '../../core/format';
import { ExchangeGroup, ExchangeSystem, Food } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, Empty, ErrorBanner, PageHeader, Tabs } from '../../shared/ui';
import { FoodForm } from '../catalog/food-form';

interface GroupRow {
  group: ExchangeGroup;
  name: string;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
  portionHint: string;
  saving: boolean;
  saved: boolean;
}

const FIELDS = ['name', 'kcal', 'choG', 'proG', 'fatG', 'portionHint'] as const;

@Component({
  selector: 'app-admin-catalog',
  imports: [FormsModule, Icon, Badge, Empty, ErrorBanner, PageHeader, Tabs, FoodForm],
  template: `
    <app-page-header title="Catálogo" subtitle="Equivalencias por grupo y alimentos del catálogo general." />

    <!-- Equivalencias -->
    <section class="card">
      <h2 class="mb-1 text-lg font-extrabold">Equivalencias por grupo</h2>
      <p class="mb-4 text-sm text-muted">Valores de un intercambio de cada grupo. Afectan los cálculos de todos los planes nuevos.</p>
      @if (loadingSystems()) {
        <div class="space-y-2">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton h-10"></div>
          }
        </div>
      } @else if (systems().length) {
        <app-tabs [tabs]="systemTabs()" [active]="systemId()" (changed)="selectSystem($event)" />
        @if (currentSystem()?.description) {
          <p class="mb-3 text-sm text-muted">{{ currentSystem()?.description }}</p>
        }
        <app-error [message]="groupError()" />
        <div class="-mx-5 overflow-x-auto">
          <table class="table-base min-w-[860px]">
            <thead>
              <tr>
                <th class="pl-5">Grupo</th>
                <th class="w-24">Kcal</th>
                <th class="w-24">Carb. (g)</th>
                <th class="w-24">Prot. (g)</th>
                <th class="w-24">Grasa (g)</th>
                <th>Porción de referencia</th>
                <th class="w-28 pr-5"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.group.id; let i = $index) {
                <tr>
                  <td class="pl-5">
                    <div class="flex items-center gap-2">
                      <span class="size-3 shrink-0 rounded-full" [style.background-color]="r.group.color"></span>
                      <input class="input py-1.5" [name]="'gn' + i" maxlength="60" [(ngModel)]="r.name" />
                    </div>
                    <p class="mt-1 pl-5 text-[11px] text-soft">{{ r.group.key }}</p>
                  </td>
                  <td><input class="input py-1.5" type="number" min="0" max="1000" step="0.1" [name]="'gk' + i" [(ngModel)]="r.kcal" /></td>
                  <td><input class="input py-1.5" type="number" min="0" max="200" step="0.1" [name]="'gc' + i" [(ngModel)]="r.choG" /></td>
                  <td><input class="input py-1.5" type="number" min="0" max="200" step="0.1" [name]="'gp' + i" [(ngModel)]="r.proG" /></td>
                  <td><input class="input py-1.5" type="number" min="0" max="200" step="0.1" [name]="'gf' + i" [(ngModel)]="r.fatG" /></td>
                  <td><input class="input py-1.5" [name]="'gh' + i" maxlength="120" [(ngModel)]="r.portionHint" /></td>
                  <td class="pr-5 text-right">
                    @if (dirty(r)) {
                      <button class="btn-primary btn-sm" [disabled]="r.saving" (click)="saveGroup(r)">{{ r.saving ? '…' : 'Guardar' }}</button>
                    } @else if (r.saved) {
                      <span class="text-xs font-bold text-brand-700">Guardado</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <!-- Alimentos del catálogo -->
    <section class="mt-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-extrabold">Alimentos del catálogo</h2>
        <button class="btn-primary" (click)="editing.set({ food: null })"><app-icon name="plus" size="sm" /> Nuevo alimento</button>
      </div>
      <div class="mb-3 flex flex-wrap gap-2">
        <div class="relative w-full max-w-md">
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft"><app-icon name="search" size="sm" /></span>
          <input class="input pl-9" placeholder="Buscar alimento" name="search" [(ngModel)]="search" (ngModelChange)="searchChanged()" />
        </div>
        <select class="input w-auto" name="sourceFilter" [(ngModel)]="sourceFilter" (ngModelChange)="loadFoods()">
          <option value="PANAMA,TRADITIONAL">Ambas bases</option>
          <option value="PANAMA">Panamá</option>
          <option value="TRADITIONAL">Tradicional</option>
        </select>
      </div>
      <app-error [message]="foodError()" />
      <div class="card overflow-x-auto p-0">
        @if (loadingFoods()) {
          <div class="space-y-3 p-5">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="skeleton h-10"></div>
            }
          </div>
        } @else if (!foods().length) {
          <app-empty emoji="🥦" title="Sin alimentos" text="No hay alimentos del catálogo con ese filtro." />
        } @else {
          <table class="table-base min-w-[760px]">
            <thead>
              <tr>
                <th>Alimento</th>
                <th>Grupo</th>
                <th>Porción</th>
                <th class="text-right">Kcal</th>
                <th class="text-right">C / P / G</th>
                <th>Base</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (f of foods(); track f.id) {
                <tr>
                  <td>
                    <p class="font-bold">{{ f.name }}</p>
                    <p class="text-xs text-muted">{{ f.category }}</p>
                  </td>
                  <td>
                    @if (f.group) {
                      <span class="flex items-center gap-1.5 text-sm"><span class="size-2.5 rounded-full" [style.background-color]="f.group.color"></span>{{ f.group.name }}</span>
                    } @else {
                      <span class="text-muted">—</span>
                    }
                  </td>
                  <td class="text-muted">{{ f.portionText }}@if (f.portionGrams) { · {{ f.portionGrams }} g}</td>
                  <td class="text-right font-bold">{{ f.kcal }}</td>
                  <td class="text-right text-muted">{{ f.choG }} / {{ f.proG }} / {{ f.fatG }}</td>
                  <td><app-badge [badge]="sourceLabels[f.source]" /></td>
                  <td class="text-right"><button class="btn-ghost btn-sm" (click)="editing.set({ food: f })"><app-icon name="edit" size="sm" /> Editar</button></td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
      <p class="mt-2 text-xs text-muted">Solo se listan los alimentos activos (máx. 200). Al desactivar un alimento deja de verse aquí y para las nutricionistas.</p>
    </section>

    @if (editing(); as e) {
      <app-food-form [food]="e.food" [systems]="systems()" mode="catalog" (closed)="editing.set(null)" (saved)="afterSave()" />
    }
  `,
})
export class AdminCatalog implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly sourceLabels = foodSourceLabels;

  protected readonly systems = signal<ExchangeSystem[]>([]);
  protected readonly loadingSystems = signal(true);
  protected readonly systemId = signal('');
  protected readonly rows = signal<GroupRow[]>([]);
  protected readonly groupError = signal<string | null>(null);

  protected readonly foods = signal<Food[]>([]);
  protected readonly loadingFoods = signal(true);
  protected readonly foodError = signal<string | null>(null);
  protected search = '';
  protected sourceFilter = 'PANAMA,TRADITIONAL';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  protected readonly editing = signal<{ food: Food | null } | null>(null);

  protected readonly systemTabs = computed(() => this.systems().map((s) => ({ key: s.id, label: s.name })));
  protected readonly currentSystem = computed(() => this.systems().find((s) => s.id === this.systemId()) ?? null);

  async ngOnInit() {
    void this.loadFoods();
    try {
      const systems = await this.api.get<ExchangeSystem[]>('/exchange-systems');
      this.systems.set(systems);
      if (systems.length) this.selectSystem(systems[0].id);
    } catch (err) {
      this.groupError.set(errorMessage(err, 'No pudimos cargar los sistemas de intercambio.'));
    } finally {
      this.loadingSystems.set(false);
    }
  }

  protected selectSystem(id: string) {
    this.systemId.set(id);
    this.groupError.set(null);
    const system = this.systems().find((s) => s.id === id);
    this.rows.set(
      (system?.groups ?? []).map((g) => ({
        group: g,
        name: g.name,
        kcal: g.kcal,
        choG: g.choG,
        proG: g.proG,
        fatG: g.fatG,
        portionHint: g.portionHint ?? '',
        saving: false,
        saved: false,
      })),
    );
  }

  protected dirty(r: GroupRow): boolean {
    return FIELDS.some((k) => {
      const original = k === 'portionHint' ? (r.group.portionHint ?? '') : r.group[k];
      return String(r[k]) !== String(original);
    });
  }

  protected async saveGroup(r: GroupRow) {
    this.groupError.set(null);
    const nums = [r.kcal, r.choG, r.proG, r.fatG].map(Number);
    if (r.name.trim().length < 2) return this.groupError.set('El nombre del grupo debe tener al menos 2 caracteres.');
    if (nums.some((n, i) => Number.isNaN(n) || n < 0 || n > (i === 0 ? 1000 : 200))) {
      return this.groupError.set('Revisa los valores: kcal hasta 1000 y macros hasta 200 g.');
    }
    r.saving = true;
    try {
      const updated = await this.api.patch<ExchangeGroup>(`/admin/exchange-groups/${r.group.id}`, {
        name: r.name.trim(),
        kcal: nums[0],
        choG: nums[1],
        proG: nums[2],
        fatG: nums[3],
        portionHint: r.portionHint.trim() || null,
      });
      r.group = { ...r.group, ...updated };
      r.saved = true;
      // Mantiene la copia de sistemas al día (la usa el formulario de alimentos).
      this.systems.update((list) =>
        list.map((s) => (s.id === r.group.systemId ? { ...s, groups: s.groups.map((g) => (g.id === r.group.id ? r.group : g)) } : s)),
      );
    } catch (err) {
      this.groupError.set(errorMessage(err, 'No pudimos guardar el grupo.'));
    } finally {
      r.saving = false;
    }
  }

  protected async loadFoods() {
    const id = ++this.requestId;
    const params = new URLSearchParams({ source: this.sourceFilter });
    if (this.search.trim()) params.set('search', this.search.trim());
    this.loadingFoods.set(true);
    this.foodError.set(null);
    try {
      const list = await this.api.get<Food[]>(`/foods?${params.toString()}`);
      // Por si acaso: solo alimentos del catálogo general.
      if (id === this.requestId) this.foods.set(list.filter((f) => f.nutritionistId === null));
    } catch (err) {
      if (id === this.requestId) this.foodError.set(errorMessage(err, 'No pudimos cargar los alimentos.'));
    } finally {
      if (id === this.requestId) this.loadingFoods.set(false);
    }
  }

  protected searchChanged() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadFoods(), 300);
  }

  protected afterSave() {
    this.editing.set(null);
    void this.loadFoods();
  }
}
