import React from "react";
import { act, renderHook } from "@testing-library/react-hooks";
import { RecoilRoot, useRecoilValue } from "recoil";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ModalSelector, Session } from "./session";

const Root: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

// `session.ts` reads `process.env.MODE` at module load time to decide whether
// `sessionRef` writes are skipped (they are, under vitest's default "test"
// mode). Re-importing with MODE stubbed to something else exercises the real
// production code path, including the `sessionRef` bookkeeping.
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MODE", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessionAtom", () => {
  test("setting a session value to undefined resolves to its declared default instead of leaving the atom (and sessionRef) undefined", async () => {
    const { sessionAtom, useSession, useSessionSetter, SESSION_DEFAULT } =
      await import("./session");

    const modalSelectorAtom = sessionAtom({
      key: "modalSelector",
      default: null,
    });

    const sessionRef: Session = { ...SESSION_DEFAULT, modalSelector: null };

    const { result } = renderHook(
      () => {
        useSession(() => {}, sessionRef);
        return {
          value: useRecoilValue(modalSelectorAtom),
          setSession: useSessionSetter(),
        };
      },
      { wrapper: Root },
    );

    expect(result.current.value).toBeNull();

    const selection: ModalSelector = { id: "sample-1" };
    act(() => {
      result.current.setSession("modalSelector", selection);
    });
    expect(result.current.value).toEqual(selection);
    expect(sessionRef.modalSelector).toEqual(selection);

    // Reproduces the race from the modal open/close TypeError: something
    // sets the session value to `undefined` rather than its actual "empty"
    // state (`null`).
    act(() => {
      result.current.setSession("modalSelector", undefined);
    });

    expect(result.current.value).toBeNull();
    expect(sessionRef.modalSelector).toBeNull();
  });
});
