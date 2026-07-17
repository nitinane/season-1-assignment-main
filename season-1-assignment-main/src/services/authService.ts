import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export const handleGoogleLogin = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      redirectTo: `${window.location.origin}/`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });

  if (error) {
    console.error("Google login failed:", error);
    throw error;
  }
};

export const getGoogleProviderToken = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;

  console.log("Session:", session);

  return session?.provider_token ?? null;
};

export const initializeAuthListener = () => {
  const { setSession, setUser, setAccessToken, setLoading } = useAuthStore.getState();

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`Auth state change: ${event}`, session);
    
    if (session) {
      setSession(session);
      setUser(session.user);
      // We prioritize provider_token for Gmail, but we still track access_token for Supabase ops
      if (session.provider_token) {
        setAccessToken(session.provider_token);
      }
    } else {
      useAuthStore.getState().clear();
    }
    setLoading(false);
  });
};

export const getGoogleToken = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;

  if (!token) {
    // If not in session, check the store (we might have persisted it there)
    const storeToken = useAuthStore.getState().accessToken;
    if (storeToken) return storeToken;
    
    throw new Error("Google provider token missing. Please re-authenticate.");
  }

  return token;
};

export const signOut = async () => {
  await supabase.auth.signOut();
  useAuthStore.getState().clear();
};

/**
 * Returns the authenticated HR User ID.
 * Used for all scoped database operations.
 */
export const getCurrentUser = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  
  if (!userId) {
    // Fallback to store if session is not immediately available
    const storeUserId = useAuthStore.getState().user?.id;
    if (storeUserId) return storeUserId;
    
    throw new Error("Authentication required. Please log in.");
  }
  
  return userId;
};
