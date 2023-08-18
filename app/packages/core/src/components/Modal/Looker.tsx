import { useTheme } from "@fiftyone/components";
import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOnSelectLabel } from "@fiftyone/state";
import React, {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";

type EventCallback = (event: CustomEvent) => void;

const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (update: object, updater?: Function) => {
        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );

        const panels = await snapshot.getPromise(fos.lookerPanels);
        const updated = {
          ...currentOptions,
          ...update,
          showJSON: panels.json.isOpen,
          showHelp: panels.help.isOpen,
        };
        set(fos.savedLookerOptions, updated);
        if (updater) updater(updated);
      }
  );
};

const useFullscreen = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.fullscreen, event.detail);
  });
};

const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.showOverlays, event.detail);
  });
};

const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(fos.selectedLabels, {}),
    []
  );
};

interface LookerProps {
  sample?: fos.ModalSample;
  lookerRef?: MutableRefObject<any>;
  lookerRefCallback?: (looker: fos.Lookers) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const Looker = ({
  sample: propsSampleData,
  lookerRef,
  lookerRefCallback,
}: LookerProps) => {
  const [id] = useState(() => uuid());

  const modalSampleData = useRecoilValue(fos.modalSample);
  const sessionColorScheme = useRecoilValue(fos.sessionColorScheme);

  const sampleData = useMemo(() => {
    if (propsSampleData) {
      return {
        ...modalSampleData,
        ...propsSampleData,
      };
    }

    return modalSampleData;
  }, [propsSampleData, modalSampleData]);

  const { sample } = sampleData;

  const theme = useTheme();
  const initialRef = useRef<boolean>(true);
  const lookerOptions = fos.useLookerOptions(true);
  const [reset, setReset] = useState(false);
  const createLooker = fos.useCreateLooker(true, false, {
    ...lookerOptions,
  });
  const looker = React.useMemo(
    () => createLooker.current(sampleData),
    [reset, createLooker]
  );

  useEffect(() => {
    if (looker) {
      lookerRefCallback && lookerRefCallback(looker);
    }
  }, [looker, lookerRefCallback]);

  useEffect(() => {
    !initialRef.current && looker.updateOptions(lookerOptions);
  }, [lookerOptions]);

  useEffect(() => {
    !initialRef.current && looker.updateSample(sample);
  }, [sample, sessionColorScheme]);

  useEffect(() => {
    return () => looker && looker.destroy();
  }, [looker]);

  const handleError = useErrorHandler();
  lookerRef && (lookerRef.current = looker);

  const updateLookerOptions = useLookerOptionsUpdate();
  useEventHandler(looker, "options", (e) => updateLookerOptions(e.detail));
  useEventHandler(looker, "fullscreen", useFullscreen());
  useEventHandler(looker, "showOverlays", useShowOverlays());
  useEventHandler(looker, "reset", () => {
    setReset((c) => !c);
  });

  useEventHandler(looker, "close", (e: Event) => {
    jsonPanel.close();
    helpPanel.close();
  });

  useEventHandler(looker, "select", useOnSelectLabel());
  useEventHandler(looker, "error", (event) => handleError(event.detail));
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();
  useEventHandler(
    looker,
    "panels",
    async ({ detail: { showJSON, showHelp, SHORTCUTS } }) => {
      if (showJSON) {
        jsonPanel[showJSON](sample);
      }
      if (showHelp) {
        if (showHelp == "close") {
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

  useEffect(() => {
    initialRef.current = false;
  }, []);

  useEffect(() => {
    looker.attach(id);
  }, [looker, id]);

  useEventHandler(looker, "clear", useClearSelectedLabels());

  const hoveredSample = useRecoilValue(fos.hoveredSample);

  useEffect(() => {
    const hoveredSampleId = hoveredSample && hoveredSample._id;
    looker.updater((state) => ({
      ...state,
      shouldHandleKeyEvents: hoveredSampleId === sample._id,
      options: {
        ...state.options,
      },
    }));
  }, [hoveredSample, sample, looker]);

  return (
    <div
      id={id}
      data-cy="modal-looker-container"
      style={{
        width: "100%",
        height: "100%",
        background: theme.background.level2,
        position: "relative",
      }}
    />
  );
};

export default React.memo(Looker);

function shortcutToHelpItems(SHORTCUTS) {
  return Object.values(
    Object.values(SHORTCUTS).reduce((acc, v) => {
      acc[v.shortcut] = v;

      return acc;
    }, {})
  );
}
