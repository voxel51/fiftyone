import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetErrorBoundary } from "./AssetErrorBoundary";

const Asset = ({ fails }: { fails: boolean }) => {
  if (fails) {
    throw new Error("asset failed");
  }

  return <div>asset loaded</div>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssetErrorBoundary", () => {
  it("recovers from an error when the asset identity changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { rerender } = render(
      <AssetErrorBoundary resetKey="first">
        <Asset fails />
      </AssetErrorBoundary>,
    );

    expect(screen.queryByText("asset loaded")).toBeNull();

    rerender(
      <AssetErrorBoundary resetKey="first">
        <Asset fails={false} />
      </AssetErrorBoundary>,
    );
    expect(screen.queryByText("asset loaded")).toBeNull();

    rerender(
      <AssetErrorBoundary resetKey="second">
        <Asset fails={false} />
      </AssetErrorBoundary>,
    );
    expect(screen.getByText("asset loaded")).not.toBeNull();
  });
});
