import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase-service.service';

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);
  const uuid = localStorage.getItem('uuid');
  if (!uuid) {
    return router.createUrlTree(['/login']);
  }
  try {
    const participant = await supabase.getParticipant(uuid);
    if (participant.is_admin) {
      return true;
    }
  } catch (error) {
    console.error('[AdminGuard] Error checking admin role', error);
  }
  return router.createUrlTree(['/intercambio']);
};
