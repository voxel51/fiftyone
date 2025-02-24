import * as fos from "@fiftyone/state";
import React, { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { v4 as uuid } from "uuid";
import { useClearSelectedLabels, useShowOverlays } from "./ModalLooker";
import { useLookerOptionsUpdate, useModalContext } from "./hooks";
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

  useKeyEvents(initialRef, sample.sample._id, looker);

  const setModalLooker = useSetRecoilState(fos.modalLooker);

  const { setActiveLookerRef } = useModalContext();

  useEffect(() => {
    setModalLooker(looker);
  }, [looker, setModalLooker]);

  useEffect(() => {
    if (looker) {
      setActiveLookerRef(looker as fos.Lookers);
    }
  }, [looker, setActiveLookerRef]);

  return { id, looker, ref, sample, updateLookerOptions };
}

export default useLooker;
