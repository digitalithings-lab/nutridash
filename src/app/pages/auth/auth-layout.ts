import { Component, input } from '@angular/core';

// Marco de las pantallas de acceso: presentación a la izquierda y formulario a la derecha.
@Component({
  selector: 'app-auth-layout',
  template: `
    <div class="grid min-h-screen lg:grid-cols-2">
      <section class="relative hidden flex-col justify-between overflow-hidden bg-hero p-12 text-white lg:flex">
        <div class="flex items-center gap-3">
          <img src="favicon.svg" alt="" class="size-10 rounded-xl ring-2 ring-white/30" />
          <span class="text-2xl font-extrabold">NutriPro</span>
        </div>
        <div class="relative z-10">
          <h2 class="text-4xl leading-tight font-extrabold">Tu consulta nutricional,<br />en un solo lugar.</h2>
          <p class="mt-4 max-w-md text-lg text-white/85">
            Evaluación, cálculo de calorías, intercambios tradicionales y de Panamá, planes alimentarios y seguimiento.
            Tú decides; NutriPro hace las cuentas.
          </p>
          <ul class="mt-8 grid max-w-md grid-cols-2 gap-3 text-sm">
            @for (f of features; track f) {
              <li class="rounded-xl bg-white/10 px-4 py-3 font-semibold">{{ f }}</li>
            }
          </ul>
        </div>
        <p class="text-sm text-white/70">Expedientes privados para cada nutricionista</p>
        <div class="absolute -right-24 -bottom-24 size-96 rounded-full bg-hero-soft/50"></div>
      </section>

      <section class="flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-md">
          <div class="mb-8 flex items-center gap-2 lg:hidden">
            <img src="favicon.svg" alt="" class="size-8" />
            <span class="text-xl font-extrabold text-brand-700">NutriPro</span>
          </div>
          <h1 class="text-3xl font-extrabold tracking-tight">{{ title() }}</h1>
          <p class="mt-1 mb-8 text-muted">{{ subtitle() }}</p>
          <ng-content />
        </div>
      </section>
    </div>
  `,
})
export class AuthLayout {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  protected readonly features = ['Cálculos automáticos y manuales', 'Intercambios de Panamá', 'Planes en PDF', 'Seguimiento y evolución'];
}
