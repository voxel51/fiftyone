import * as fos from "@fiftyone/state";
import React, { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import { useClearSelectedLabels, useShowOverlays } from "./ModalLooker";
import { useLookerOptionsUpdate } from "./hooks";
import useKeyEvents from "./use-key-events";
import { shortcutToHelpItems } from "./utils";

const CLOSE = "close";

function useLooker<L extends fos.Lookers>({
  sample,
}: {
  sample: fos.ModalSample;
}) {
  const [id] = useState(() => uuid());
  const initialRef = useRef<boolean>(true);
  const ref = useRef<HTMLDivElement>(null);
  const [reset, setReset] = useState(false);
  const lookerOptions = fos.useLookerOptions(true);
  const createLooker = fos.useCreateLooker(true, false, lookerOptions);
  const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
  const colorScheme = useRecoilValue(fos.colorScheme);
  const looker = React.useMemo(() => {
    reset;
    selectedMediaField;
    return createLooker.current(sample);
  }, [createLooker, reset, sample, selectedMediaField]) as L;
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
    colorScheme;
    !initialRef.current && looker.updateSample(sample);
  }, [colorScheme, looker, sample]);

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

  useEffect(() => {
    return () => looker?.destroy();
  }, [looker]);

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

  useKeyEvents(sample.sample._id, looker);

  return { id, looker, ref, sample, updateLookerOptions };
}

export default useLooker;
