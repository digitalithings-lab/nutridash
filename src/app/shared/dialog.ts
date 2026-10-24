import { Component, effect, HostListener, inject, Injectable, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from './icon';

type Tone = 'primary' | 'danger';

interface DialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  // Datos de contexto que se muestran en un recuadro (p. ej. paciente y hora de la cita).
  details?: { label: string; value: string }[];
  confirmLabel: string;
  cancelLabel: string;
  tone: Tone;
  icon: string;
  inputLabel?: string;
  placeholder?: string;
  suggestions?: string[];
  maxLength: number;
  resolve: (value: boolean | string | null) => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  icon?: string;
}

export interface PromptOptions extends ConfirmOptions {
  inputLabel?: string;
  placeholder?: string;
  suggestions?: string[];
  maxLength?: number;
}

// Ventanas de confirmación y de texto con el diseño del dashboard, en lugar de confirm() y prompt() del navegador.
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogRequest | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) =>
      this.current.set({
        kind: 'confirm',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        tone: 'primary',
        icon: options.tone === 'danger' ? 'warning' : 'check',
        maxLength: 0,
        ...options,
        resolve: (value) => resolve(value === true),
      } as DialogRequest),
    );
  }

  // Devuelve el texto escrito ('' si lo dejó vacío) o null si canceló.
  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) =>
      this.current.set({
        kind: 'prompt',
        confirmLabel: 'Aceptar',
        cancelLabel: 'Cancelar',
        tone: 'primary',
        icon: 'edit',
        maxLength: 500,
        ...options,
        resolve: (value) => resolve(typeof value === 'string' ? value : null),
      } as DialogRequest),
    );
  }

  close(value: boolean | string | null) {
    const request = this.current();
    this.current.set(null);
    request?.resolve(value);
  }
}

@Component({
  selector: 'app-dialog-host',
  imports: [FormsModule, Icon],
  template: `
    @if (dialog.current(); as d) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center" (click)="dialog.close(d.kind === 'prompt' ? null : false)">
        <div
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-card"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="d.title"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-4">
            <span
              class="grid size-11 shrink-0 place-items-center rounded-xl"
              [class]="d.tone === 'danger' ? 'bg-danger-100 text-danger-500' : 'bg-brand-100 text-brand-700'"
            >
              <app-icon [name]="d.icon" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-lg font-extrabold text-ink">{{ d.title }}</h2>
              @if (d.message) {
                <p class="mt-1 text-sm text-muted">{{ d.message }}</p>
              }
            </div>
          </div>

          @if (d.details?.length) {
            <dl class="mt-4 space-y-1.5 rounded-xl bg-canvas p-4 text-sm">
              @for (item of d.details; track item.label) {
                <div class="flex justify-between gap-4">
                  <dt class="text-muted">{{ item.label }}</dt>
                  <dd class="text-right font-semibold text-ink">{{ item.value }}</dd>
                </div>
              }
            </dl>
          }

          @if (d.kind === 'prompt') {
            <label class="label mt-5" for="dialog-input">{{ d.inputLabel ?? 'Mensaje' }}</label>
            <textarea
              id="dialog-input"
              class="input min-h-24 resize-none"
              [placeholder]="d.placeholder ?? ''"
              [maxLength]="d.maxLength"
              [(ngModel)]="text"
              (keydown.meta.enter)="dialog.close(text.trim())"
              (keydown.control.enter)="dialog.close(text.trim())"
              autofocus
            ></textarea>
            <div class="mt-1 flex justify-end text-xs text-soft">{{ text.length }}/{{ d.maxLength }}</div>
            @if (d.suggestions?.length) {
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (s of d.suggestions; track s) {
                  <button type="button" class="chip cursor-pointer bg-mist text-muted hover:bg-brand-100 hover:text-brand-700" (click)="text = s">
                    {{ s }}
                  </button>
                }
              </div>
            }
          }

          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" class="btn-outline" (click)="dialog.close(d.kind === 'prompt' ? null : false)">{{ d.cancelLabel }}</button>
            <button
              type="button"
              [class]="d.tone === 'danger' ? 'btn bg-danger-500 text-white hover:opacity-90' : 'btn-primary'"
              (click)="dialog.close(d.kind === 'prompt' ? text.trim() : true)"
            >
              {{ d.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);
  protected text = '';

  constructor() {
    // Cada ventana nueva empieza con el campo vacío.
    effect(() => {
      if (this.dialog.current()) this.text = '';
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    const d = this.dialog.current();
    if (d) this.dialog.close(d.kind === 'prompt' ? null : false);
  }
}
