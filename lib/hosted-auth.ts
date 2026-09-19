/** Browser Supabase session lifecycle for the official hosted Windie UI. */

import { useCallback, useEffect, useState } from 'react';
import { rememberDeviceReturn, restoreDeviceReturn } from './device-route';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;

export type HostedAuthState = {
  session: Session | null;
  isLoading: boolean;
  isSigningIn: boolean;
  configurationError: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

/** Restores and refreshes the only browser credential accepted by windie-server. */
export function useHostedAuth(): HostedAuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error: restoreError }) => {
      if (!active) return;
      if (data.session) restoreDeviceReturn();
      setSession(data.session);
      setError(restoreError ? 'Unable to restore your Windie sign-in.' : null);
      setIsLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      if (nextSession) restoreDeviceReturn();
      setSession(nextSession);
      setIsSigningIn(false);
      setIsLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    setIsSigningIn(true);
    rememberDeviceReturn();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (signInError) {
      setError('We could not start Google sign-in. Please try again shortly.');
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return {
    session,
    isLoading,
    isSigningIn,
    configurationError: supabase
      ? null
      : 'Windie sign-in is not configured for this build.',
    error,
    signInWithGoogle,
    signOut,
  };
}
