import {
  AppointmentStatus,
  AppointmentType,
  ConsultationType,
  ExchangeMode,
  FoodSource,
  MealPlanStatus,
  Sex,
  SubscriptionStatus,
  TicketStatus,
} from './types';

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type Badge = { label: string; classes: string };

export const sexLabels: Record<Sex, string> = { FEMALE: 'Femenino', MALE: 'Masculino' };

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  FIRST_VISIT: 'Primera consulta',
  CONTROL: 'Control',
  FOLLOW_UP: 'Seguimiento',
};

export const appointmentStatusLabels: Record<AppointmentStatus, Badge> = {
  REQUESTED: { label: 'Por confirmar', classes: 'bg-amber-100 text-amber-700' },
  REJECTED: { label: 'Rechazada', classes: 'bg-mist text-muted' },
  SCHEDULED: { label: 'Programada', classes: 'bg-sky-100 text-sky-700' },
  COMPLETED: { label: 'Atendida', classes: 'bg-brand-100 text-brand-700' },
  CANCELLED: { label: 'Cancelada', classes: 'bg-mist text-muted' },
  NO_SHOW: { label: 'No asistió', classes: 'bg-danger-100 text-danger-500' },
};

export const consultationTypeLabels: Record<ConsultationType, string> = {
  INITIAL: 'Evaluación inicial',
  FOLLOW_UP: 'Seguimiento',
};

export const planStatusLabels: Record<MealPlanStatus, Badge> = {
  DRAFT: { label: 'Borrador', classes: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Aprobado', classes: 'bg-brand-100 text-brand-700' },
  ARCHIVED: { label: 'Archivado', classes: 'bg-mist text-muted' },
};

export const exchangeModeLabels: Record<ExchangeMode, { label: string; hint: string }> = {
  TRADITIONAL: { label: 'Tradicional', hint: 'Listas clásicas de intercambio' },
  PANAMA: { label: 'Panamá', hint: 'Alimentos y porciones de Panamá' },
  COMBINED: { label: 'Combinado', hint: 'Equivalencias tradicionales con alimentos de ambas bases' },
};

export const foodSourceLabels: Record<FoodSource, Badge> = {
  TRADITIONAL: { label: 'Tradicional', classes: 'bg-sky-100 text-sky-700' },
  PANAMA: { label: 'Panamá', classes: 'bg-brand-100 text-brand-700' },
  CUSTOM: { label: 'Propio', classes: 'bg-violet-100 text-violet-500' },
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, Badge> = {
  TRIAL: { label: 'Prueba', classes: 'bg-amber-100 text-amber-700' },
  ACTIVE: { label: 'Activa', classes: 'bg-brand-100 text-brand-700' },
  PAST_DUE: { label: 'Pago pendiente', classes: 'bg-coral-100 text-coral-700' },
  CANCELLED: { label: 'Cancelada', classes: 'bg-mist text-muted' },
};

export const ticketStatusLabels: Record<TicketStatus, Badge> = {
  OPEN: { label: 'Abierta', classes: 'bg-amber-100 text-amber-700' },
  ANSWERED: { label: 'Respondida', classes: 'bg-brand-100 text-brand-700' },
  CLOSED: { label: 'Cerrada', classes: 'bg-mist text-muted' },
};

// Fechas sin hora (YYYY-MM-DD o ISO a mediodía UTC): se muestran sin moverlas de día.
export function formatDate(iso: string | null | undefined, style: 'long' | 'short' = 'long'): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return new Intl.DateTimeFormat('es', {
    timeZone: 'UTC',
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency }).format(cents / 100);
}

// Porciones: 1, 1.5, 0.25 → "1", "1½", "¼".
export function servings(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  const symbol = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac as 0.25 | 0.5 | 0.75];
  if (frac === 0) return String(whole);
  if (symbol) return whole ? `${whole}${symbol}` : symbol;
  return String(Math.round(n * 10) / 10);
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : '';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

// Fecha local de hoy en formato YYYY-MM-DD.
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convierte "" en null para enviar formularios con campos opcionales vacíos.
export function emptyToNull<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  return out as T;
}
