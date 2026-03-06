import styles from "./ToolArguments.module.css";

type ToolArgumentsProps = {
  parsedArgs: Record<string, unknown> | null;
  callContent: string;
};

export function ToolArguments({ parsedArgs, callContent }: ToolArgumentsProps) {
  if (!parsedArgs) {
    return (
      <pre className={styles.toolCodePre}>
        <code className={styles.toolCode}>{callContent || "{}"}</code>
      </pre>
    );
  }

  const entries = Object.entries(parsedArgs);
  if (entries.length === 0) {
    return <div className={styles.noParameters}>No parameters</div>;
  }

  return (
    <div className={styles.argsTable}>
      {entries.map(([key, value]) => (
        <div key={key} className={styles.argRow}>
          <span className={styles.argKey}>{key}:</span>
          <span className={typeof value === "string" ? styles.argValueString : styles.argValueOther}>
            {typeof value === "string" ? `"${value}"` : JSON.stringify(value, null, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}
