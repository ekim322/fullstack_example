import type { StreamLogEntry } from "../../types";
import styles from "./StreamLog.module.css";

type StreamLogProps = {
  entries: StreamLogEntry[];
};

function formatTs(ts: number): string {
  const date = Number.isFinite(ts) ? new Date(ts * 1000) : new Date();
  return date.toLocaleTimeString();
}

export function StreamLog({ entries }: StreamLogProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h3>Execution Stream</h3>
        <span>{entries.length} events</span>
      </header>

      <div className={styles.logList} aria-live="polite">
        {entries.length === 0 ? (
          <p className={styles.emptyState}>No events yet. Send a message to start streaming.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={styles.logItem}>
              <div className={styles.logMeta}>
                <strong>{entry.type}</strong>
                <code>{entry.entryId}</code>
                <time>{formatTs(entry.ts)}</time>
              </div>
              <p>{entry.text || "(empty chunk)"}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
