import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { API_URL } from '../../core/config';
import { compressImage, fileSize, MAX_FILE_BYTES, readBase64 } from '../../core/files';
import { formatDate } from '../../core/format';
import { LabResult } from '../../core/types';
import { DialogService } from '../../shared/dialog';
import { Icon } from '../../shared/icon';
import { ErrorBanner } from '../../shared/ui';

export interface PatientFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  labResultId: string | null;
  createdAt: string;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

// Archivos adjuntos del expediente: resultados de laboratorio en PDF, fotos de estudios, etc.
@Component({
  selector: 'app-patient-files',
  imports: [FormsModule, Icon, ErrorBanner],
  template: `
    <section class="card mt-5">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-extrabold">Archivos adjuntos</h2>
        <span class="text-xs text-muted">PDF, JPG, PNG o WebP · hasta 3 MB</span>
      </div>
      <p class="mb-4 text-sm text-muted">Sube los resultados del laboratorio o fotos de estudios y asócialos a un examen.</p>

      <div class="flex flex-wrap items-end gap-3 rounded-xl bg-canvas p-3">
        <div class="min-w-48 flex-1">
          <label class="label" for="file-lab">Asociar a</label>
          <select id="file-lab" class="input" [(ngModel)]="labId">
            <option value="">Expediente general</option>
            @for (l of labs(); track l.id) {
              <option [value]="l.id">{{ l.name }} · {{ date(l.takenOn) }}</option>
            }
          </select>
        </div>
        <label class="btn-primary cursor-pointer" [class.opacity-50]="uploading()">
          <app-icon name="plus" size="sm" /> {{ uploading() ? 'Subiendo…' : 'Subir archivo' }}
          <input type="file" class="sr-only" [accept]="accept" [disabled]="uploading()" (change)="upload($event)" />
        </label>
      </div>

      <app-error class="mt-3 block" [message]="error()" />

      @if (files().length) {
        <ul class="mt-4 divide-y divide-line rounded-xl border border-line">
          @for (f of files(); track f.id) {
            <li class="flex items-center gap-3 px-3 py-2.5">
              <span class="grid size-10 shrink-0 place-items-center rounded-lg" [class]="f.mimeType === 'application/pdf' ? 'bg-coral-100 text-coral-700' : 'bg-sky-100 text-sky-700'">
                <app-icon [name]="f.mimeType === 'application/pdf' ? 'document' : 'eye'" size="sm" />
              </span>
              <div class="min-w-0 flex-1">
                <button type="button" class="block max-w-full cursor-pointer truncate text-left text-sm font-bold hover:text-brand-700 hover:underline" (click)="open(f)">{{ f.name }}</button>
                <p class="text-xs text-muted">
                  {{ labName(f.labResultId) }} · {{ size(f.size) }} · {{ date(f.createdAt) }}
                </p>
              </div>
              <button type="button" class="btn-ghost btn-sm" (click)="open(f)" aria-label="Ver archivo"><app-icon name="eye" size="sm" /></button>
              <button type="button" class="btn-ghost btn-sm text-danger-500" (click)="remove(f)" aria-label="Eliminar archivo"><app-icon name="trash" size="sm" /></button>
            </li>
          }
        </ul>
      } @else if (loaded()) {
        <p class="mt-4 text-sm text-muted">Aún no hay archivos adjuntos.</p>
      }
    </section>
  `,
})
export class PatientFiles {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(DialogService);

  readonly patientId = input.required<string>();
  readonly labs = input<LabResult[]>([]);

  protected readonly accept = ACCEPT;
  protected readonly files = signal<PatientFile[]>([]);
  protected readonly loaded = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected labId = '';
  protected readonly date = (iso: string) => formatDate(iso, 'short');
  protected readonly size = fileSize;

  // Cantidad de adjuntos por examen, para mostrarla en la tabla de laboratorios.
  readonly countByLab = computed(() => {
    const map = new Map<string, number>();
    for (const f of this.files()) if (f.labResultId) map.set(f.labResultId, (map.get(f.labResultId) ?? 0) + 1);
    return map;
  });

  constructor() {
    effect(() => {
      this.patientId();
      void this.load();
    });
  }

  private async load() {
    try {
      this.files.set(await this.api.get<PatientFile[]>(`/patients/${this.patientId()}/files`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar los archivos.'));
    } finally {
      this.loaded.set(true);
    }
  }

  protected labName(id: string | null) {
    if (!id) return 'Expediente general';
    return this.labs().find((l) => l.id === id)?.name ?? 'Examen';
  }

  // Preselecciona un examen (desde la tabla) para adjuntarle un archivo.
  selectLab(id: string) {
    this.labId = id;
  }

  protected async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    if (!ACCEPT.split(',').includes(file.type)) return this.error.set('Usa un PDF o una imagen JPG, PNG o WebP.');

    this.uploading.set(true);
    try {
      // Las fotos se comprimen; los PDF se suben tal cual.
      let blob: Blob = file;
      let mimeType = file.type;
      let name = file.name;
      if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
        blob = await compressImage(file, 2000, 0.85);
        mimeType = 'image/jpeg';
        name = name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
      }
      if (blob.size > MAX_FILE_BYTES) {
        this.error.set(`El archivo pesa ${fileSize(blob.size)}; el máximo es 3 MB.`);
        return;
      }
      const created = await this.api.post<PatientFile>(`/patients/${this.patientId()}/files`, {
        name,
        mimeType,
        data: await readBase64(blob),
        labResultId: this.labId || undefined,
      });
      this.files.update((list) => [created, ...list]);
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos subir el archivo.'));
    } finally {
      this.uploading.set(false);
    }
  }

  // Abre el archivo en una pestaña nueva (se descarga con la sesión).
  protected async open(f: PatientFile) {
    const tab = window.open('', '_blank');
    try {
      const blob = await firstValueFrom(this.http.get(`${API_URL}/files/${f.id}`, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      this.error.set(errorMessage(err, 'No pudimos abrir el archivo.'));
    }
  }

  protected async remove(f: PatientFile) {
    const ok = await this.dialog.confirm({
      title: '¿Eliminar este archivo?',
      details: [
        { label: 'Archivo', value: f.name },
        { label: 'Asociado a', value: this.labName(f.labResultId) },
      ],
      confirmLabel: 'Eliminar',
      tone: 'danger',
      icon: 'trash',
    });
    if (!ok) return;
    try {
      await this.api.delete(`/files/${f.id}`);
      this.files.update((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos eliminar el archivo.'));
    }
  }
}
