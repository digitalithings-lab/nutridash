import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { ExchangeGroup, ExchangeSystem, Food, FoodSource } from '../../core/types';
import { glycemicLoad } from '../../core/calc';
import { compressImage, imageUrl, MAX_FILE_BYTES, readBase64 } from '../../core/files';
import { GiBadge } from '../../shared/food';
import { ErrorBanner, Modal } from '../../shared/ui';

interface FoodModel {
  name: string;
  category: string;
  groupId: string;
  portionText: string;
  portionGrams: number | null;
  kcal: number | null;
  choG: number | null;
  proG: number | null;
  fatG: number | null;
  fiberG: number | null;
  glycemicIndex: number | null;
  brand: string;
  notes: string;
  source: FoodSource;
  active: boolean;
}

// Formulario de alimento. En modo "custom" crea alimentos propios de la nutricionista;
// en modo "catalog" (administración) crea o edita alimentos del catálogo general.
@Component({
  selector: 'app-food-form',
  imports: [FormsModule, Modal, ErrorBanner, GiBadge],
  template: `
    <app-modal [title]="food() ? 'Editar alimento' : 'Nuevo alimento'" [wide]="true" (closed)="closed.emit()">
      <form class="space-y-4" (ngSubmit)="save()">
        <div class="flex flex-col gap-4 sm:flex-row">
          <div class="shrink-0">
            <span class="label">Foto</span>
            <label class="group relative grid size-32 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line-strong bg-canvas hover:border-brand-500">
              @if (preview(); as p) {
                <img [src]="p" alt="Foto del alimento" class="size-full object-cover" />
              } @else {
                <span class="px-3 text-center text-xs font-semibold text-muted">Agregar foto<br />JPG, PNG o WebP</span>
              }
              <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="pickImage($event)" aria-label="Elegir foto del alimento" />
            </label>
            @if (preview()) {
              <button type="button" class="btn-ghost btn-sm mt-1 w-full text-danger-500" (click)="clearImage()">Quitar foto</button>
            }
          </div>
          <div class="grid flex-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label" for="ff-name">Nombre</label>
              <input id="ff-name" class="input" name="name" maxlength="100" [(ngModel)]="m.name" required />
            </div>
            <div>
              <label class="label" for="ff-brand">Marca (opcional)</label>
              <input id="ff-brand" class="input" name="brand" maxlength="60" placeholder="Para productos de supermercado" [(ngModel)]="m.brand" />
            </div>
            <div>
              <label class="label" for="ff-category">Categoría</label>
              <input id="ff-category" class="input" name="category" maxlength="60" placeholder="Ej.: Tubérculos" [(ngModel)]="m.category" required />
            </div>
          </div>
        </div>

        <div>
          <label class="label" for="ff-group">Grupo de intercambio</label>
          <select id="ff-group" class="input" name="groupId" [(ngModel)]="m.groupId" (ngModelChange)="groupChanged()">
            <option value="">Sin grupo</option>
            @for (s of systems(); track s.id) {
              <optgroup [label]="s.name">
                @for (g of s.groups; track g.id) {
                  <option [value]="g.id">{{ g.name }}</option>
                }
              </optgroup>
            }
          </select>
          @if (group(); as g) {
            <div class="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
              <span>Valores del grupo: <b>{{ g.kcal }} kcal</b> · C {{ g.choG }} g · P {{ g.proG }} g · G {{ g.fatG }} g</span>
              @if (g.portionHint) {
                <span class="text-muted">({{ g.portionHint }})</span>
              }
              <button type="button" class="btn-secondary btn-sm ml-auto" (click)="fillFromGroup(g)">Rellenar macros</button>
            </div>
          }
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="ff-portion">Porción</label>
            <input id="ff-portion" class="input" name="portionText" maxlength="80" placeholder="Ej.: ½ taza" [(ngModel)]="m.portionText" required />
          </div>
          <div>
            <label class="label" for="ff-grams">Gramos por porción</label>
            <input id="ff-grams" class="input" type="number" min="0" step="0.1" name="portionGrams" [(ngModel)]="m.portionGrams" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <div>
            <label class="label" for="ff-kcal">Kcal</label>
            <input id="ff-kcal" class="input" type="number" min="0" step="0.1" name="kcal" [(ngModel)]="m.kcal" required />
          </div>
          <div>
            <label class="label" for="ff-cho">Carbohidratos (g)</label>
            <input id="ff-cho" class="input" type="number" min="0" step="0.1" name="choG" [(ngModel)]="m.choG" required />
          </div>
          <div>
            <label class="label" for="ff-pro">Proteínas (g)</label>
            <input id="ff-pro" class="input" type="number" min="0" step="0.1" name="proG" [(ngModel)]="m.proG" required />
          </div>
          <div>
            <label class="label" for="ff-fat">Grasas (g)</label>
            <input id="ff-fat" class="input" type="number" min="0" step="0.1" name="fatG" [(ngModel)]="m.fatG" required />
          </div>
          <div>
            <label class="label" for="ff-fiber">Fibra (g)</label>
            <input id="ff-fiber" class="input" type="number" min="0" step="0.1" name="fiberG" [(ngModel)]="m.fiberG" />
          </div>
          <div>
            <label class="label" for="ff-gi">Índice glucémico</label>
            <input id="ff-gi" class="input" type="number" min="0" max="110" step="1" name="glycemicIndex" placeholder="Opcional" [(ngModel)]="m.glycemicIndex" />
          </div>
        </div>
        @if (giInfo(); as gi) {
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <app-gi-badge [value]="m.glycemicIndex" />
            @if (gi.load) {
              <span>Carga glucémica por porción: <b>{{ gi.load.value }}</b> ({{ loadLabels[gi.load.level] }})</span>
            }
          </div>
        }

        @if (mode() === 'catalog') {
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="ff-source">Base</label>
              <select id="ff-source" class="input" name="source" [(ngModel)]="m.source">
                <option value="PANAMA">Panamá</option>
                <option value="TRADITIONAL">Tradicional</option>
              </select>
            </div>
            <label class="flex items-center gap-2 self-end pb-2.5 text-sm font-bold">
              <input type="checkbox" class="size-4 accent-brand-600" name="active" [(ngModel)]="m.active" /> Activo (visible para las nutricionistas)
            </label>
          </div>
        }

        <div>
          <label class="label" for="ff-notes">Notas</label>
          <textarea id="ff-notes" class="input" rows="2" maxlength="500" name="notes" [(ngModel)]="m.notes"></textarea>
        </div>

        <p class="text-xs text-muted">Valores nutricionales de referencia; la decisión clínica es profesional.</p>
        <app-error [message]="error()" />
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="closed.emit()">Cancelar</button>
          <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar alimento' }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class FoodForm implements OnInit {
  private readonly api = inject(ApiService);

  readonly food = input<Food | null>(null);
  readonly systems = input<ExchangeSystem[]>([]);
  readonly mode = input<'custom' | 'catalog'>('custom');
  readonly saved = output<void>();
  readonly closed = output<void>();

  protected m: FoodModel = {
    name: '',
    category: '',
    groupId: '',
    portionText: '',
    portionGrams: null,
    kcal: null,
    choG: null,
    proG: null,
    fatG: null,
    fiberG: null,
    glycemicIndex: null,
    brand: '',
    notes: '',
    source: 'PANAMA',
    active: true,
  };
  private readonly groupId = signal('');
  protected readonly preview = signal<string | null>(null);
  private newImage: Blob | null = null;
  private removeImage = false;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly loadLabels = { LOW: 'baja', MEDIUM: 'media', HIGH: 'alta' };

  // Clasificación del IG y carga glucémica con los valores escritos.
  protected giInfo() {
    const gi = this.m.glycemicIndex;
    if (gi === null || gi === undefined || String(gi) === '') return null;
    const cho = Number(this.m.choG);
    return { load: cho >= 0 && this.m.choG !== null ? glycemicLoad(Number(gi), cho) : null };
  }

  protected readonly group = computed<ExchangeGroup | null>(() => {
    const id = this.groupId();
    for (const s of this.systems()) {
      const g = s.groups.find((x) => x.id === id);
      if (g) return g;
    }
    return null;
  });

  ngOnInit() {
    const f = this.food();
    if (f) {
      this.m = {
        name: f.name,
        category: f.category,
        groupId: f.groupId ?? '',
        portionText: f.portionText,
        portionGrams: f.portionGrams,
        kcal: f.kcal,
        choG: f.choG,
        proG: f.proG,
        fatG: f.fatG,
        fiberG: f.fiberG,
        glycemicIndex: f.glycemicIndex,
        brand: f.brand ?? '',
        notes: f.notes ?? '',
        source: f.source === 'CUSTOM' ? 'PANAMA' : f.source,
        active: f.active,
      };
      this.groupId.set(this.m.groupId);
      this.preview.set(imageUrl(f.imageId));
    }
  }

  // ─── Foto ───

  protected async pickImage(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return this.error.set('Elige una imagen (JPG, PNG o WebP).');
    try {
      const blob = await compressImage(file);
      if (blob.size > MAX_FILE_BYTES) return this.error.set('La imagen pesa más de 3 MB incluso comprimida.');
      this.newImage = blob;
      this.removeImage = false;
      this.preview.set(URL.createObjectURL(blob));
      this.error.set(null);
    } catch {
      this.error.set('No pudimos leer la imagen.');
    }
  }

  protected clearImage() {
    this.newImage = null;
    this.removeImage = !!this.food()?.imageId;
    this.preview.set(null);
  }

  protected groupChanged() {
    this.groupId.set(this.m.groupId);
    // Si el formulario aún no tiene macros, se rellenan solos.
    const g = this.group();
    if (g && this.m.kcal === null && this.m.choG === null && this.m.proG === null && this.m.fatG === null) this.fillFromGroup(g);
  }

  protected fillFromGroup(g: ExchangeGroup) {
    this.m.kcal = g.kcal;
    this.m.choG = g.choG;
    this.m.proG = g.proG;
    this.m.fatG = g.fatG;
  }

  protected async save() {
    this.error.set(null);
    const m = this.m;
    if (m.name.trim().length < 2) return this.error.set('El nombre debe tener al menos 2 caracteres.');
    if (m.category.trim().length < 2) return this.error.set('Indica la categoría.');
    if (!m.portionText.trim()) return this.error.set('Indica la porción.');
    if ([m.kcal, m.choG, m.proG, m.fatG].some((v) => v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) < 0)) {
      return this.error.set('Completa kcal y macronutrientes (valores de 0 o más).');
    }
    const opt = (v: number | null) => (v === null || v === undefined || String(v) === '' ? null : Number(v));
    const body: Record<string, unknown> = {
      name: m.name.trim(),
      category: m.category.trim(),
      groupId: m.groupId || null,
      portionText: m.portionText.trim(),
      portionGrams: opt(m.portionGrams),
      kcal: Number(m.kcal),
      choG: Number(m.choG),
      proG: Number(m.proG),
      fatG: Number(m.fatG),
      fiberG: opt(m.fiberG),
      glycemicIndex: opt(m.glycemicIndex),
      brand: m.brand.trim() || null,
      notes: m.notes.trim(),
    };
    if (body['glycemicIndex'] !== null && (Number(body['glycemicIndex']) < 0 || Number(body['glycemicIndex']) > 110)) {
      return this.error.set('El índice glucémico va de 0 a 110.');
    }
    if (this.mode() === 'catalog') {
      body['source'] = m.source;
      body['active'] = m.active;
    }
    const base = this.mode() === 'catalog' ? '/admin/foods' : '/foods';
    const current = this.food();
    this.saving.set(true);
    try {
      const savedFood = current
        ? await this.api.patch<{ id: string }>(`${base}/${current.id}`, body)
        : await this.api.post<{ id: string }>(base, body);
      // La foto se sube aparte, una vez que el alimento existe.
      if (this.newImage) {
        await this.api.post(`/foods/${savedFood.id}/image`, { mimeType: 'image/jpeg', data: await readBase64(this.newImage) });
      } else if (this.removeImage) {
        await this.api.delete(`/foods/${savedFood.id}/image`);
      }
      this.saved.emit();
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos guardar el alimento.'));
    } finally {
      this.saving.set(false);
    }
  }
}
