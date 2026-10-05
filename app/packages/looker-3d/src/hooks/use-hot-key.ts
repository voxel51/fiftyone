import { useCallback, useEffect } from "react";
import * as recoil from "recoil";
import { useRecoilTransaction_UNSTABLE } from "recoil";

const KEYBOARD_EVENT_NAME = "keydown";

type KeyboardEventUnionType = KeyboardEvent & React.KeyboardEvent;

/**
 * What a hotkey callback receives: a Recoil transaction interface (`get`,
 * the default) or, with `useTransaction: false`, a callback interface
 * (`snapshot`). Both provide `set`.
 */
type HotkeyContext = {
  set: recoil.SetRecoilState;
  get?: recoil.GetRecoilValue;
  snapshot?: recoil.Snapshot;
};

export const useHotkey = (
  keyCode: string,
  cb: (props: HotkeyContext) => void,
  deps: readonly unknown[] = [],
  props: {
    useTransaction?: boolean;
    ignoreModifiers?: boolean;
  } = { useTransaction: true, ignoreModifiers: true },
) => {
  if (typeof props.useTransaction === "undefined") {
    props.useTransaction = true;
  }
  if (typeof props.ignoreModifiers === "undefined") {
    props.ignoreModifiers = true;
  }

  const { useTransaction, ignoreModifiers } = props;

  const transactionCb = useRecoilTransaction_UNSTABLE(
    (ctx) => () => cb(ctx),
    deps,
  );
  const callbackCb = recoil.useRecoilCallback((ctx) => () => cb(ctx), deps);
  const decoratedCb = useTransaction ? transactionCb : callbackCb;

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

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === keyCode) {
        decoratedCb();
      }
    },
    [decoratedCb, ignoreModifiers, keyCode],
  );

  // This effect registers and cleans up the global keydown listener.
  useEffect(() => {
    window.addEventListener(KEYBOARD_EVENT_NAME, handle);

    return () => {
      window.removeEventListener(KEYBOARD_EVENT_NAME, handle);
    };
  }, [handle]);
};
