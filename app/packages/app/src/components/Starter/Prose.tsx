/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { PropsWithChildren } from "react";

import styles from "./Starter.module.css";

/** A link inside a sentence: underlined, losing the rule on hover. */
export function ProseLink({
  children,
  href,
}: PropsWithChildren<{ href: string }>) {
  return (
    <a className={styles.prose} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** Reads as a link inside a sentence, acts as a button. */
export function ProseButton({
  children,
  onClick,
}: PropsWithChildren<{ onClick: () => void }>) {
  return (
    <button
      className={`${styles.prose} ${styles.proseButton}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
