import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/auth.interceptor';
import { formatDate, formatDateTime, ticketStatusLabels } from '../core/format';
import { SupportTicket } from '../core/types';
import { Icon } from '../shared/icon';
import { Badge, Empty, ErrorBanner, PageHeader } from '../shared/ui';

@Component({
  selector: 'app-support',
  imports: [FormsModule, Icon, Badge, Empty, ErrorBanner, PageHeader],
  template: `
    <app-page-header title="Soporte" subtitle="Escríbenos tus dudas, problemas o solicitudes de cambio de plan." />

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section class="card h-fit">
        <h2 class="mb-4 flex items-center gap-2 text-lg font-extrabold"><app-icon name="lifebuoy" /> Nueva solicitud</h2>
        <form class="space-y-4" (ngSubmit)="send()">
          <div>
            <label class="label" for="sp-subject">Asunto</label>
            <input id="sp-subject" class="input" name="subject" maxlength="120" [(ngModel)]="subject" required />
          </div>
          <div>
            <label class="label" for="sp-message">Mensaje</label>
            <textarea id="sp-message" class="input" rows="6" name="message" maxlength="4000" [(ngModel)]="message" required></textarea>
            <p class="mt-1 text-right text-xs text-soft">{{ message.length }}/4000</p>
          </div>
          <app-error [message]="formError()" />
          @if (sent()) {
            <p class="rounded-xl bg-brand-100 px-4 py-3 text-sm font-semibold text-brand-700">Recibimos tu solicitud. Te responderemos pronto.</p>
          }
          <button type="submit" class="btn-primary w-full" [disabled]="sending()">{{ sending() ? 'Enviando…' : 'Enviar solicitud' }}</button>
        </form>
      </section>

      <section>
        <h2 class="mb-3 text-lg font-extrabold">Tus solicitudes</h2>
        <app-error [message]="error()" />
        @if (loading()) {
          <div class="space-y-3">
            <div class="skeleton h-24"></div>
            <div class="skeleton h-24"></div>
          </div>
        } @else if (!tickets().length) {
          <div class="card"><app-empty emoji="💬" title="Sin solicitudes" text="Cuando nos escribas, verás aquí el estado y la respuesta." /></div>
        } @else {
          <ul class="space-y-3">
            @for (t of tickets(); track t.id) {
              <li class="card">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-bold text-ink">{{ t.subject }}</p>
                    <p class="text-xs text-muted">{{ date(t.createdAt) }}</p>
                  </div>
                  <app-badge [badge]="statusLabels[t.status]" />
                </div>
                <p class="mt-2 text-sm whitespace-pre-line text-ink">{{ t.message }}</p>
                @if (t.reply) {
                  <div class="mt-3 rounded-xl bg-brand-50 p-3">
                    <p class="text-xs font-bold text-brand-700">Respuesta del equipo · {{ t.repliedAt ? dateTime(t.repliedAt) : '' }}</p>
                    <p class="mt-1 text-sm whitespace-pre-line">{{ t.reply }}</p>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class Support implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly statusLabels = ticketStatusLabels;
  protected readonly date = formatDate;
  protected readonly dateTime = formatDateTime;

  protected readonly tickets = signal<SupportTicket[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected subject = '';
  protected message = '';
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly formError = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.tickets.set(await this.api.get<SupportTicket[]>('/support'));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar tus solicitudes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async send() {
    this.formError.set(null);
    this.sent.set(false);
    const subject = this.subject.trim();
    const message = this.message.trim();
    if (subject.length < 3) return this.formError.set('El asunto debe tener al menos 3 caracteres.');
    if (message.length < 5) return this.formError.set('Cuéntanos un poco más en el mensaje.');
    this.sending.set(true);
    try {
      const ticket = await this.api.post<SupportTicket>('/support', { subject, message });
      this.tickets.update((list) => [ticket, ...list]);
      this.subject = '';
      this.message = '';
      this.sent.set(true);
    } catch (err) {
      this.formError.set(errorMessage(err, 'No pudimos enviar tu solicitud.'));
    } finally {
      this.sending.set(false);
    }
  }
}
