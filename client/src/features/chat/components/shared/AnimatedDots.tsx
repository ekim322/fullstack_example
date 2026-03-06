import styles from "./AnimatedDots.module.css";

export function AnimatedDots() {
  return (
    <span className={styles.animatedDots}>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
