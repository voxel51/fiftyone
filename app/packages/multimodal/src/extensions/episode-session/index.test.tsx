import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpisodeSession } from "../../ports";
import {
  registerEpisodeSessionExtension,
  useEpisodeSessionExtension,
  type EpisodeSessionExtensionProps,
} from "./index";

function Host({ session }: { session: EpisodeSession | null }) {
  const Extension = useEpisodeSessionExtension();
  const content = (value: { session: EpisodeSession | null }) => (
    <div>
      {value.session === session ? "original session" : "augmented session"}
    </div>
  );
  return Extension ? (
    <Extension session={session}>{content}</Extension>
  ) : (
    content({ session })
  );
}

afterEach(cleanup);

describe("episode session extension", () => {
  it("is inert without a provider and restores that behavior on disposal", () => {
    const provider = vi.fn(({ children }: EpisodeSessionExtensionProps) => (
      <>{children({ session: {} as EpisodeSession })}</>
    ));
    render(<Host session={null} />);
    expect(screen.getByText("original session")).toBeTruthy();
    expect(provider).not.toHaveBeenCalled();
    let dispose: () => void = () => undefined;
    act(() => {
      dispose = registerEpisodeSessionExtension(provider);
    });
    expect(screen.getByText("augmented session")).toBeTruthy();
    act(dispose);
    expect(screen.getByText("original session")).toBeTruthy();
  });

  it("does not remove a replacement when an older registration is disposed", () => {
    const first = ({ children, session }: EpisodeSessionExtensionProps) => (
      <>{children({ session })}</>
    );
    const next = ({ children }: EpisodeSessionExtensionProps) => (
      <>{children({ session: {} as EpisodeSession })}</>
    );
    const disposeFirst = registerEpisodeSessionExtension(first);
    const disposeNext = registerEpisodeSessionExtension(next);
    disposeFirst();
    render(<Host session={null} />);
    expect(screen.getByText("augmented session")).toBeTruthy();
    act(disposeNext);
  });
});
