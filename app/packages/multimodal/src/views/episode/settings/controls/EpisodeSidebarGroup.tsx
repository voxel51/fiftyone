import { Size, Text, TextColor, TextVariant, Toggle } from "@voxel51/voodo";
import React, { useId, useState } from "react";
import { settingsBooleanNoSpaceToggleProps } from "./episode-settings-keyboard";
import { EpisodeSettingsTooltip } from "./EpisodeSettingsLabel";
import styles from "./EpisodeSidebarGroup.module.css";

export interface EpisodeSidebarGroupToggle {
  readonly ariaLabel: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/**
 * Collapsible section shared by the episode modal sidebars. The header carries
 * the section title, an optional master on/off switch, and — while collapsed —
 * an optional one-line summary so hidden state stays legible. The switch sits
 * outside the expand/collapse button, so flipping it never folds the group.
 */
const EpisodeSidebarGroup: React.FC<{
  readonly children: React.ReactNode;
  readonly defaultExpanded?: boolean;
  readonly summary?: string;
  readonly title: string;
  readonly tooltip?: string;
  readonly toggle?: EpisodeSidebarGroupToggle;
}> = ({
  children,
  defaultExpanded = true,
  summary,
  title,
  tooltip,
  toggle,
}) => {
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
        {tooltip ? <EpisodeSettingsTooltip tooltip={tooltip} /> : null}
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

export default EpisodeSidebarGroup;
