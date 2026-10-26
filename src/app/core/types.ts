// Tipos de las respuestas del backend usadas en el dashboard.

export type Role = 'NUTRITIONIST' | 'ADMIN' | 'PATIENT';
export type Sex = 'FEMALE' | 'MALE';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
export type AppointmentType = 'FIRST_VISIT' | 'CONTROL' | 'FOLLOW_UP';
export type AppointmentStatus = 'REQUESTED' | 'REJECTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ConsultationType = 'INITIAL' | 'FOLLOW_UP';
export type CalorieMethod = 'AUTOMATIC' | 'MANUAL';
export type Equation = 'MIFFLIN_ST_JEOR' | 'HARRIS_BENEDICT' | 'FAO_WHO' | 'OWEN' | 'KATCH_MCARDLE' | 'KCAL_PER_KG';
export type ExchangeMode = 'TRADITIONAL' | 'PANAMA' | 'COMBINED';
export type FoodSource = 'TRADITIONAL' | 'PANAMA' | 'CUSTOM';
export type MealPlanStatus = 'DRAFT' | 'APPROVED' | 'ARCHIVED';
export type TicketStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface User {
  id: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  fullName: string;
  licenseNumber: string | null;
  phone: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  linkCode?: string | null;
  country: string;
  timezone: string;
  defaults: { equation: Equation; exchangeMode: ExchangeMode; choPct: number; proPct: number; fatPct: number };
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    plan: { code: string; name: string; maxPatients: number | null };
  } | null;
  createdAt: string;
  usage?: { activePatients: number };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface PatientRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PatientListItem extends PatientRef {
  sex: Sex;
  age: number;
  phone: string | null;
  email: string | null;
  goal: string | null;
  archivedAt: string | null;
  lastConsultation: string | null;
  lastWeightKg: number | null;
  lastBmi: number | null;
  nextAppointment: string | null;
  activePlanKcal: number | null;
}

export interface Background {
  pathological?: string | null;
  family?: string | null;
  surgical?: string | null;
  allergies?: string | null;
  intolerances?: string | null;
  gastrointestinal?: string | null;
  gynecological?: string | null;
  smoking?: string | null;
  alcohol?: string | null;
  physicalActivity?: string | null;
  sleep?: string | null;
  stress?: string | null;
  notes?: string | null;
}

export interface DietHistory {
  mealsPerDay?: number | null;
  recall24h?: string | null;
  foodFrequency?: string | null;
  preferences?: string | null;
  aversions?: string | null;
  waterIntake?: string | null;
  appetite?: string | null;
  eatsOutside?: string | null;
  whoCooks?: string | null;
  supplements?: string | null;
  previousDiets?: string | null;
  notes?: string | null;
}

export interface LabResult {
  id: string;
  takenOn: string;
  name: string;
  value: string;
  unit: string | null;
  reference: string | null;
  notes: string | null;
}

export interface Medication {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  isSupplement: boolean;
  startedOn: string | null;
  endedOn: string | null;
  notes: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  durationMinutes: number;
  type: AppointmentType;
  status: AppointmentStatus;
  notes: string | null;
  requestedByPatient?: boolean;
  responseNote?: string | null;
  patient: PatientRef;
  consultation?: { id: string } | null;
}

export interface MealPlanSummary {
  id: string;
  title: string;
  status: MealPlanStatus;
  targetKcal: number;
  createdAt: string;
  approvedAt: string | null;
  choPct?: number;
  proPct?: number;
  fatPct?: number;
  exchangeMode?: ExchangeMode;
  consultationId?: string | null;
}

export interface Patient extends PatientRef {
  sex: Sex;
  birthDate: string;
  age: number;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  address: string | null;
  reason: string | null;
  goal: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  background: Background | null;
  dietHistory: DietHistory | null;
  labResults: LabResult[];
  medications: Medication[];
  consultations: {
    id: string;
    date: string;
    type: ConsultationType;
    weightKg: number | null;
    diagnosis: string | null;
    adherencePct: number | null;
  }[];
  mealPlans: MealPlanSummary[];
  appointments: Omit<Appointment, 'patient'>[];
}

export interface Indicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  status?: string;
  alert?: boolean;
  formula?: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  appointmentId: string | null;
  type: ConsultationType;
  date: string;
  reason: string | null;
  weightKg: number | null;
  usualWeightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  calfCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  visceralFat: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  clinicalFindings: string | null;
  diagnosis: string | null;
  symptoms: string | null;
  adherencePct: number | null;
  treatmentChanges: string | null;
  notes: string | null;
  nextSteps: string | null;
}

export interface ConsultationDetail extends Consultation {
  patient: PatientRef & { sex: Sex };
  ageYears: number;
  indicators: Indicator[];
  previous: Consultation | null;
  mealPlans: { id: string; title: string; status: MealPlanStatus; targetKcal: number }[];
}

export interface EvolutionPoint {
  consultationId: string;
  date: string;
  type: ConsultationType;
  weightKg: number | null;
  bmi: number | null;
  waistCm: number | null;
  hipCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  whr: number | null;
  adherencePct: number | null;
  symptoms: string | null;
  treatmentChanges: string | null;
}

