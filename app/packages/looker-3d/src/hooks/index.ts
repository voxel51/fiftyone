import { pathFilter, PathFilterSelector } from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import * as recoil from "recoil";
import { useRecoilTransaction_UNSTABLE, useRecoilValueLoadable } from "recoil";

const KEYBOARD_EVENT_NAME = "keydown";

type KeyboardEventUnionType = KeyboardEvent & React.KeyboardEvent;

export const useHotkey = (
  keyCode: string,
  cb: (props: {
    get: recoil.GetRecoilValue;
    set: recoil.SetRecoilState;
  }) => void,
  deps: readonly unknown[] = []
) => {
  const cbAsRecoilTransaction = useRecoilTransaction_UNSTABLE(
    (ctx) => () => cb(ctx),
    deps
  );

  const handle = useCallback(
    (e: KeyboardEventUnionType) => {
      const shouldIgnore = e.target.tagName.toLowerCase() === "input";
      if (!shouldIgnore && e.code === keyCode) {
        cbAsRecoilTransaction();
      }
    },
    [cbAsRecoilTransaction, keyCode]
  );

  useEffect(() => {
    window.addEventListener(KEYBOARD_EVENT_NAME, handle);

    return () => {
      window.removeEventListener(KEYBOARD_EVENT_NAME, handle);
    };
  }, [handle]);
};

export const usePathFilter = (): PathFilterSelector => {
  const fn = useRef<PathFilterSelector>(() => true);
  const loaded = useRecoilValueLoadable(pathFilter(true));

  if (loaded.state === "hasValue") {
    fn.current = loaded.contents;
  }

  return fn.current;
};
