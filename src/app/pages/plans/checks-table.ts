import { Component, input } from '@angular/core';
import { Check } from '../../core/types';
import { Icon } from '../../shared/icon';

// Tabla objetivo vs. calculado con la diferencia y si está dentro de la tolerancia.
@Component({
  selector: 'app-checks-table',
  imports: [Icon],
  template: `
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      @for (c of checks(); track c.key) {
        <div class="rounded-xl border px-4 py-3" [class]="c.ok ? 'border-brand-200 bg-brand-50' : 'border-coral-500/40 bg-coral-100'">
          <div class="flex items-center justify-between">
            <p class="text-xs font-bold text-muted uppercase">{{ c.label }}</p>
            <app-icon [name]="c.ok ? 'check' : 'warning'" size="sm" [class]="c.ok ? 'text-brand-600' : 'text-coral-700'" />
          </div>
          <p class="mt-1 text-lg font-extrabold">
            {{ c.actual }} <span class="text-sm font-semibold text-muted">/ {{ c.target }} {{ c.key === 'kcal' ? 'kcal' : 'g' }}</span>
          </p>
          <p class="text-xs font-bold" [class]="c.ok ? 'text-brand-700' : 'text-coral-700'">
            {{ c.diffPct > 0 ? '+' : '' }}{{ c.diffPct }} %
          </p>
        </div>
      }
    </div>
  `,
})
export class ChecksTable {
  readonly checks = input.required<Check[]>();
}
