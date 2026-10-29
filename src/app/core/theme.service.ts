import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'nutripro.theme';

// Modo claro u oscuro: el que elija la persona o, por defecto, el del sistema.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.read());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.apply();
    this.media.addEventListener('change', () => this.apply());
  }

  // Rota entre sistema → claro → oscuro.
  cycle() {
    const next: ThemeMode = this.mode() === 'system' ? 'light' : this.mode() === 'light' ? 'dark' : 'system';
    this.mode.set(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Sin almacenamiento la elección dura lo que la pestaña.
    }
    this.apply();
  }

  private apply() {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && this.media.matches);
    document.documentElement.classList.toggle('dark', dark);
  }

  private read(): ThemeMode {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
