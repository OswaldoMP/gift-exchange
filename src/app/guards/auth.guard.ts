import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocalDbService } from '../services/local-db.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const localDb = inject(LocalDbService);
  try {
    const { data } = await localDb.getSession();
    const session = data.session;
    if (session?.user) {
      if (!localStorage.getItem('uuid')) {
        localStorage.setItem('uuid', session.user.id);
      }
      return true;
    }
  } catch (error) {
    console.error('[AuthGuard] Error checking session', error);
  }
  return router.createUrlTree(['/login']);
};
