import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EpisodeLayoutControls } from "../../../extensions/episode-actions";
import { cameraScopeKey } from "../scope/camera-scope";
import { updateSidebarPreferences } from "../settings/sidebar-preferences";
import { readModalLayout, replaceModalLayout } from "./layout-persistence";
import {
  MAX_PORTABLE_LAYOUT_BYTES,
  parsePortableLayout,
  portableLayoutChangeKey,
  type PortableLayout,
} from "./portable-layout";

interface LayoutHost {
  readonly controls: EpisodeLayoutControls;
  readonly registerCapture: (capture: () => string) => () => void;
}
const LayoutContext = createContext<LayoutHost | null>(null);

/** Edition-neutral capture/apply boundary around one playback host. */
export function PortableLayoutHost({
  children,
  scopeKey,
  mediaField,
}: {
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
  readonly mediaField?: string;
}) {
  const captureRef = useRef<(() => string) | null>(null);
  const [pending, setPending] = useState<{
    layout: PortableLayout;
    scope: string;
    field?: string;
  } | null>(null);
  const host = useMemo<LayoutHost>(
    () => ({
      registerCapture: (capture) => {
        captureRef.current = capture;
        return () => {
          if (captureRef.current === capture) captureRef.current = null;
        };
      },
      controls: {
        scopeKey: cameraScopeKey(scopeKey, mediaField),
        maxBytes: MAX_PORTABLE_LAYOUT_BYTES,
        capture: () => {
          if (!captureRef.current)
            throw new Error("Wait for the layout to finish loading.");
          return captureRef.current();
        },
        validate: (json) => {
          parsePortableLayout(json);
        },
        changeKey: portableLayoutChangeKey,
        apply: (json) => {
          const layout = parsePortableLayout(json);
          if (!scopeKey) throw new Error("This viewer has no layout scope.");
          setPending({ layout, scope: scopeKey, field: mediaField });
        },
      },
    }),
    [mediaField, scopeKey],
  );

  // This effect applies the imported layout after unmount flushes debounced
  // writes and camera cleanup. The next mount uses the ordinary restore path.
  useEffect(() => {
    if (!pending) return;
    const { layout, scope, field } = pending;
    const cameras = readModalLayout(scope)?.cameraPreferences ?? {};
    replaceModalLayout(
      {
        ...layout.modal,
        cameraPreferences: field
          ? { ...cameras, [field]: layout.camera }
          : cameras,
      },
      scope,
    );
    updateSidebarPreferences(
      cameraScopeKey(scope, field),
      () => layout.preferences,
    );
    setPending(null);
  }, [pending]);

  return (
    <LayoutContext.Provider value={host}>
      {pending ? null : children}
    </LayoutContext.Provider>
  );
}

/** Domain hook for edition-contributed header actions. */
export function usePortableLayoutControls(): EpisodeLayoutControls | undefined {
  return useContext(LayoutContext)?.controls;
}

/** Registers a live snapshot producer owned by the local persistence observer. */
export function usePortableLayoutCapture(capture: () => string): void {
  const register = useContext(LayoutContext)?.registerCapture;
  // This effect keeps the host capture callback scoped to the live viewer.
  useEffect(() => register?.(capture), [capture, register]);
}
