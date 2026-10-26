import { Component, computed, input } from '@angular/core';
import { glycemicLevel, GlycemicLevel } from '../core/calc';
import { imageUrl } from '../core/files';

export const GLYCEMIC_LABELS: Record<GlycemicLevel, { label: string; classes: string }> = {
  LOW: { label: 'IG bajo', classes: 'bg-brand-100 text-brand-700' },
  MEDIUM: { label: 'IG medio', classes: 'bg-amber-100 text-amber-700' },
  HIGH: { label: 'IG alto', classes: 'bg-coral-100 text-coral-700' },
};

// Etiqueta del índice glucémico: «IG bajo 32».
@Component({
  selector: 'app-gi-badge',
  template: `
    @if (info(); as i) {
      <span class="chip whitespace-nowrap" [class]="i.classes" [title]="'Índice glucémico ' + value() + ' (bajo ≤ 55, medio 56–69, alto ≥ 70)'">{{ i.label }} · {{ value() }}</span>
    }
  `,
})
export class GiBadge {
  readonly value = input<number | null | undefined>(null);
  protected readonly info = computed(() => {
    const v = this.value();
    return v === null || v === undefined ? null : GLYCEMIC_LABELS[glycemicLevel(v)];
  });
}

// Miniatura de la foto de un alimento, o un cuadro con su inicial si no tiene.
@Component({
  selector: 'app-food-thumb',
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="name()" class="shrink-0 rounded-lg object-cover" [style.width.px]="size()" [style.height.px]="size()" loading="lazy" />
    } @else {
      <span
        class="grid shrink-0 place-items-center rounded-lg text-sm font-extrabold text-white"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.background]="color() || '#97a8a2'"
        aria-hidden="true"
      >{{ name().charAt(0).toUpperCase() }}</span>
    }
  `,
})
export class FoodThumb {
  readonly imageId = input<string | null | undefined>(null);
  readonly name = input('');
  readonly color = input<string | null | undefined>(null);
  readonly size = input(40);
  protected readonly url = computed(() => imageUrl(this.imageId()));
}
