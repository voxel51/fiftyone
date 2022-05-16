import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";
import ResizeObserver from "resize-observer-polyfill";
import html2canvas from "html2canvas";

import { getFetchFunction, sendEvent, toCamelCase } from "@fiftyone/utilities";

import * as aggregationAtoms from "../recoil/aggregations";
import * as atoms from "../recoil/atoms";
import * as filterAtoms from "../recoil/filters";
import * as selectors from "../recoil/selectors";
import { State } from "../recoil/types";
import * as viewAtoms from "../recoil/view";
import { resolveGroups, sidebarGroupsDefinition } from "../components/Sidebar";
import { savingFilters } from "../components/Actions/ActionsRow";
import { viewsAreEqual } from "./view";
import { similaritySorting } from "../components/Actions/Similar";
import { patching } from "../components/Actions/Patcher";
import { matchPath, useSendEvent, useTo } from "@fiftyone/components";
import { useMutation } from "react-relay";
import {
  setDataset,
  setDatasetMutation,
  setSelected,
  setSelectedLabels,
  setSelectedLabelsMutation,
  setSelectedMutation,
  setView,
  setViewMutation,
} from "../mutations";
import { useErrorHandler } from "react-error-boundary";
import { transformDataset } from "../Root/Datasets";

export const useEventHandler = (
  target,
  eventType,
  handler,
  useCapture = false
) => {
  // Adapted from https://reactjs.org/docs/hooks-faq.html#what-can-i-do-if-my-effect-dependencies-change-too-often
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!target) return;

    const wrapper = (e) => handlerRef.current(e);
    target && target.addEventListener(eventType, wrapper, useCapture);

    return () => {
      target && target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType]);
};

export const useObserve = (target, handler) => {
  const handlerRef = useRef(handler);
  const observerRef = useRef(new ResizeObserver(() => handlerRef.current()));

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!target) {
      return;
    }
    observerRef.current.observe(target);
    return () => observerRef.current.unobserve(target);
  }, [target]);
};

export const useResizeHandler = (handler) =>
  useEventHandler(window, "resize", handler);

export const useScrollHandler = (handler) =>
  useEventHandler(window, "scroll", handler);

export const useHashChangeHandler = (handler) =>
  useEventHandler(window, "hashchange", handler);

export const useKeydownHandler = (handler) =>
  useEventHandler(document.body, "keydown", handler);

export const useOutsideClick = (ref, handler) => {
  const handleOutsideClick = useCallback(
    (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handler(event);
      }
    },
    [handler]
  );

  useEventHandler(document, "mousedown", handleOutsideClick, true);
};

export const useFollow = (leaderRef, followerRef, set) => {
  const follow = () => {
    if (
      !leaderRef ||
      !leaderRef.current ||
      !followerRef ||
      !followerRef.current
    ) {
      return;
    }
    const { x, y } = followerRef.current.getBoundingClientRect();
    const {
      x: leaderX,
      width: leaderWidth,
    } = leaderRef.current.getBoundingClientRect();

    set({
      left: x,
      top: y,
      opacity: x - leaderX < 0 || x > leaderX + leaderWidth ? 0 : 1,
    });
  };

  useEventHandler(window, "scroll", follow);
  useEventHandler(leaderRef ? leaderRef.current : null, "scroll", follow);
  useObserve(followerRef ? followerRef.current : null, follow);
};

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });

  const handleResize = () => {
    // Set window width/height to state
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  useEventHandler(window, "resize", handleResize);

  useEffect(() => {
    handleResize();
  }, []);

  return windowSize;
};

export const useScreenshot = (
  context: "ipython" | "colab" | "databricks" | undefined
) => {
  const subscription = useRecoilValue(selectors.stateSubscription);

  const fitSVGs = useCallback(() => {
    const svgElements = document.body.querySelectorAll("svg");
    svgElements.forEach((item) => {
      item.setAttribute("width", item.getBoundingClientRect().width);
      item.setAttribute("height", item.getBoundingClientRect().height);
    });
  }, []);

  const inlineImages = useCallback(() => {
    const images = document.body.querySelectorAll("img");
    const promises = [];
    images.forEach((img) => {
      !img.classList.contains("fo-captured") &&
        promises.push(
          getFetchFunction()("GET", img.src, null, "blob")
            .then((blob) => {
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve(reader.result);
                };
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(blob);
              });
            })
            .then((dataURL) => {
              return new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = dataURL;
              });
            })
        );
    });
    return Promise.all(promises);
  }, []);

  const applyStyles = useCallback(() => {
    const styles: Promise<void>[] = [];

    document.querySelectorAll("link").forEach((link) => {
      if (link.rel === "stylesheet") {
        styles.push(
          fetch(link.href)
            .then((response) => response.text())
            .then((text) => {
              const style = document.createElement("style");
              style.appendChild(document.createTextNode(text));
              document.head.appendChild(style);
            })
        );
      }
    });

    return Promise.all(styles);
  }, []);

  const captureCanvas = useCallback(() => {
    const canvases = document.body.querySelectorAll("canvas");
    const promises = [];
    canvases.forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const dataURI = canvas.toDataURL("image/png");
      const img = new Image(rect.width, rect.height);
      img.style.height = `${rect.height}px`;
      img.style.width = `${rect.width}px`;
      canvas.parentNode.replaceChild(img, canvas);
      promises.push(
        new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = dataURI;
        })
      );
    });
    return Promise.all(promises);
  }, []);

  const capture = useCallback(() => {
    const { width } = document.body.getBoundingClientRect();
    html2canvas(document.body).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      if (context === "colab") {
        window.parent.postMessage(
          {
            src: imgData,
            subscription,
            width,
          },
          "*"
        );
        return;
      }

      sendEvent({
        event: "capture_notebook_cell",
        subscription,
        data: { src: imgData, width: canvas.width, subscription },
      });
    });
  }, []);

  const run = () => {
    if (!context) return;

    fitSVGs();
    let chain = Promise.resolve(null);
    if (context === "colab") {
      chain.then(inlineImages).then(applyStyles).then(capture);
    } else {
      chain.then(capture);
    }
  };

  return run;
};

