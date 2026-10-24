import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';
import { MealPlan } from '../../core/types';

// Estado del plan que se está editando, compartido por todos los pasos del editor.
// Cada cambio se guarda en el backend, que devuelve el plan completo con totales y validación.
@Injectable()
export class PlanStore {
  private readonly api = inject(ApiService);

  readonly plan = signal<MealPlan | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly readonly = computed(() => this.plan()?.status !== 'DRAFT');
  readonly groups = computed(() => this.plan()?.system.groups ?? []);

  async load(id: string) {
    this.error.set(null);
    try {
      this.plan.set(await this.api.get<MealPlan>(`/meal-plans/${id}`));
    } catch (err) {
      this.error.set(errorMessage(err, 'No pudimos cargar el plan.'));
    }
  }

  groupName(key: string): string {
    return this.groups().find((g) => g.key === key)?.name ?? key;
  }

  groupColor(key: string): string {
    return this.groups().find((g) => g.key === key)?.color ?? '#97a8a2';
  }

  // Ejecuta una petición que devuelve el plan actualizado. Devuelve false si falló.
  async run(method: 'put' | 'post' | 'patch' | 'delete', path: string, body?: unknown): Promise<boolean> {
    const plan = this.plan();
    if (!plan) return false;
    this.saving.set(true);
    this.error.set(null);
    try {
      const url = `/meal-plans/${plan.id}${path}`;
      const updated =
        method === 'delete' ? await this.api.delete<MealPlan>(url) : await this.api[method]<MealPlan>(url, body ?? {});
      this.plan.set(updated);
      return true;
    } catch (err) {
      this.error.set(errorMessage(err, 'No se pudo guardar el cambio.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
