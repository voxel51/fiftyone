import { describe, expect, it, vi } from "vitest";
import { SetView } from "./built-in-operators";
import * as vitest from "vitest";
import { ExecutionContext, RawContext, executeOperator } from "./operators";

vi.mock("react-plotly.js", () => ({
  default: function Plotly() {
    return null;
  },
}));

describe("SetView", () => {
  describe("execute()", () => {
    it("foo", () => {
      const mockSlug = "test";
      const params = { name: mockSlug };
      const hooks = {
        setView: vi.fn(),
        setViewName: vi.fn(),
        refetchableSavedViews: [
          {
            savedViews: [
              {
                slug: mockSlug,
              },
            ],
          },
        ],
      };
      const mockCurrentCtx = { hooks };

      const ctx = new ExecutionContext(params, mockCurrentCtx, hooks);
      const op = new SetView("test");
      const result = op.execute({
        hooks,
        params,
      });
      expect(hooks.setViewName).toHaveBeenCalledWith(mockSlug);
    });
    it("executeOperator()", () => {
      const callback = vi.fn();
      executeOperator(
        "set_view",
        {
          name: "test",
        },
        {
          callback,
        }
      );
      expect(callback).toHaveBeenCalled();
    });
  });
});
