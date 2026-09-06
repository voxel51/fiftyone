import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  VisibleStreamsProvider,
  usePublishVisibleStreams,
  useVisibleStreamIds,
} from "./visible-streams";

describe("visible stream publication", () => {
  it("unions, rebinds, and removes only the unmounted publisher", () => {
    const { rerender } = render(<Harness first={["b", "a"]} second={["c"]} />);
    expect(screen.getByTestId("visible").textContent).toBe("a,b,c");

    rerender(<Harness first={["d"]} second={["c"]} />);
    expect(screen.getByTestId("visible").textContent).toBe("c,d");

    rerender(<Harness first={["d"]} />);
    expect(screen.getByTestId("visible").textContent).toBe("d");
  });
});

function Harness({
  first,
  second,
}: {
  readonly first: readonly string[];
  readonly second?: readonly string[];
}) {
  return (
    <VisibleStreamsProvider>
      <TilingProvider>
        <Publisher id="first" streams={first} />
        {second ? <Publisher id="second" streams={second} /> : null}
        <Visible />
      </TilingProvider>
    </VisibleStreamsProvider>
  );
}

function Publisher({
  id,
  streams,
}: {
  readonly id: string;
  readonly streams: readonly string[];
}) {
  return (
    <TileIdScope tileId={id}>
      <PublisherHook streams={streams} />
    </TileIdScope>
  );
}

function PublisherHook({ streams }: { readonly streams: readonly string[] }) {
  usePublishVisibleStreams(streams);
  return null;
}

function Visible() {
  return <div data-testid="visible">{useVisibleStreamIds().join(",")}</div>;
}
