import { Size, ToggleSwitch } from "@voxel51/voodo";
import type { Descriptor, ToggleSwitchTab } from "@voxel51/voodo";
import React from "react";
import styles from "./EpisodeSidebarTabs.module.css";

/**
 * Shared shell for the episode modal's left and right sidebars: a head (the
 * tab list, with a bottom border separating it from the body) and a body — a
 * single scrollable, consistently-padded region below it for whichever tab
 * is active. Uses `ToggleSwitch`'s default variant for its segmented-pill
 * selected-item look (highlighted background, no underline), but strips its
 * built-in box border in CSS — that border is this component's job (the
 * head/body divider), not the tab switch's. Tab content never sets up its
 * own scrolling or padding — this is the one place that owns it, so left
 * and right stay visually identical and a new tab can't reintroduce a
 * "forgot to make it scroll" layout bug.
 */
const EpisodeSidebarTabs: React.FC<{
  readonly defaultIndex?: number;
  readonly onChange?: (index: number) => void;
  /** Remounts the tab switch (and resets its selection) when it changes. */
  readonly remountKey?: string;
  readonly tabs: Descriptor<ToggleSwitchTab>[];
}> = ({ defaultIndex, onChange, remountKey, tabs }) => {
  return (
    <div className={styles.root}>
      <ToggleSwitch
        key={remountKey}
        className={styles.toggleSwitchRoot}
        defaultIndex={defaultIndex}
        fullWidth
        onChange={onChange}
        size={Size.Sm}
        tabListClassName={styles.tabList}
        tabPanelClassName={styles.tabPanelGroup}
        tabs={tabs}
      />
    </div>
  );
};

export default EpisodeSidebarTabs;
