import { Component, HostListener, input, output } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-page-header',
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-1 text-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2"><ng-content /></div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}

// Tarjetas grises que "respiran" mientras llegan los datos.
@Component({
  selector: 'app-skeleton-cards',
  template: `
    <div class="grid gap-4" [class]="grid()" aria-busy="true" aria-label="Cargando">
      @for (i of items(); track i) {
        <div class="card space-y-3">
          <div class="skeleton h-5 w-1/2"></div>
          <div class="skeleton h-4 w-full"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      }
    </div>
  `,
})
export class SkeletonCards {
  readonly count = input(3);
  readonly grid = input('md:grid-cols-3');
  protected items() {
    return Array.from({ length: this.count() }, (_, i) => i);
  }
}

@Component({
  selector: 'app-empty',
  template: `
    <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span class="text-5xl">{{ emoji() }}</span>
      <p class="font-bold text-ink">{{ title() }}</p>
      <p class="max-w-md text-sm text-muted">{{ text() }}</p>
      <ng-content />
    </div>
  `,
})
export class Empty {
  readonly emoji = input('🥗');
  readonly title = input.required<string>();
  readonly text = input('');
}

@Component({
  selector: 'app-error',
  template: `
    @if (message()) {
      <div class="rounded-xl bg-danger-100 px-4 py-3 text-sm font-semibold text-danger-500" role="alert">{{ message() }}</div>
    }
  `,
})
export class ErrorBanner {
  readonly message = input<string | null>(null);
}

@Component({
  selector: 'app-modal',
  imports: [Icon],
  template: `
    <div class="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center" (click)="closed.emit()">
      <div
        class="max-h-[90vh] w-full animate-pop-in overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-card" [class]="wide() ? 'max-w-3xl' : 'max-w-xl'"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <h2 class="text-xl font-extrabold">{{ title() }}</h2>
          <button class="rounded-full p-1 text-muted hover:bg-mist" (click)="closed.emit()" aria-label="Cerrar">
            <app-icon name="x" />
          </button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  // La tecla Escape también cierra la ventana.
  @HostListener('document:keydown.escape')
  protected onEscape() {
    this.closed.emit();
  }
}

// Tarjeta de cifra del panel principal.
@Component({
  selector: 'app-stat',
  imports: [Icon],
  template: `
    <div class="card flex items-center gap-4">
      <span class="grid size-11 shrink-0 place-items-center rounded-xl" [class]="tone()"><app-icon [name]="icon()" /></span>
      <div class="min-w-0">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">{{ label() }}</p>
        <p class="text-2xl font-extrabold text-ink">{{ value() }}</p>
      </div>
    </div>
  `,
})
export class Stat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('chart');
  readonly tone = input('bg-brand-100 text-brand-700');
}

// Etiqueta de estado con colores.
@Component({
  selector: 'app-badge',
  template: `<span class="chip" [class]="badge().classes">{{ badge().label }}</span>`,
})
export class Badge {
  readonly badge = input.required<{ label: string; classes: string }>();
}

// Pestañas simples controladas desde fuera.
@Component({
  selector: 'app-tabs',
  template: `
    <div class="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1" role="tablist">
      @for (tab of tabs(); track tab.key) {
        <button
          role="tab"
          [attr.aria-selected]="active() === tab.key"
          class="-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-2.5 text-sm font-bold whitespace-nowrap transition"
          [class]="active() === tab.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'"
          (click)="changed.emit(tab.key)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
})
export class Tabs {
  readonly tabs = input.required<{ key: string; label: string }[]>();
  readonly active = input.required<string>();
  readonly changed = output<string>();
}
