import { useEffect } from "react";
import _ from "lodash";
import { useSetRecoilState } from "recoil";

import { mainSize, mainTop, mousePosition } from "./atoms";

export const useTrackMousePosition = () => {
  let timeout;
  const setMousePosition = useSetRecoilState(mousePosition);

  const updateMousePosition = (event) => {
    if (timeout) {
      window.cancelAnimationFrame(timeout);
    }
    timeout = window.requestAnimationFrame(() => {
      setMousePosition([event.clientX, event.clientY]);
    });
  };

  useEffect(() => {
    window.addEventListener("mousemove", updateMousePosition);

    return () => window.removeEventListener("mousemove", updateMousePosition);
  }, []);
};

export const useTrackMain = (ref) => {
  let timeout;
  const setMainSize = useSetRecoilState(mainSize);
  const setMainTop = useSetRecoilState(mainTop);
  useEffect(() => {
    const handleResize = _.debounce(() => {
      if (timeout) {
        window.cancelAnimationFrame(timeout);
      }

      timeout = window.requestAnimationFrame(() => {
        setMainSize([ref.current.offsetWidth, ref.current.offsetHeight]);
        setMainTop(ref.current.getBoundingClientRect().top);
      });
    }, 500);
    window.addEventListener("resize", handleResize);
    setMainSize([ref.current.offsetWidth, ref.current.offsetHeight]);
    return (_) => {
      window.removeEventListener("resize", handleResize);
    };
  }, [ref.current]);
};
