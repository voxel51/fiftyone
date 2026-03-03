import { describe, expect, it, vi, beforeEach } from "vitest";
import { setFetchFunction, getFetchFunction } from "./fetch";

describe("fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Content-Type header", () => {
    it("should set Content-Type to application/json when body is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      setFetchFunction("http://localhost");
      await getFetchFunction()("POST", "/test", { data: "value" }, "json", 0);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("should not set Content-Type when body is not provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      setFetchFunction("http://localhost");
      await getFetchFunction()("DELETE", "/test", null, "json", 0);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Content-Type"]).toBeUndefined();
    });
  });
});
