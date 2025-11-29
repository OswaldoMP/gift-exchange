import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase-service.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);
  try {
    const { data } = await supabase.getSession();
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
