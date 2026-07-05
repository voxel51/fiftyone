import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import React, { useEffect } from "react";
import { useTemporalTagContext } from "./TemporalTagContext";
import styles from "./TemporalTag.module.css";

/**
 * Toggle button for entering/exiting temporal tag selection mode.
 * Also registers the `Shift+T` hotkey (unless an input is focused) — plain
 * `T` belongs to the 3D tile's trained top-view shortcut.
 * Renders nothing when the temporal-tag context is absent.
 */
const TemporalTagButton: React.FC = () => {
  const ctx = useTemporalTagContext();

  useEffect(() => {
    if (!ctx?.onTagCreate) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is inside a text input.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (
        (e.key === "t" || e.key === "T") &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (ctx.state.phase === "idle") {
          ctx.actions.enterTagMode();
        } else {
          ctx.actions.exitTagMode();
        }
      }
      if (e.key === "Escape" && ctx.state.phase !== "idle") {
        ctx.actions.exitTagMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ctx]);

  if (!ctx?.onTagCreate) return null;

  const active = ctx.state.phase !== "idle";

  return (
    <Button
      variant={Variant.Icon}
      size={Size.Xs}
      data-cy="temporal-tag-mode-button"
      leadingIcon={IconName.Tag}
      aria-label={active ? "Exit tag mode" : "Enter tag mode (Shift+T)"}
      aria-pressed={active}
      className={active ? styles.tagButtonActive : undefined}
      onClick={() =>
        active ? ctx.actions.exitTagMode() : ctx.actions.enterTagMode()
      }
      title={active ? "Exit tag mode (Shift+T)" : "Add temporal tag (Shift+T)"}
    />
  );
};

export default TemporalTagButton;
