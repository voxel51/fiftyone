import { getFetchFunction, sendEvent } from "@fiftyone/utilities";
import html2canvas from "html2canvas";
import { useCallback, useContext } from "react";
import { useRecoilValue } from "recoil";

import * as fos from "../";

const SCREENSHOT_QUALITY = 0.25;

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
          getFetchFunction()(
            "GET",
            link.getAttribute("href"),
            undefined,
            "text"
          ).then((text: string) => {
            const style = document.createElement("style");
            style.appendChild(document.createTextNode(text));
            document.head.appendChild(style);
          })
        );
      }
    });

    return Promise.all(styles);
  }, []);
  const beforeCapture = useContext(fos.BeforeScreenshotContext);

  const captureCallbacks = useCallback(() => {
    const promises = [];
    beforeCapture.forEach((cb) => {
      const promise = cb().then((canvas) => {
        const dataURI = canvas.toDataURL();
        const rect = canvas.getBoundingClientRect();
        const img = new Image(rect.width, rect.height);
        img.style.height = `${rect.height}px`;
        img.style.width = `${rect.width}px`;
        canvas.parentNode.replaceChild(img, canvas);
        new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = dataURI;
        });
      });

      promises.push(promise);
    });
    return Promise.all(promises);
  }, [beforeCapture]);

  const capture = useCallback(() => {
    const { width } = document.body.getBoundingClientRect();
    captureCallbacks()
      .then(() => html2canvas(document.body))
      .then((canvas) => {
        const imgData = canvas.toDataURL("image/jpeg", SCREENSHOT_QUALITY);

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
        }).then(() => {
          if (context === "databricks") {
            const params = new URLSearchParams(window.location.search);
            const proxy = params.get("proxy");

            window.location.assign(
              `${proxy || "/"}screenshot/${subscription}.html?proxy=${proxy}`
            );
          }
        });
      });
  }, [captureCallbacks, context, subscription]);

  const run = () => {
    const notebook = new URLSearchParams(window.location.search).get(
      "notebook"
    );
    if (!notebook) return;

    fitSVGs();
    const chain = Promise.resolve(null);
    if (context === "colab") {
      chain.then(inlineImages).then(applyStyles).then(capture);
    } else {
      chain.then(applyStyles).then(capture);
    }
  };

  return run;
};

export default useScreenshot;
