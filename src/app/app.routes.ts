import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from './core/auth.service';
import { guestOnly, requireRole } from './core/guards';
import { Shell } from './layout/shell';

const home = () => {
  const auth = inject(AuthService);
  return auth.user() ? auth.home() : '/login';
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: home },
  { path: 'login', title: 'Iniciar sesión · NutriPro', canActivate: [guestOnly], loadComponent: () => import('./pages/auth/login').then((m) => m.Login) },
  { path: 'registro', title: 'Crear cuenta · NutriPro', canActivate: [guestOnly], loadComponent: () => import('./pages/auth/register').then((m) => m.Register) },

  // Espacio de trabajo de la nutricionista.
  {
    path: '',
    component: Shell,
    canActivate: [requireRole('NUTRITIONIST')],
    children: [
      { path: 'inicio', title: 'Inicio · NutriPro', loadComponent: () => import('./pages/home').then((m) => m.Home) },
      { path: 'agenda', title: 'Agenda · NutriPro', loadComponent: () => import('./pages/agenda').then((m) => m.Agenda) },
      { path: 'pacientes', title: 'Pacientes · NutriPro', loadComponent: () => import('./pages/patients/patients').then((m) => m.Patients) },
      {
        path: 'pacientes/:patientId',
        title: 'Expediente · NutriPro',
        loadComponent: () => import('./pages/patients/patient-detail').then((m) => m.PatientDetail),
      },
      {
        path: 'pacientes/:patientId/consultas/nueva',
        title: 'Nueva consulta · NutriPro',
        loadComponent: () => import('./pages/consultations/consultation-form').then((m) => m.ConsultationForm),
      },
      {
        path: 'consultas/:consultationId',
        title: 'Consulta · NutriPro',
        loadComponent: () => import('./pages/consultations/consultation-form').then((m) => m.ConsultationForm),
      },
      { path: 'planes/:planId', title: 'Plan alimentario · NutriPro', loadComponent: () => import('./pages/plans/plan-editor').then((m) => m.PlanEditor) },
      { path: 'calculadora', title: 'Calculadora · NutriPro', loadComponent: () => import('./pages/calculator').then((m) => m.Calculator) },
      { path: 'alimentos', title: 'Alimentos · NutriPro', loadComponent: () => import('./pages/catalog/foods').then((m) => m.Foods) },
      { path: 'recetas', title: 'Recetas · NutriPro', loadComponent: () => import('./pages/catalog/recipes').then((m) => m.Recipes) },
      { path: 'informes', title: 'Informes · NutriPro', loadComponent: () => import('./pages/reports').then((m) => m.Reports) },
      { path: 'soporte', title: 'Soporte · NutriPro', loadComponent: () => import('./pages/support').then((m) => m.Support) },
      { path: 'configuracion', title: 'Configuración · NutriPro', loadComponent: () => import('./pages/settings').then((m) => m.Settings) },
    ],
  },

  // Administración general.
  {
    path: 'admin',
    component: Shell,
    canActivate: [requireRole('ADMIN')],
    children: [
      { path: '', title: 'Resumen · NutriPro', loadComponent: () => import('./pages/admin/overview').then((m) => m.AdminOverviewPage) },
      { path: 'cuentas', title: 'Cuentas · NutriPro', loadComponent: () => import('./pages/admin/accounts').then((m) => m.AdminAccounts) },
      { path: 'planes', title: 'Planes · NutriPro', loadComponent: () => import('./pages/admin/plans').then((m) => m.AdminPlans) },
      { path: 'catalogo', title: 'Catálogo · NutriPro', loadComponent: () => import('./pages/admin/catalog').then((m) => m.AdminCatalog) },
      { path: 'soporte', title: 'Soporte · NutriPro', loadComponent: () => import('./pages/admin/support').then((m) => m.AdminSupport) },
    ],
  },

  { path: '**', redirectTo: home },
];
