import { expect, test, vi } from "vitest";
import glueHistory from "./glueHistory";

test("glue history", () => {
  const stub = {
    pathname: "/datasets",
  };
  vi.stubGlobal("location", stub);
  vi.stubGlobal("history", {
    state: { options: { fiftyone: true } },
  });
  let replaced = false;
  let counter = 0;
  glueHistory(
    (cb) => {
      if (counter === 1) {
        stub.pathname = "/datasets/my-dataset/samples";
      }

      if (counter < 2) {
        counter++;
        cb();
      }
    },
    () => {
      replaced = true;
    }
  );

  expect(replaced).toBe(true);
});