export interface Evolution {
  points: EvolutionPoint[];
  summary: {
    consultations: number;
    initialWeightKg: number | null;
    currentWeightKg: number | null;
    weightChangeKg: number | null;
    initialBmi: number | null;
    currentBmi: number | null;
  };
}

export interface ExchangeGroup {
  id: string;
  systemId: string;
  key: string;
  family: string;
  name: string;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
  portionHint: string | null;
  color: string;
  sortOrder: number;
}

export interface ExchangeSystem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source: string | null;
  groups: ExchangeGroup[];
}

export interface Food {
  id: string;
  nutritionistId: string | null;
  groupId: string | null;
  source: FoodSource;
  name: string;
  category: string;
  portionText: string;
  portionGrams: number | null;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
  fiberG: number | null;
  glycemicIndex: number | null;
  brand: string | null;
  imageId: string | null;
  notes: string | null;
  active: boolean;
  group: (ExchangeGroup & { system: { code: string } }) | null;
}

export interface Macros {
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
}

export interface Recipe {
  id: string;
  nutritionistId: string | null;
  name: string;
  description: string | null;
  servings: number;
  instructions: string | null;
  ingredients: { id: string; foodId: string; servings: number; note: string | null; food: Food }[];
  totals: Macros;
  perServing: Macros;
  exchangesPerServing: Record<string, number>;
}

export interface Check {
  key: 'kcal' | 'choG' | 'proG' | 'fatG';
  label: string;
  target: number;
  actual: number;
  diffPct: number;
  ok: boolean;
}

export interface PlanItem {
  id: string;
  mealId: string;
  foodId: string | null;
  recipeId: string | null;
  customName: string | null;
  servings: number;
  substituteOfId: string | null;
  notes: string | null;
  food: Food | null;
  recipe: { id: string; name: string } | null;
  macros: Macros;
  exchanges: Record<string, number>;
}

export interface PlanMeal {
  id: string;
  name: string;
  time: string | null;
  sortOrder: number;
  exchanges: Record<string, number>;
  notes: string | null;
  items: PlanItem[];
  plannedTotals: Macros;
  menuTotals: Macros;
  menuExchanges: Record<string, number>;
}

export interface MealPlan {
  id: string;
  patientId: string;
  consultationId: string | null;
  title: string;
  status: MealPlanStatus;
  calorieMethod: CalorieMethod;
  equation: Equation | null;
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  sex: Sex | null;
  bodyFatPct: number | null;
  kcalPerKg: number | null;
  activityFactor: number | null;
  weightBasis: 'AUTO' | 'ACTUAL' | 'IDEAL' | 'ADJUSTED' | null;
  energyWeightKg: number | null;
  energyWeight: { basis: 'ACTUAL' | 'IDEAL' | 'ADJUSTED'; weightKg: number; explanation: string } | null;
  stressFactor: number | null;
  physiologicalStage: string | null;
  physiologicalKcal: number | null;
  exerciseKcal: number | null;
  activityDetail: {
    occupation?: string;
    sedentaryHours?: number;
    exercises: { type: string; met: number; daysPerWeek: number; minutes: number }[];
  } | null;
  restingKcal: number | null;
  totalKcal: number | null;
  adjustmentPct: number | null;
  adjustmentKcal: number | null;
  targetKcal: number;
  choPct: number;
  proPct: number;
  fatPct: number;
  exchangeMode: ExchangeMode;
  systemId: string;
  objectives: string[];
  recommendations: string | null;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: PatientRef & { sex: Sex; birthDate: string; age: number };
  allowedFoodSources: FoodSource[];
  target: Macros;
  proteinPerKg: number | null;
  daily: Record<string, number>;
  exchangeTotals: Macros;
  menuTotals: Macros;
  menuExchanges: Record<string, number>;
  meals: PlanMeal[];
  validation: {
    exchangeChecks: Check[];
    menuChecks: Check[];
    distributionIssues: { key: string; daily: number; assigned: number }[];
    warnings: string[];
    ready: boolean;
  };
  system: ExchangeSystem;
}

export interface HomeSummary {
  stats: { activePatients: number; appointmentsToday: number; pendingFollowUps: number; plansToReview: number; appointmentRequests: number };
  requests: Appointment[];
  today: Appointment[];
  upcoming: Appointment[];
  draftPlans: { id: string; title: string; targetKcal: number; updatedAt: string; patient: PatientRef }[];
  followUps: (PatientRef & { lastConsultation: string | null })[];
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  maxPatients: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
  _count?: { subscriptions: number };
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  user?: { id: string; fullName: string; email: string };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  clinicName: string | null;
  phone: string | null;
  licenseNumber: string | null;
  linkCode: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  patients: number;
  mealPlans: number;
  subscription: {
    planId: string;
    planName: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    notes: string | null;
  } | null;
}

export interface AdminOverview {
  nutritionists: number;
  newSignups: number;
  subscriptions: Partial<Record<SubscriptionStatus, number>>;
  activePatients: number;
  approvedPlans: number;
  openTickets: number;
  monthlyRevenueCents: number;
}
