'use client';

import { useCallback, useEffect, useState } from 'react';
import { BespokeMemoryModal } from './BespokeMemoryModal';
import { ProfileModal } from './ProfileModal';
import {
  cacheProfileLocally,
  fetchSessionSnapshot,
  type GmailStatus,
  type SessionSnapshot,
  type UserProfile
} from '@/lib/session';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';

export function Sidebar() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [isBespokeMemoryModalOpen, setIsBespokeMemoryModalOpen] = useState(false);
  const [localIdentity, setLocalIdentity] = useState<{ name: string }>({ name: '' });
  const connectUrl = `${GATEWAY_URL}/api/gmail/connect`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const name = localStorage.getItem('plutoProfileName') || '';
    setLocalIdentity({ name });
  }, []);

  const refreshSession = useCallback(
    async (initial = false) => {
      if (initial) {
        setSessionLoading(true);
      }
      try {
        const snapshot = await fetchSessionSnapshot();
        setSession(snapshot);
        cacheProfileLocally(snapshot.profile);
      } catch (error) {
        console.error('Failed to load session', error);
        if (initial) {
          setSession(null);
        }
      } finally {
        if (initial) {
          setSessionLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    refreshSession(true);
    const intervalId = setInterval(() => {
      if (!cancelled) {
        refreshSession(false);
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [refreshSession]);

  const gmailStatus: GmailStatus = session?.gmail ?? { connected: false };
  const profile: UserProfile | null = session?.profile ?? null;
  const gmailLoading = sessionLoading || disconnecting;

  const handleProfileUpdated = (nextProfile: UserProfile | null) => {
    setSession((prev) => {
      if (!prev) {
        return {
          gmail: { connected: false },
          profile: nextProfile
        };
      }
      return {
        ...prev,
        profile: nextProfile
      };
    });
    cacheProfileLocally(nextProfile);
  };

  async function handleGmailAction() {
    if (gmailStatus.connected) {
      if (disconnecting) return;
      setDisconnecting(true);
      try {
        const response = await fetch(`${GATEWAY_URL}/api/gmail/disconnect`, {
          method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to disconnect Gmail');
        setSession((prev) => {
          const nextProfile = prev?.profile ?? null;
          return {
            gmail: { connected: false },
            profile: nextProfile
          };
        });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('plutoOnboarded');
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Failed to disconnect Gmail', error);
      } finally {
        setDisconnecting(false);
      }
    } else {
      window.open(connectUrl, '_blank', 'width=520,height=620');
    }
  }

  const displayName =
    profile?.preferredName || profile?.fullName || localIdentity.name || gmailStatus.name || 'Operator';
  const initials = (displayName || 'P')
    .split(' ')
    .map((token) => token.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div className="sidebar-root">
        <div>
          <h1>PLUTO</h1>
        </div>
        <section className="sidebar-section">
          <div className="connections-grid">
            <button
              type="button"
              className="connection-button memory"
              onClick={() => setIsBespokeMemoryModalOpen(true)}
            >
              <div>
                <p className="connection-title">Bespoke Memory</p>
                <p className="text-muted connection-subtitle">Ingest your memories.</p>
              </div>
            </button>
          </div>
        </section>
        <section className="profile-identity-card">
          <button type="button" className="profile-identity-button" onClick={() => setIsProfileOpen(true)}>
            <div className="profile-avatar">{initials || 'P'}</div>
            <div>
              <p className="profile-identity-name">{displayName}</p>
            </div>
          </button>
        </section>
      </div>
      {isProfileOpen && (
        <ProfileModal
          profile={profile}
          loading={sessionLoading}
          gmailStatus={gmailStatus}
          gmailLoading={gmailLoading}
          onGmailAction={handleGmailAction}
          onOpenBespoke={() => setIsBespokeMemoryModalOpen(true)}
          onClose={() => setIsProfileOpen(false)}
          onProfileUpdated={handleProfileUpdated}
        />
      )}
      {isBespokeMemoryModalOpen && (
        <BespokeMemoryModal onClose={() => setIsBespokeMemoryModalOpen(false)} />
      )}
    </>
  );
}
