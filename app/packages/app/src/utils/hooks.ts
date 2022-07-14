import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import ResizeObserver from "resize-observer-polyfill";
import html2canvas from "html2canvas";

import { getFetchFunction, sendEvent, toCamelCase } from "@fiftyone/utilities";

import * as fos from "@fiftyone/state";
import {
  State,
  StateResolver,
  transformDataset,
  useStateUpdate,
} from "@fiftyone/state";

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
    const { x: leaderX, width: leaderWidth } =
      leaderRef.current.getBoundingClientRect();

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
  const subscription = useRecoilValue(fos.stateSubscription);

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

export const useUnprocessedStateUpdate = () => {
  const update = useStateUpdate();
  return (resolve: StateResolver) => {
    update((t) => {
      const { colorscale, config, dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      return {
        colorscale,
        dataset: dataset
          ? (transformDataset(toCamelCase(dataset)) as State.Dataset)
          : null,
        config: config ? (toCamelCase(config) as State.Config) : undefined,
        state: {
          ...toCamelCase(state),
          view: state.view,
        } as State.Description,
      };
    });
  };
};
