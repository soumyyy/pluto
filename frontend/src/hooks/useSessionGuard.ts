'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cacheProfileLocally, fetchSessionSnapshot, hasActiveSession } from '@/lib/session';

export function useSessionGuard(): boolean {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (typeof window === 'undefined') return;
      try {
        const snapshot = await fetchSessionSnapshot();
        if (hasActiveSession(snapshot)) {
          cacheProfileLocally(snapshot.profile);
          if (!cancelled) {
            setAuthorized(true);
          }
        } else if (!cancelled) {
          setAuthorized(false);
          router.replace('/login');
        }
      } catch {
        if (!cancelled) {
          setAuthorized(false);
          router.replace('/login');
        }
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return authorized;
}
