import { useCallback, useEffect } from "react";
import * as recoil from "recoil";
import { useRecoilTransaction_UNSTABLE } from "recoil";

const KEYBOARD_EVENT_NAME = "keydown";

type KeyboardEventUnionType = KeyboardEvent & React.KeyboardEvent;

export const useHotkey = (
  keyCode: string,
  cb: (props: {
    get: recoil.GetRecoilValue;
    set: recoil.SetRecoilState;
    snapshot: recoil.Snapshot;
  }) => void,
  deps: readonly unknown[] = [],
  props: {
    useTransaction?: boolean;
    ignoreModifiers?: boolean;
  } = { useTransaction: true, ignoreModifiers: true }
) => {
  if (typeof props.useTransaction === "undefined") {
    props.useTransaction = true;
  }
  if (typeof props.ignoreModifiers === "undefined") {
    props.ignoreModifiers = true;
  }

  const { useTransaction, ignoreModifiers } = props;

  const decoratedCb = useTransaction
    ? useRecoilTransaction_UNSTABLE((ctx) => () => cb(ctx), deps)
    : recoil.useRecoilCallback((ctx) => () => cb(ctx), deps);

  const handle = useCallback(
    (e: KeyboardEventUnionType) => {
      // ignore if modifier keys are pressed
      if (
        ignoreModifiers &&
        (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
      ) {
        return;
      }

      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        return;
      }

      if (e.code === keyCode) {
        decoratedCb();
      }
    },
    [decoratedCb, keyCode]
  );

  useEffect(() => {
    window.addEventListener(KEYBOARD_EVENT_NAME, handle);

    return () => {
      window.removeEventListener(KEYBOARD_EVENT_NAME, handle);
    };
  }, [handle]);
};
