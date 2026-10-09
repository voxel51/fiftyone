import styles from "./Pixelating.module.css";

/** The loading overlay's label */
const Pixelating = () => (
  <div className={styles.label} role="status" aria-label="Loading samples">
    pixelating
    <span className={styles.dot} />
    <span className={styles.dot} />
    <span className={styles.dot} />
  </div>
);

export default Pixelating;
