import { render, waitFor } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import type { OperationType } from "relay-runtime";
import { describe, expect, test, vi } from "vitest";
import type { PageQuery } from "./Writer";
import { registerPageSync, Writer } from "./Writer";

const page = {} as PageQuery<OperationType>;

describe("Writer", () => {
  test("publishes pages to persistent synchronization subscribers", async () => {
    const synchronize = vi.fn();
    const unregister = registerPageSync("Writer.test", synchronize);

    const { unmount } = render(
      <RecoilRoot>
        <Writer<OperationType>
          read={() => page}
          setters={new Map()}
          subscribe={(runner) => {
            runner(page);
            return vi.fn();
          }}
        />
      </RecoilRoot>,
    );

    await waitFor(() => expect(synchronize).toHaveBeenCalledOnce());

    unmount();
    unregister();
  });
});
