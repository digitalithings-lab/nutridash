import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { formatDateTime, ticketStatusLabels } from '../../core/format';
import { SupportTicket, TicketStatus } from '../../core/types';
import { Badge, Empty, ErrorBanner, Modal, PageHeader, SkeletonCards } from '../../shared/ui';

// Solicitudes de soporte de las nutricionistas: responder y cambiar su estado.
@Component({
  selector: 'app-admin-support',
  imports: [FormsModule, PageHeader, Badge, Empty, ErrorBanner, Modal, SkeletonCards],
  template: `
    <app-page-header title="Soporte" subtitle="Solicitudes de las nutricionistas.">
      <select class="input w-auto" [ngModel]="filter()" (ngModelChange)="setFilter($event)" aria-label="Filtrar por estado">
        <option value="">Todas</option>
        @for (s of statuses; track s) {
          <option [value]="s">{{ labels[s].label }}</option>
        }
      </select>
    </app-page-header>

    <app-error [message]="error()" />

    @if (tickets(); as list) {
      @if (list.length) {
        <div class="space-y-3">
          @for (t of list; track t.id) {
            <button class="card block w-full cursor-pointer text-left transition hover:border-brand-200" (click)="open(t)">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-bold">{{ t.subject }}</p>
                  <p class="text-xs text-muted">{{ t.user?.fullName }} · {{ t.user?.email }} · {{ dateTime(t.createdAt) }}</p>
                </div>
                <app-badge [badge]="labels[t.status]" />
              </div>
              <p class="mt-2 line-clamp-2 text-sm text-muted">{{ t.message }}</p>
            </button>
          }
        </div>
      } @else {
        <div class="card"><app-empty emoji="📭" title="No hay solicitudes" text="Cuando una nutricionista escriba a soporte, aparecerá aquí." /></div>
      }
    } @else if (!error()) {
      <app-skeleton-cards [count]="3" grid="grid-cols-1" />
    }

    @if (selected(); as t) {
      <app-modal [title]="t.subject" (closed)="selected.set(null)">
        <p class="text-xs text-muted">{{ t.user?.fullName }} · {{ t.user?.email }} · {{ dateTime(t.createdAt) }}</p>
        <p class="mt-3 rounded-xl bg-canvas p-4 text-sm whitespace-pre-line">{{ t.message }}</p>
        <label class="label mt-4" for="reply">Respuesta</label>
        <textarea id="reply" class="input min-h-32" [(ngModel)]="reply" maxlength="4000"></textarea>
        <label class="label mt-4" for="status">Estado</label>
        <select id="status" class="input" [(ngModel)]="status">
          @for (s of statuses; track s) {
            <option [value]="s">{{ labels[s].label }}</option>
          }
        </select>
        <app-error class="mt-3 block" [message]="saveError()" />
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" (click)="selected.set(null)">Cancelar</button>
          <button class="btn-primary" [disabled]="saving()" (click)="save(t)">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </app-modal>
    }
  `,
})
export class AdminSupport implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly labels = ticketStatusLabels;
  protected readonly statuses: TicketStatus[] = ['OPEN', 'ANSWERED', 'CLOSED'];
  protected readonly dateTime = formatDateTime;
  protected readonly tickets = signal<SupportTicket[] | null>(null);
  protected readonly filter = signal<TicketStatus | ''>('OPEN');
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<SupportTicket | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected reply = '';
  protected status: TicketStatus = 'ANSWERED';

  ngOnInit() {
    void this.load();
  }

  protected setFilter(value: TicketStatus | '') {
    this.filter.set(value);
    void this.load();
  }

  private async load() {
    this.error.set(null);
    this.tickets.set(null);
    try {
      const q = this.filter() ? `?status=${this.filter()}` : '';
      this.tickets.set(await this.api.get<SupportTicket[]>(`/admin/tickets${q}`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar las solicitudes.'));
    }
  }

  protected open(t: SupportTicket) {
    this.selected.set(t);
    this.reply = t.reply ?? '';
    this.status = t.status === 'OPEN' ? 'ANSWERED' : t.status;
    this.saveError.set(null);
  }

  async save(t: SupportTicket) {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const reply = this.reply.trim();
      await this.api.patch(`/admin/tickets/${t.id}`, { status: this.status, ...(reply && reply !== t.reply ? { reply } : {}) });
      this.selected.set(null);
      await this.load();
    } catch (err) {
      this.saveError.set(errorMessage(err, 'No se pudo guardar.'));
    } finally {
      this.saving.set(false);
    }
  }
}
