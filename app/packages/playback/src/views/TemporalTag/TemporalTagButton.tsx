import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import React, { useEffect } from "react";
import { useTemporalTagContext } from "./TemporalTagContext";
import styles from "./TemporalTag.module.css";

/**
 * Toggle button for entering/exiting temporal tag selection mode.
 * Also registers the `T` hotkey (unless an input is focused).
 * Renders nothing when the temporal-tag context is absent.
 */
const TemporalTagButton: React.FC = () => {
  const ctx = useTemporalTagContext();

  useEffect(() => {
    if (!ctx) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is inside a text input.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "t" || e.key === "T") {
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
      data-testid="temporal-tag-mode-button"
      leadingIcon={IconName.Tag}
      aria-label={active ? "Exit tag mode" : "Enter tag mode (T)"}
      aria-pressed={active}
      className={active ? styles.tagButtonActive : undefined}
      onClick={() =>
        active ? ctx.actions.exitTagMode() : ctx.actions.enterTagMode()
      }
      title={active ? "Exit tag mode (T)" : "Add temporal tag (T)"}
    />
  );
};

export default TemporalTagButton;
