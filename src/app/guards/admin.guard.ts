import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocalDbService } from '../services/local-db.service';

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const localDb = inject(LocalDbService);
  const uuid = localStorage.getItem('uuid');
  if (!uuid) {
    return router.createUrlTree(['/login']);
  }
  try {
    const participant = await localDb.getParticipant(uuid);
    if (participant.is_admin) {
      return true;
    }
  } catch (error) {
    console.error('[AdminGuard] Error checking admin role', error);
  }
  return router.createUrlTree(['/intercambio']);
};
