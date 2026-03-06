import styles from "./ToolOutput.module.css";

type ToolOutputProps = {
  resultContent: string;
  isError: boolean;
};

export function ToolOutput({ resultContent, isError }: ToolOutputProps) {
  return (
    <pre className={styles.toolCodePre}>
      <code className={`${styles.toolCode} ${isError ? styles.toolCodeError : ""}`}>
        {resultContent || "No output"}
      </code>
    </pre>
  );
}
