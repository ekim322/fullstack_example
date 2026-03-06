import type { ReactNode } from "react";

import styles from "./ToolDataSection.module.css";

type ToolDataSectionProps = {
  label: "Arguments" | "Output";
  contentClassName?: string;
  children: ReactNode;
};

export function ToolDataSection({
  label,
  contentClassName,
  children,
}: ToolDataSectionProps) {
  const resolvedContentClassName = `${styles.toolDataContent}${contentClassName ? ` ${contentClassName}` : ""}`;

  return (
    <div className={styles.toolDataSection}>
      <div className={styles.toolDataHeader}>
        <div className={styles.toolDataLabel}>{label}</div>
      </div>
      <div className={resolvedContentClassName}>{children}</div>
    </div>
  );
}
