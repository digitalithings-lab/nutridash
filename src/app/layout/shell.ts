import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { initials } from '../core/format';
import { Icon } from '../shared/icon';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
}

const NUTRITIONIST_NAV: NavItem[] = [
  { label: 'Inicio', icon: 'home', link: '/inicio' },
  { label: 'Pacientes', icon: 'users', link: '/pacientes' },
  { label: 'Agenda', icon: 'calendar', link: '/agenda' },
  { label: 'Alimentos', icon: 'apple', link: '/alimentos' },
  { label: 'Recetas', icon: 'book', link: '/recetas' },
  { label: 'Informes', icon: 'document', link: '/informes' },
  { label: 'Soporte', icon: 'lifebuoy', link: '/soporte' },
  { label: 'Configuración', icon: 'cog', link: '/configuracion' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Resumen', icon: 'chart', link: '/admin', exact: true },
  { label: 'Cuentas', icon: 'users', link: '/admin/cuentas' },
  { label: 'Planes', icon: 'list', link: '/admin/planes' },
  { label: 'Catálogo', icon: 'apple', link: '/admin/catalogo' },
  { label: 'Soporte', icon: 'lifebuoy', link: '/admin/soporte' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="min-h-screen lg:flex">
      <!-- Barra superior en móvil -->
      <div class="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <a routerLink="/" class="flex items-center gap-2 text-lg font-extrabold text-brand-700">
          <img src="favicon.svg" alt="" class="size-7" /> NutriPro
        </a>
        <button class="rounded-lg p-2 hover:bg-mist" (click)="menuOpen.set(!menuOpen())" aria-label="Abrir menú">
          <app-icon name="menu" />
        </button>
      </div>

      <aside
        class="fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-line bg-white px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen"
        [class.flex]="menuOpen()"
        [class.hidden]="!menuOpen()"
      >
        <a routerLink="/" class="mb-8 flex items-center gap-2.5 px-2">
          <img src="favicon.svg" alt="" class="size-9" />
          <span>
            <span class="block text-xl leading-tight font-extrabold text-brand-700">NutriPro</span>
            <span class="block text-xs text-muted">{{ auth.isAdmin() ? 'Administración' : 'Tu consulta, en un solo lugar' }}</span>
          </span>
        </a>

        <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Secciones">
          @for (item of nav(); track item.link) {
            <a
              [routerLink]="item.link"
              routerLinkActive="bg-brand-50 !text-brand-700"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-canvas hover:text-ink"
              (click)="menuOpen.set(false)"
            >
              <app-icon [name]="item.icon" />
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="mt-4 flex items-center gap-3 border-t border-line px-2 pt-4">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {{ userInitials() }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold">{{ auth.user()?.fullName }}</p>
            <p class="truncate text-xs text-muted">{{ auth.user()?.email }}</p>
          </div>
          <button class="rounded-lg p-2 text-muted hover:bg-mist hover:text-ink" (click)="auth.logout()" aria-label="Cerrar sesión" title="Cerrar sesión">
            <app-icon name="logout" />
          </button>
        </div>
      </aside>

      @if (menuOpen()) {
        <div class="fixed inset-0 z-30 bg-ink/30 lg:hidden" (click)="menuOpen.set(false)"></div>
      }

      <main class="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div class="mx-auto max-w-7xl"><router-outlet /></div>
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);
  protected readonly nav = computed(() => (this.auth.isAdmin() ? ADMIN_NAV : NUTRITIONIST_NAV));
  protected readonly userInitials = computed(() => initials(this.auth.user()?.fullName ?? ''));
}
