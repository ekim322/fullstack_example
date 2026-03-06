import { useCallback, useEffect, useState } from "react";

import { AppShell } from "./AppShell";
import { LoginGate } from "../features/auth/components";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "../features/auth/state/authPersistence";
import type { AuthSession } from "../features/auth/types";
import { isSessionExpired } from "../features/auth/utils/sessionExpiry";
import { subscribeToInvalidSession } from "../shared/sessionInvalidation";

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const handleLogout = useCallback(() => {
    clearAuthSession();
    setSession(null);
  }, []);

  useEffect(() => {
    return subscribeToInvalidSession(() => {
      handleLogout();
    });
  }, [handleLogout]);

  if (!session) {
    return (
      <LoginGate
        onAuthenticated={(nextSession) => {
          if (isSessionExpired(nextSession.expiresAt)) {
            clearAuthSession();
            setSession(null);
            return;
          }

          saveAuthSession(nextSession);
          setSession(nextSession);
        }}
      />
    );
  }

  return (
    <AppShell
      key={session.userId}
      userId={session.userId}
      authToken={session.token}
      onLogout={handleLogout}
    />
  );
}
