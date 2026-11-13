import { act, cleanup, renderHook } from "@testing-library/react";
// Exercise the existing Recoil stores; production callers use the hook.
// eslint-disable-next-line no-restricted-imports
import { RecoilRoot, useRecoilValue, useSetRecoilState } from "recoil";
import { afterEach, describe, expect, it } from "vitest";
import { sidebarGroupsDefinition } from "../recoil/sidebar";
import { useSyncModalSidebarGroups } from "./useSetModalState";

afterEach(cleanup);

const labels = (...paths: string[]) => ({
  name: "labels",
  paths,
  expanded: true,
});

const render = () =>
  renderHook(
    () => {
      useSyncModalSidebarGroups();
      return {
        modal: useRecoilValue(sidebarGroupsDefinition(true)),
        setGrid: useSetRecoilState(sidebarGroupsDefinition(false)),
      };
    },
    {
      wrapper: ({ children }) => (
        <RecoilRoot
          initializeState={({ set }) => {
            // the modal's copy, taken when it opened
            set(sidebarGroupsDefinition(true), [labels("gt")]);
            set(sidebarGroupsDefinition(false), [labels("gt")]);
          }}
        >
          {children}
        </RecoilRoot>
      ),
    },
  );

describe("useSyncModalSidebarGroups", () => {
  it("adds the paths the grid's groups gain to the modal's", () => {
    const { result } = render();
    expect(result.current.modal).toStrictEqual([labels("gt")]);

    // e.g. a schema switch shows `cls` again
    act(() => result.current.setGrid([labels("gt", "cls")]));

    expect(result.current.modal).toStrictEqual([labels("gt", "cls")]);
  });

  it("keeps the modal's groups when they lack nothing", () => {
    const { result } = render();
    const before = result.current.modal;

    act(() => result.current.setGrid([labels("gt")]));

    expect(result.current.modal).toBe(before);
  });
});
