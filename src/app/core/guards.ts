import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './types';

// Solo deja pasar a quien tiene el rol indicado; si no, lo manda a su inicio o al login.
export const requireRole =
  (role: Role): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.parseUrl('/login');
    return user.role === role ? true : router.parseUrl(auth.home());
  };

export const guestOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.user() ? router.parseUrl(auth.home()) : true;
};
