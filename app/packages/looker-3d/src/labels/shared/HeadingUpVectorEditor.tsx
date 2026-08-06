import { Button, Variant } from "@voxel51/voodo";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CuboidResizeFace } from "../../annotation/cuboid-face-resize";
import { isValidHeadingUpFacePair } from "../../annotation/cuboid-heading-relabel";
import {
  useSetHeadingUpEditorHover,
  useSetHeadingUpPreview,
} from "../../state/accessors";
import { HeadingUpVectorFields } from "./HeadingUpVectorFields";

// Keeps the popup fully on-screen when the click was near a viewport edge.
const VIEWPORT_MARGIN = 8;

export interface HeadingUpVectorEditorProps {
  labelId: string;
  /** Viewport coordinates (e.g. from the triggering click) to anchor near. */
  anchor: { x: number; y: number };
  initialHeadingFace: CuboidResizeFace;
  initialUpFace: CuboidResizeFace;
  onApply: (headingFace: CuboidResizeFace, upFace: CuboidResizeFace) => void;
  onClose: () => void;
}

/**
 * Floating popup opened from the heading arrow's "Edit heading/up vector"
 * context-menu item. Lets an annotator pick which face carries the heading
 * and which carries "up" directly, rather than only dragging the heading
 * arrow (which infers "up" for you). Apply is disabled — with a warning —
 * whenever the two picks land on the same axis, since a box can't have
 * heading and up on the same line.
 *
 * Positions itself fixed at `anchor`, then nudges itself back on-screen post
 * mount if that would run it off a viewport edge — same idea as
 * `ContextMenu`'s own `pickAnchor`, just measured against this popup's actual
 * size instead of guessed ahead of time.
 */
export const HeadingUpVectorEditor = ({
  labelId,
  anchor,
  initialHeadingFace,
  initialUpFace,
  onApply,
  onClose,
}: HeadingUpVectorEditorProps) => {
  const [headingFace, setHeadingFace] = useState(initialHeadingFace);
  const [upFace, setUpFace] = useState(initialUpFace);
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchor);
  const setPreview = useSetHeadingUpPreview();
  const setEditorHover = useSetHeadingUpEditorHover();

  // Clears the preview/hover if the popup closes/unmounts with the pointer
  // still over it — otherwise the ghost arrow or suppressed gizmo would get
  // stuck after Cancel.
  useEffect(() => {
    return () => {
      setPreview(null);
      setEditorHover(null);
    };
  }, [setPreview, setEditorHover]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - height - VIEWPORT_MARGIN;
    setPosition({
      x: Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(anchor.y, maxY)),
    });
    // Only re-clamp when the anchor itself changes (a new right-click) —
    // not on every re-render, which would fight the user repositioning
    // nothing since this popup doesn't drag, but keeps the effect cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const isValid = isValidHeadingUpFacePair(headingFace, upFace);

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2000,
        background: "var(--color-content-bg-card-elevated, #1a1a1a)",
        border: "1px solid var(--color-border, #444)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)",
        padding: 12,
        width: 220,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
      // Keeps r3f's own pointer handling (drag, etc.) from seeing clicks meant
      // for this form.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <HeadingUpVectorFields
        headingFace={headingFace}
        upFace={upFace}
        onHeadingChange={setHeadingFace}
        onUpChange={setUpFace}
        onHeadingFaceHover={(face) =>
          setPreview(face ? { labelId, role: "heading", face } : null)
        }
        onUpFaceHover={(face) =>
          setPreview(face ? { labelId, role: "up", face } : null)
        }
        onHoverActiveChange={(active) =>
          setEditorHover(active ? { labelId } : null)
        }
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant={Variant.Secondary} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={Variant.Primary}
          disabled={!isValid}
          onClick={() => onApply(headingFace, upFace)}
        >
          Apply
        </Button>
      </div>
    </div>
  );
};
