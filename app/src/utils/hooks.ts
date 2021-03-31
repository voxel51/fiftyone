import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useSetRecoilState,
  useRecoilValue,
} from "recoil";
import ResizeObserver from "resize-observer-polyfill";
import ReactGA from "react-ga";
import { ThemeContext } from "styled-components";
import html2canvas from "html2canvas";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { ColorTheme } from "../shared/colors";
import socket, { appContext, handleId, isColab } from "../shared/connection";
import { attachDisposableHandler, packageMessage } from "./socket";
import gaConfig from "../constants/ga.json";

export const useEventHandler = (target, eventType, handler) => {
  // Adapted from https://reactjs.org/docs/hooks-faq.html#what-can-i-do-if-my-effect-dependencies-change-too-often
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!target) {
      return;
    }
    const wrapper = (e) => handlerRef.current(e);
    target.addEventListener(eventType, wrapper);
    return () => {
      target.removeEventListener(eventType, wrapper);
    };
  }, [target, eventType]);
};

export const useMessageHandler = (type, handler) => {
  const wrapper = useCallback(
    ({ data }) => {
      data = JSON.parse(data);
      data.type === type && handler(data);
    },
    [type, handler]
  );
  useEventHandler(socket, "message", wrapper);
};

export const useSendMessage = (type, data, guard = null, deps = []) => {
  useEffect(() => {
    !guard &&
      socket.send(
        JSON.stringify({
          ...data,
          type,
        })
      );
  }, [guard, ...deps]);
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
  const handleClickOutside = (event) => {
    if (ref.current && !ref.current.contains(event.target)) {
      handler(event);
    }
  };

  useEventHandler(document, "mousedown", handleClickOutside);
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

export const useVideoData = (socket, id, callback = null) => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (...args) => {
      const isVideo = await snapshot.getPromise(selectors.isVideoDataset);
      const requested = await snapshot.getPromise(
        atoms.sampleVideoDataRequested(id)
      );
      if (requested || !isVideo) {
        return;
      }
      const counter = await snapshot.getPromise(atoms.viewCounter);

      if (requested === counter) {
        callback && callback(null, ...args);
        return;
      }
      const event = `video_data-${id}`;
      const handler = ({ labels, frames, fps }) => {
        set(atoms.sampleVideoLabels(id), labels);
        set(atoms.sampleFrameData(id), frames);
        set(atoms.sampleFrameRate(id), fps);
        callback && callback({ labels, frames, counter }, ...args);
      };
      attachDisposableHandler(socket, event, handler);
      socket.send(packageMessage("get_video_data", { _id: id }));
      set(atoms.sampleVideoDataRequested(id), counter);
    },
    [socket, id, callback]
  );
};

export const useSampleUpdate = () => {
  const handler = useRecoilCallback(
    ({ set }) => async ({ samples }) => {
      samples.forEach(({ sample, frames, labels }) => {
        set(atoms.sample(sample._id), sample);
        labels && set(atoms.sampleVideoLabels(sample._id), labels);
        frames && set(atoms.sampleFrameData(sample._id), frames);
      });
      set(selectors.anyTagging, false);
    },
    []
  );
  useMessageHandler("samples_update", handler);
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

export const useGA = () => {
  const [gaInitialized, setGAInitialized] = useState(false);
  const info = useRecoilValue(selectors.fiftyone);

  useEffect(() => {
    if (info.do_not_track) {
      return;
    }
    const dev = info.dev_install;
    const buildType = dev ? "dev" : "prod";

    ReactGA.initialize(gaConfig.app_ids[buildType], {
      debug: dev,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.user_id,
      },
    });
    ReactGA.set({
      userId: info.user_id,
      checkProtocolTask: null, // disable check, allow file:// URLs
      [gaConfig.dimensions.dev]: buildType,
      [gaConfig.dimensions.version]: info.version,
      [gaConfig.dimensions.context]: appContext,
    });
    setGAInitialized(true);
    ReactGA.pageview(window.location.pathname + window.location.search);
  }, []);
  useHashChangeHandler(() => {
    if (info.do_not_track) {
      return;
    }
    if (gaInitialized) {
      ReactGA.pageview(window.location.pathname + window.location.search);
    }
  }, [window.location.pathname, window.location.search]);
};

export const useScreenshot = () => {
  const isVideoDataset = useRecoilValue(selectors.isVideoDataset);

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
          fetch(img.src)
            .then((response) => response.blob())
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
    return fetch("/_dist_/index.css")
      .then((response) => response.text())
      .then((text) => {
        const style = document.createElement("style");
        style.appendChild(document.createTextNode(text));
        document.head.appendChild(style);
      });
  }, []);

  const captureVideos = useCallback(() => {
    const videos = document.body.querySelectorAll("video");
    const promises = [];
    videos.forEach((video) => {
      const canvas = document.createElement("canvas");
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURI = canvas.toDataURL("image/png");
      const img = new Image(rect.width, rect.height);
      img.className = "p51-contained-image fo-captured";
      video.parentNode.replaceChild(img, video);
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
    html2canvas(document.body).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      if (isColab) {
        window.parent.postMessage(
          {
            src: imgData,
            handleId: handleId,
            width: canvas.width,
          },
          "*"
        );
      }
      socket.send(
        packageMessage("capture", { src: imgData, width: canvas.width })
      );
    });
  }, []);

  useMessageHandler("deactivate", () => {
    fitSVGs();
    let chain = Promise.resolve(null);
    if (isVideoDataset) {
      chain = chain.then(captureVideos);
    }
    if (isColab) {
      chain.then(inlineImages).then(applyStyles).then(capture);
    } else {
      chain.then(capture);
    }
  });
};

export const useTheme = (): ColorTheme => {
  return useContext<ColorTheme>(ThemeContext);
};
