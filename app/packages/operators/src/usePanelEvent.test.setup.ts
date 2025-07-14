import React from "react";
import { vi } from "vitest";
import { RecoilRoot } from "recoil";

vi.mock("@fiftyone/spaces", () => ({
  usePanelStateByIdCallback: vi.fn(),
}));
vi.mock("@fiftyone/state", () => ({
  useNotification: vi.fn(),
}));
vi.mock("./hooks", () => ({
  useActivePanelEventsCount: vi.fn(),
}));
vi.mock("./operators", () => ({
  executeOperator: vi.fn(),
}));
vi.mock("./state", () => ({
  usePromptOperatorInput: vi.fn(),
}));

import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useActivePanelEventsCount } from "./hooks";

export const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(RecoilRoot, null, children);
};

export const mockUsePanelStateByIdCallback = vi.mocked(
  usePanelStateByIdCallback
);
export const mockUseActivePanelEventsCount = vi.mocked(
  useActivePanelEventsCount
);
export let mockCallback: any;

export function setupPanelEventTestMocks() {
  vi.clearAllMocks();
  mockUsePanelStateByIdCallback.mockImplementation((callback) => {
    mockCallback = callback;
    return vi.fn();
  });
  mockUseActivePanelEventsCount.mockReturnValue({
    increment: vi.fn(),
    decrement: vi.fn(),
    count: 0,
  });
}
