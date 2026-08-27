import { act, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  registerEpisodeHeaderAction,
  resetEpisodeHeaderActionsForTests,
  useEpisodeHeaderActions,
} from "./registry";
import type { EpisodeHeaderAction } from "./types";

const Action = () => React.createElement("button");
const action: EpisodeHeaderAction = {
  id: "test:action",
  order: 10,
  Component: Action,
};

afterEach(resetEpisodeHeaderActionsForTests);

describe("episode header action registry", () => {
  it("is inert when empty and orders registered actions", () => {
    render(<RegisteredActionIds />);
    expect(screen.getByTestId("actions").textContent).toBe("");

    act(() => {
      registerEpisodeHeaderAction({
        ...action,
        id: "test:later",
        order: 20,
      });
      registerEpisodeHeaderAction(action);
    });

    expect(screen.getByTestId("actions").textContent).toBe(
      "test:action,test:later",
    );
  });

  it("rejects ambiguous and conflicting ids", () => {
    expect(() =>
      registerEpisodeHeaderAction({
        ...action,
        id: "missing-namespace" as EpisodeHeaderAction["id"],
      }),
    ).toThrow("Episode header action ids must be namespaced");

    registerEpisodeHeaderAction(action);
    expect(() => registerEpisodeHeaderAction({ ...action })).toThrow(
      "Duplicate episode header action id: test:action",
    );
  });
});

function RegisteredActionIds() {
  const actions = useEpisodeHeaderActions();
  return (
    <div data-testid="actions">{actions.map(({ id }) => id).join(",")}</div>
  );
}
