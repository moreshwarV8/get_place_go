import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Resolves whether the current user holds the 'admin' role (from public.user_roles).
 * RLS lets a user read their own role rows, so this select is safe and self-scoped.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    // `user_roles` is not in the generated types yet, hence the cast.
    (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (!active) return;
        setIsAdmin(!!data);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return { isAdmin, loading };
}
