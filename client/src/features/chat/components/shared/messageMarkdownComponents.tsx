import type { Components } from "react-markdown";

import styles from "../messages/MessageThread.module.css";

function withOptionalClassName(baseClassName: string, className: string | undefined): string {
  return className ? `${baseClassName} ${className}` : baseClassName;
}

export const messageMarkdownComponents: Components = {
  p: ({ className, ...props }) => (
    <p className={withOptionalClassName(styles.markdownParagraph, className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre className={withOptionalClassName(styles.markdownPre, className)} {...props} />
  ),
  code: ({ className, ...props }) => (
    <code className={withOptionalClassName(styles.markdownCode, className)} {...props} />
  ),
};
