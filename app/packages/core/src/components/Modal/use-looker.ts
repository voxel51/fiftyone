import * as fos from "@fiftyone/state";
import { useSetRecoilState } from "recoil";
import React, { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import { useClearSelectedLabels, useShowOverlays } from "./ModalLooker";
import { useLookerOptionsUpdate, useModalContext } from "./hooks";
import useKeyEvents from "./use-key-events";
import { shortcutToHelpItems } from "./utils";
import { useViewport } from "./useViewport";

const CLOSE = "close";

function useLooker<L extends fos.Lookers>({
  sample,
  showControls = true,
}: {
  sample: fos.ModalSample;
  showControls?: boolean;
}) {
  const [id] = useState(() => uuid());
  const initialRef = useRef<boolean>(true);
  const ref = useRef<HTMLDivElement>(null);
  const [reset, setReset] = useState(false);
  const baseLookerOptions = fos.useLookerOptions(true);

  const lookerOptions = React.useMemo(
    () => ({ ...baseLookerOptions, showControls }),
    [baseLookerOptions, showControls]
  );

  const createLooker = fos.useCreateLooker(
    true,
    false,
    lookerOptions,
    undefined,
    true
  );
  const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
  const colorScheme = useRecoilValue(fos.colorScheme);

  // use a ref for sample data to prevent instance recreation
  //
  // sample updates are handled via looker.updateSample(...)
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const looker = React.useMemo(() => {
    /** start refreshers */
    reset;
    selectedMediaField;
    /** end refreshers */

    return createLooker.current(sampleRef.current);
  }, [createLooker, reset, selectedMediaField]) as L;

  useEffect(() => {
    /** start refreshers */
    colorScheme;
    /** end refreshers */

    !initialRef.current && looker.updateSample(sample.sample);
  }, [colorScheme, looker, sample]);

  const handleError = useErrorHandler();
  const updateLookerOptions = useLookerOptionsUpdate();

  fos.useEventHandler(looker, "clear", useClearSelectedLabels());
  fos.useEventHandler(looker, "error", (event) => handleError(event.detail));
  fos.useEventHandler(looker, "options", (e) => updateLookerOptions(e.detail));
  fos.useEventHandler(looker, "reset", () => setReset((c) => !c));
  fos.useEventHandler(looker, "select", fos.useOnSelectLabel());
  fos.useEventHandler(looker, "showOverlays", useShowOverlays());

  useEffect(() => {
    !initialRef.current && looker.updateOptions(lookerOptions);
  }, [looker, lookerOptions]);

  useEffect(() => {
    initialRef.current = false;
  }, []);

  useEffect(() => {
    ref.current?.dispatchEvent(
      new CustomEvent("looker-attached", { bubbles: true })
    );
  }, []);

  useEffect(() => {
    looker.attach(id);
  }, [looker, id]);

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  fos.useEventHandler(
    looker,
    "panels",
    async ({ detail: { showJSON, showHelp, SHORTCUTS } }) => {
      if (showJSON) {
        jsonPanel[showJSON](sample);
      }
      if (showHelp) {
        if (showHelp === CLOSE) {
          helpPanel.close();
        } else {
          helpPanel[showHelp](shortcutToHelpItems(SHORTCUTS));
        }
      }

      updateLookerOptions({}, (updatedOptions) =>
        looker.updateOptions(updatedOptions)
      );
    }
  );

  useKeyEvents(initialRef, sample.sample._id, looker);

  const setModalLooker = useSetRecoilState(fos.modalLooker);

  const { setActiveLookerRef } = useModalContext();

  const { viewport, setViewport, pan, scale } = useViewport();
  const lastLookerViewport = useRef<{
    scale: number;
    pan: [number, number];
  } | null>(null);

  useEffect(() => {
    return () => {
      looker?.destroy();
      // Don't reset viewport here - it prevents zoom from persisting when switching to Lighter
      // Viewport is reset on sample change and modal close via other mechanisms
    };
  }, [looker]);

  const currentSampleId = sample.sample._id;
  useEffect(() => {
    if (!looker) return;

    const disposeScale = looker.subscribeToState("scale", (scale: number) => {
      if (!showControls) return;
      setViewport((prev: { scale: number; pan: [number, number] } | null) => {
        if (prev?.scale === scale) return prev;
        const next: { scale: number; pan: [number, number] } = {
          scale,
          pan: prev?.pan ?? [0, 0],
        };
        lastLookerViewport.current = next;
        return next;
      });
    });

    const onPanChange = (pan: [number, number]) => {
      if (!showControls) return;
      setViewport((prev: { scale: number; pan: [number, number] } | null) => {
        if (prev?.pan[0] === pan[0] && prev?.pan[1] === pan[1]) return prev;
        const next: { scale: number; pan: [number, number] } = {
          scale: prev?.scale ?? 1,
          pan: [pan[0], pan[1]],
        };
        lastLookerViewport.current = next;
        return next;
      });
    };

    const unsubscribePan = looker.subscribeToState("pan", onPanChange);

    return () => {
      disposeScale();
      unsubscribePan();
    };
  }, [looker, setViewport, showControls, currentSampleId]);

  useEffect(() => {
    if (!looker || !viewport) return;

    if (
      lastLookerViewport.current &&
      scale === lastLookerViewport.current.scale &&
      pan[0] === lastLookerViewport.current.pan[0] &&
      pan[1] === lastLookerViewport.current.pan[1]
    ) {
      return;
    }

    (looker as any).setCamera(scale, pan);
  }, [looker, viewport, pan, scale]);

  useEffect(() => {
    if (looker) {
      setModalLooker(looker);
      setActiveLookerRef(looker as fos.Lookers);
    }
  }, [looker, setModalLooker, setActiveLookerRef]);

  useEffect(() => {
    setViewport(null);
  }, [sample.sample._id, setViewport]);

  return { id, looker, ref, sample, updateLookerOptions };
}

export default useLooker;