export type StateResolver =
  | { dataset?: State.Dataset; state?: Partial<State.Description> }
  | ((
      t: TransactionInterface_UNSTABLE
    ) => { dataset?: State.Dataset; state?: Partial<State.Description> });

export type StateResolver =
  | State.Description
  | ((t: TransactionInterface_UNSTABLE) => State.Description);

export const useUnprocessedStateUpdate = () => {
  const update = useStateUpdate();
  return (resolve: StateResolver) => {
    update((t) => {
      const { dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      return {
        state: { ...toCamelCase(state), view: state.view } as State.Description,
        dataset: dataset
          ? (transformDataset(toCamelCase(dataset)) as State.Dataset)
          : null,
      };
    });
  };
};

export const useStateUpdate = () => {
  return useRecoilTransaction_UNSTABLE(
    (t) => (resolve: StateResolver) => {
      const { state, dataset } =
        resolve instanceof Function ? resolve(t) : resolve;

      const { get, set } = t;

      if (state?.view) {
        const view = get(viewAtoms.view);

        if (!viewsAreEqual(view, state.view || [])) {
          set(viewAtoms.view, state.view || []);
          set(filterAtoms.filters, {});
        }
      }

      state?.colorscale !== undefined &&
        set(atoms.colorscale, state.colorscale);

      state?.config !== undefined && set(atoms.appConfig, state.config);
      state?.viewCls !== undefined && set(viewAtoms.viewCls, state.viewCls);

      state?.selected && set(atoms.selectedSamples, new Set(state.selected));
      state?.selectedLabels &&
        set(
          atoms.selectedLabels,
          Object.fromEntries(
            (state.selectedLabels || []).map(({ labelId, ...data }) => [
              labelId,
              data,
            ])
          )
        );

      const colorPool = get(atoms.colorPool);
      if (
        state?.config &&
        JSON.stringify(state.config.colorPool) !== JSON.stringify(colorPool)
      ) {
        set(atoms.colorPool, state.config.colorPool);
      }

      if (dataset) {
        dataset.brainMethods = Object.values(dataset.brainMethods || {});
        dataset.evaluations = Object.values(dataset.evaluations || {});

        const groups = resolveGroups(dataset);
        const current = get(sidebarGroupsDefinition(false));

        if (JSON.stringify(groups) !== JSON.stringify(current)) {
          set(sidebarGroupsDefinition(false), groups);
          set(
            aggregationAtoms.aggregationsTick,
            get(aggregationAtoms.aggregationsTick) + 1
          );
        }

        set(atoms.dataset, dataset);
      }

      set(atoms.modal, null);

      [true, false].forEach((i) =>
        [true, false].forEach((j) =>
          set(atoms.tagging({ modal: i, labels: j }), false)
        )
      );
      set(patching, false);
      set(similaritySorting, false);
      set(savingFilters, false);
    },
    []
  );
};

export const useSetDataset = () => {
  const { to } = useTo();
  const send = useSendEvent();
  const [commit] = useMutation<setDatasetMutation>(setDataset);
  const subscription = useRecoilValue(selectors.stateSubscription);
  const onError = useErrorHandler();

  return (name?: string) => {
    to(name ? `/datasets/${encodeURI(name)}` : "/");
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, name },
      })
    );
  };
};

export const useSetSelected = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(selectors.stateSubscription);
  const [commit] = useMutation<setSelectedMutation>(setSelected);
  const onError = useErrorHandler();

  return (selected: string[]) =>
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, selected },
      })
    );
};

export const useSetSelectedLabels = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(selectors.stateSubscription);
  const [commit] = useMutation<setSelectedLabelsMutation>(setSelectedLabels);
  const onError = useErrorHandler();

  return (selectedLabels: State.SelectedLabel[]) =>
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, selectedLabels },
      })
    );
};

export const useSetView = () => {
  const send = useSendEvent();
  const updateState = useStateUpdate();
  const subscription = useRecoilValue(selectors.stateSubscription);
  const [commit] = useMutation<setViewMutation>(setView);
  const onError = useErrorHandler();

  return (view) =>
    send((session) =>
      commit({
        variables: { subscription, session, view },
        onError,
        onCompleted: ({ setView: { dataset, view } }) => {
          updateState({
            dataset: transformDataset(dataset),
            state: {
              view,
              viewCls: dataset.viewCls,
              selected: [],
              selectedLabels: [],
            },
          });
        },
      })
    );
};

export const useSelectSample = () => {
  const setSelected = useSetSelected();

  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) => async (sampleId: string) => {
      const selected = new Set(get(atoms.selectedSamples));
      selected.has(sampleId)
        ? selected.delete(sampleId)
        : selected.add(sampleId);
      set(atoms.selectedSamples, selected);
      setSelected([...selected]);
    },
    []
  );
};

export const useReset = () => {
  return useRecoilTransaction_UNSTABLE(({ set }) => () => {
    set(atoms.selectedSamples, new Set());
    set(atoms.selectedLabels, new Array());
    set(viewAtoms.view, []);
  });
};
