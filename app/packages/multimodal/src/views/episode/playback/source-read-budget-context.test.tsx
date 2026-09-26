import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import type { SourceReadBudgetAccount } from "../../../ports";
import {
  SourceReadBudgetProvider,
  useSourceReadBudgetStanding,
} from "./source-read-budget-context";

it("keeps the account receiver when subscribing and unsubscribes on unmount", () => {
  const listeners = new Set<() => void>();
  let lifted = false;
  const account: SourceReadBudgetAccount = {
    createJob: () => {
      throw new Error("This view does not read messages");
    },
    remaining: () => ({
      maxMessages: 0,
      maxSourceBytes: 0,
      maxUncompressedBytes: 0,
      maxWallTimeMs: 0,
    }),
    reserve: () => undefined,
    standing: () => ({ exhausted: !lifted, lifted }),
    lift() {
      lifted = true;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      expect(this.standing().lifted).toBe(false);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const { result, unmount } = renderHook(useSourceReadBudgetStanding, {
    wrapper: ({ children }) => (
      <SourceReadBudgetProvider account={account}>
        {children}
      </SourceReadBudgetProvider>
    ),
  });
  expect(result.current).toEqual({ exhausted: true, lifted: false });
  act(() => account.lift());
  expect(result.current).toEqual({ exhausted: false, lifted: true });
  unmount();
  expect(listeners.size).toBe(0);
});
