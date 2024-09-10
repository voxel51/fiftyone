import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Analytics } from "./usingAnalytics";
import { AnalyticsBrowser } from "@segment/analytics-next";

// Mock the AnalyticsBrowser object
vi.mock("@segment/analytics-next", () => ({
  AnalyticsBrowser: {
    load: vi.fn(),
  },
}));

const SIMPLE_CONFIG = {
  writeKey: "test_write_key",
  userId: "test_user",
  userGroup: "test_group",
  debug: true,
};

describe("Analytics", () => {
  let analytics: Analytics;
  const mockSegment = {
    track: vi.fn(),
    page: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
  };

  beforeEach(() => {
    // Mock return value of AnalyticsBrowser.load
    AnalyticsBrowser.load.mockReturnValue(mockSegment);
    analytics = new Analytics({
      eventRateLimit: 5,
      debounceInterval: 5000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should load analytics with correct writeKey", () => {
    analytics.load(SIMPLE_CONFIG);

    expect(AnalyticsBrowser.load).toHaveBeenCalledWith({
      writeKey: "test_write_key",
    });
    expect(mockSegment.identify).toHaveBeenCalledWith("test_user", undefined);
    expect(mockSegment.group).toHaveBeenCalledWith("test_group", undefined);
  });

  it("should not load analytics if writeKey is missing", () => {
    analytics.load({
      writeKey: "",
      userId: "test_user",
      userGroup: "test_group",
      debug: true,
    });

    expect(AnalyticsBrowser.load).not.toHaveBeenCalled();
  });

  it("should disable analytics if doNotTrack is set", () => {
    analytics.load({
      writeKey: "test_write_key",
      userId: "test_user",
      userGroup: "test_group",
      doNotTrack: true,
      debug: true,
    });

    expect(analytics["_segment"]).toBeNull();
  });

  it("should track an event if within rate limit", () => {
    analytics.load(SIMPLE_CONFIG);
    const properties = { prop1: "value1" };
    analytics.track("test_event", properties);
    expect(mockSegment.track).toHaveBeenCalledWith("test_event", properties);
  });

  it("should not track an event if rate limit is exceeded", () => {
    analytics.load(SIMPLE_CONFIG);
    for (let i = 0; i < 6; i++) {
      analytics.track(`test_event_${i}`);
    }
    expect(mockSegment.track).toHaveBeenCalledTimes(5); // Rate limit is 5
  });

  it("should debounce duplicate events within the debounce interval", () => {
    analytics.load(SIMPLE_CONFIG);
    vi.spyOn(Date, "now").mockImplementation(() => 10000); // Mock initial time

    analytics.track("debounced_event");
    expect(mockSegment.track).toHaveBeenCalledWith(
      "debounced_event",
      undefined
    );

    vi.spyOn(Date, "now").mockImplementation(() => 12000); // Within debounce interval (2s)
    analytics.track("debounced_event");
    expect(mockSegment.track).toHaveBeenCalledTimes(1); // Should not track again

    vi.spyOn(Date, "now").mockImplementation(() => 17000); // After debounce interval (5s)
    analytics.track("debounced_event");
    expect(mockSegment.track).toHaveBeenCalledTimes(2); // Should track again
  });

  it("should identify user when called", () => {
    analytics.load(SIMPLE_CONFIG);
    analytics.identify("new_user", { trait1: "value1" });
    expect(mockSegment.identify).toHaveBeenCalledWith("new_user", {
      trait1: "value1",
    });
  });

  it("should not track if segment is disabled", () => {
    analytics.load(SIMPLE_CONFIG);
    analytics.disable();
    analytics.track("test_event");
    expect(mockSegment.track).not.toHaveBeenCalled();
  });

  it("should group users when called", () => {
    analytics.load(SIMPLE_CONFIG);
    analytics.group("group_id", { groupTrait: "value" });
    expect(mockSegment.group).toHaveBeenCalledWith("group_id", {
      groupTrait: "value",
    });
  });

  it("should correctly log debug information when debug mode is enabled", () => {
    analytics.load(SIMPLE_CONFIG);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    analytics.track("debug_event");
    expect(consoleSpy).toHaveBeenCalledWith("track", "debug_event", undefined);

    consoleSpy.mockRestore();
  });

  it("should not log debug information when debug mode is disabled", () => {
    analytics.load(SIMPLE_CONFIG);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    analytics = new Analytics({
      writeKey: "test",
      userId: "user",
      userGroup: "group",
      debug: false,
    });

    analytics.track("debug_event");
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
