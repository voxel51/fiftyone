import { Size, Text, TextColor, TextVariant, Toggle } from "@voxel51/voodo";
import React, { useId, useState } from "react";
import { settingsBooleanNoSpaceToggleProps } from "./mcap-settings-keyboard";
import styles from "./McapSidebarGroup.module.css";

export interface McapSidebarGroupToggle {
  readonly ariaLabel: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/**
 * Collapsible section shared by the MCAP modal sidebars. The header carries
 * the section title, an optional master on/off switch, and — while collapsed —
 * an optional one-line summary so hidden state stays legible. The switch sits
 * outside the expand/collapse button, so flipping it never folds the group.
 */
const McapSidebarGroup: React.FC<{
  readonly children: React.ReactNode;
  readonly defaultExpanded?: boolean;
  readonly summary?: string;
  readonly title: string;
  readonly toggle?: McapSidebarGroupToggle;
}> = ({ children, defaultExpanded = true, summary, title, toggle }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyId = useId();

  return (
    <section className={styles.group}>
      <div className={styles.header}>
        <button
          aria-controls={bodyId}
          aria-expanded={expanded}
          className={styles.headerButton}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span
            aria-hidden="true"
            className={`${styles.chevron} ${
              expanded ? styles.chevronExpanded : ""
            }`}
          />
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {title}
          </Text>
          {!expanded && summary ? (
            <span className={styles.summary}>{summary}</span>
          ) : null}
        </button>
        {toggle ? (
          <Toggle
            aria-label={toggle.ariaLabel}
            checked={toggle.checked}
            onChange={toggle.onChange}
            size={Size.Sm}
            {...settingsBooleanNoSpaceToggleProps}
          />
        ) : null}
      </div>
      {expanded ? (
        <div className={styles.body} id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
};

export default McapSidebarGroup;
