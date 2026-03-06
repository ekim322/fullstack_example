import { useState, type FormEvent } from "react";

import { login } from "../api/authApi";
import type { AuthSession } from "../types";
import { isSessionExpired } from "../utils/sessionExpiry";
import styles from "./LoginGate.module.css";

type LoginGateProps = {
  onAuthenticated: (session: AuthSession) => void;
};

export function LoginGate({ onAuthenticated }: LoginGateProps) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = userId.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await login({
        user_id: userId.trim(),
        password,
      });

      if (isSessionExpired(response.expires_at)) {
        setError("Sign-in failed: session is already expired.");
        return;
      }

      onAuthenticated({
        userId: response.user_id,
        token: response.token,
        expiresAt: response.expires_at,
      });
      setPassword("");
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "Unable to sign in";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Sign In</h1>
          <p className={styles.subtitle}>Enter your User ID and shared client password.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>User ID</span>
            <input
              className={styles.input}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button className={styles.submit} type="submit" disabled={!canSubmit}>
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
    </section>
  );
}
