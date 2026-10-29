import { DialogService } from '../../shared/dialog';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { foodSourceLabels } from '../../core/format';
import { ExchangeGroup, ExchangeSystem, Food } from '../../core/types';
import { Icon } from '../../shared/icon';
import { Badge, Empty, ErrorBanner, Modal, PageHeader, Tabs } from '../../shared/ui';
import { glycemicLoad } from '../../core/calc';
import { imageUrl } from '../../core/files';
import { FoodThumb, GiBadge } from '../../shared/food';
import { FoodForm } from './food-form';

const SOURCE_TABS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'PANAMA', label: 'Panamá' },
  { key: 'TRADITIONAL', label: 'Tradicional' },
  { key: 'CUSTOM', label: 'Propios' },
];

@Component({
  selector: 'app-foods',
  imports: [FormsModule, Icon, Badge, Empty, ErrorBanner, Modal, PageHeader, Tabs, FoodForm, FoodThumb, GiBadge],
  template: `
    <app-page-header title="Alimentos" subtitle="Catálogo de Panamá, listas tradicionales y tus alimentos propios.">
      <button class="btn-primary" (click)="openForm(null)"><app-icon name="plus" size="sm" /> Nuevo alimento</button>
    </app-page-header>

    <app-tabs [tabs]="tabs" [active]="source()" (changed)="setSource($event)" />

    <div class="mb-4 flex flex-col gap-3">
      <div class="relative max-w-md">
        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft"><app-icon name="search" size="sm" /></span>
        <input class="input pl-9" placeholder="Buscar por nombre o categoría" name="search" [(ngModel)]="search" (ngModelChange)="searchChanged()" />
      </div>
      @if (groups().length) {
        <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button class="chip shrink-0 cursor-pointer border" [class]="!groupKey() ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-muted'" (click)="setGroup(null)">
            Todos los grupos
          </button>
          @for (g of groups(); track g.key) {
            <button
              class="chip shrink-0 cursor-pointer border"
              [class]="groupKey() === g.key ? 'text-white' : 'border-line bg-surface text-ink'"
              [style.background-color]="groupKey() === g.key ? g.color : null"
              [style.border-color]="groupKey() === g.key ? g.color : null"
              (click)="setGroup(g.key)"
            >
              <span class="size-2 rounded-full" [style.background-color]="groupKey() === g.key ? '#fff' : g.color"></span>
              {{ g.name }}
            </button>
          }
        </div>
      }
    </div>

    <app-error [message]="error()" />

    <section class="card mt-3 p-0">
      @if (loading()) {
        <div class="space-y-3 p-5">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="skeleton h-12"></div>
          }
        </div>
      } @else if (!foods().length) {
        <app-empty emoji="🥑" title="No hay alimentos" [text]="source() === 'CUSTOM' ? 'Aún no has creado alimentos propios.' : 'Prueba con otra búsqueda o grupo.'" />
      } @else {
        <ul class="divide-y divide-line">
          @for (f of foods(); track f.id) {
            <li>
              <button class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas sm:px-5" (click)="openDetail(f)">
                <app-food-thumb [imageId]="f.imageId" [name]="f.name" [color]="f.group?.color" [size]="44" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="truncate font-bold text-ink">{{ f.name }}@if (f.brand) {<span class="font-semibold text-muted"> · {{ f.brand }}</span>}</p>
                    <app-badge [badge]="sourceLabels[f.source]" />
                    <app-gi-badge [value]="f.glycemicIndex" />
                  </div>
                  <p class="truncate text-xs text-muted">
                    {{ f.category }} · {{ f.portionText }}@if (f.portionGrams) { ({{ f.portionGrams }} g)}
                    @if (f.group) { · {{ f.group.name }} }
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-extrabold text-ink">{{ f.kcal }} <span class="text-xs font-bold text-muted">kcal</span></p>
                  <p class="text-xs text-muted">C {{ f.choG }} · P {{ f.proG }} · G {{ f.fatG }}</p>
                </div>
              </button>
            </li>
          }
        </ul>
        @if (foods().length >= 200) {
          <p class="border-t border-line px-5 py-3 text-xs text-muted">Se muestran los primeros 200 resultados. Afina la búsqueda para ver más.</p>
        }
      }
    </section>
    <p class="mt-3 text-xs text-muted">Valores nutricionales de referencia por porción. La decisión clínica es profesional.</p>

    @if (detail(); as f) {
      <app-modal [title]="f.name" (closed)="detail.set(null)">
        <div class="space-y-5">
          @if (f.imageId) {
            <img [src]="image(f.imageId)" [alt]="f.name" class="max-h-56 w-full rounded-2xl object-cover" />
          }
          <div class="flex flex-wrap items-center gap-2">
            <app-badge [badge]="sourceLabels[f.source]" />
            @if (f.brand) {
              <span class="chip bg-mist text-ink">{{ f.brand }}</span>
            }
            <app-gi-badge [value]="f.glycemicIndex" />
            @if (f.group) {
              <span class="chip text-white" [style.background-color]="f.group.color">{{ f.group.name }}</span>
            }
            <span class="chip bg-mist text-muted">{{ f.category }}</span>
          </div>
          <div>
            <p class="label">Porción</p>
            <p class="font-bold">{{ f.portionText }}@if (f.portionGrams) { · {{ f.portionGrams }} g}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            @for (x of macroList(f); track x.label) {
              <div class="rounded-xl bg-canvas p-3 text-center">
                <p class="text-xs font-bold text-muted uppercase">{{ x.label }}</p>
                <p class="text-lg font-extrabold">{{ x.value }}</p>
              </div>
            }
          </div>
          @if (f.glycemicIndex !== null) {
            <p class="rounded-xl bg-canvas px-4 py-3 text-sm">
              Índice glucémico <b>{{ f.glycemicIndex }}</b> · carga glucémica por porción
              <b>{{ load(f).value }}</b> ({{ loadLabels[load(f).level] }}).
              <span class="text-muted">IG bajo ≤ 55, medio 56–69, alto ≥ 70.</span>
            </p>
          }
          @if (f.notes) {
            <p class="text-sm text-muted">{{ f.notes }}</p>
          }

          <div>
            <h3 class="mb-2 font-extrabold">Equivalentes</h3>
            @if (!f.group) {
              <p class="text-sm text-muted">Este alimento no tiene grupo de intercambio.</p>
            } @else if (loadingEquivalents()) {
              <div class="space-y-2"><div class="skeleton h-9"></div><div class="skeleton h-9"></div></div>
            } @else if (!equivalents().length) {
              <p class="text-sm text-muted">No hay otros alimentos en este grupo.</p>
            } @else {
              <ul class="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                @for (e of equivalents(); track e.id) {
                  <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span class="flex min-w-0 items-center gap-2">
                      <app-food-thumb [imageId]="e.imageId" [name]="e.name" [color]="e.group?.color" [size]="28" />
                      <span class="min-w-0">
                        <span class="font-bold">{{ e.name }}</span>
                        <span class="text-muted"> · {{ e.portionText }}</span>
                      </span>
                      <app-gi-badge [value]="e.glycemicIndex" />
                    </span>
                    <span class="shrink-0 text-xs text-muted">{{ e.kcal }} kcal</span>
                  </li>
                }
              </ul>
            }
          </div>

          <p class="text-xs text-muted">Valores de referencia; la decisión clínica es profesional.</p>
          <app-error [message]="detailError()" />

          @if (f.source === 'CUSTOM') {
            <div class="flex justify-end gap-2">
              <button class="btn-danger" [disabled]="deleting()" (click)="remove(f)"><app-icon name="trash" size="sm" /> Borrar</button>
              <button class="btn-primary" (click)="openForm(f)"><app-icon name="edit" size="sm" /> Editar</button>
            </div>
          }
        </div>
      </app-modal>
    }

    @if (editing(); as e) {
      <app-food-form [food]="e.food" [systems]="systems()" mode="custom" (closed)="editing.set(null)" (saved)="afterSave()" />
    }
  `,
})
export class Foods implements OnInit {
  protected readonly image = imageUrl;
  protected readonly loadLabels = { LOW: 'baja', MEDIUM: 'media', HIGH: 'alta' };
  protected load(f: Food) {
    return glycemicLoad(f.glycemicIndex ?? 0, f.choG);
  }

  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);

  protected readonly tabs = SOURCE_TABS;
  protected readonly sourceLabels = foodSourceLabels;

  protected readonly systems = signal<ExchangeSystem[]>([]);
  protected readonly foods = signal<Food[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly source = signal('ALL');
  protected readonly groupKey = signal<string | null>(null);
  protected search = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  protected readonly detail = signal<Food | null>(null);
  protected readonly equivalents = signal<Food[]>([]);
  protected readonly loadingEquivalents = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly editing = signal<{ food: Food | null } | null>(null);

  // Ambos sistemas comparten las claves de grupo; se muestran una vez cada una.
  protected readonly groups = computed<ExchangeGroup[]>(() => {
    const systems = this.systems();
    const preferred = this.source() === 'TRADITIONAL' ? systems.find((s) => s.code.includes('TRAD')) : systems.find((s) => s.code.includes('PAN'));
    const ordered = preferred ? [preferred, ...systems.filter((s) => s !== preferred)] : systems;
    const seen = new Set<string>();
    const out: ExchangeGroup[] = [];
    for (const s of ordered) {
      for (const g of s.groups) {
        if (seen.has(g.key)) continue;
        seen.add(g.key);
        out.push(g);
      }
    }
    return out;
  });

  async ngOnInit() {
    void this.loadFoods();
    try {
      this.systems.set(await this.api.get<ExchangeSystem[]>('/exchange-systems'));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar los grupos de intercambio.'));
    }
  }

  protected async loadFoods() {
    const id = ++this.requestId;
    const params = new URLSearchParams();
    if (this.search.trim()) params.set('search', this.search.trim());
    if (this.source() !== 'ALL') params.set('source', this.source());
    const key = this.groupKey();
    if (key) params.set('groupKey', key);
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await this.api.get<Food[]>(`/foods?${params.toString()}`);
      if (id === this.requestId) this.foods.set(list);
    } catch (err) {
      if (id === this.requestId) this.error.set(errorMessage(err, 'No pudimos cargar los alimentos.'));
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected setSource(key: string) {
    this.source.set(key);
    void this.loadFoods();
  }

  protected setGroup(key: string | null) {
    this.groupKey.set(key);
    void this.loadFoods();
  }

  protected searchChanged() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadFoods(), 300);
  }

  protected macroList(f: Food) {
    return [
      { label: 'Kcal', value: f.kcal },
      { label: 'Carb.', value: `${f.choG} g` },
      { label: 'Prot.', value: `${f.proG} g` },
      { label: 'Grasa', value: `${f.fatG} g` },
      { label: 'Fibra', value: f.fiberG === null ? '—' : `${f.fiberG} g` },
    ];
  }

  protected async openDetail(f: Food) {
    this.detail.set(f);
    this.detailError.set(null);
    this.equivalents.set([]);
    if (!f.group) return;
    this.loadingEquivalents.set(true);
    try {
      const list = await this.api.get<Food[]>(`/foods/${f.id}/equivalents`);
      if (this.detail()?.id === f.id) this.equivalents.set(list);
    } catch (err) {
      this.detailError.set(errorMessage(err, 'No pudimos cargar los equivalentes.'));
    } finally {
      this.loadingEquivalents.set(false);
    }
  }

  protected openForm(food: Food | null) {
    this.detail.set(null);
    this.editing.set({ food });
  }

  protected afterSave() {
    this.editing.set(null);
    void this.loadFoods();
  }

  protected async remove(f: Food) {
    const ok = await this.dialog.confirm({
      title: `¿Borrar «${f.name}»?`,
      message: 'Si ya se usó en planes o recetas, solo se ocultará para no alterarlos.',
      confirmLabel: 'Borrar',
      tone: 'danger',
      icon: 'trash',
    });
    if (!ok) return;
    this.deleting.set(true);
    try {
      await this.api.delete(`/foods/${f.id}`);
      this.detail.set(null);
      this.foods.update((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      this.detailError.set(errorMessage(err, 'No pudimos borrar el alimento.'));
    } finally {
      this.deleting.set(false);
    }
  }
}
