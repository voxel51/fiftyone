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

  it("should debounce duplicate events within the debounce interval", () => {
    analytics.load(SIMPLE_CONFIG);
    vi.spyOn(Date, "now").mockImplementation(() => 10000); // Mock initial time

    analytics.track("debounced_event");
    expect(mockSegment.track).toHaveBeenCalledWith(
      "debounced_event",
      undefined,
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

  it("should allow disabling of url tracking", () => {
    analytics = new Analytics();
    analytics.load({
      writeKey: "test",
      userId: "user",
      userGroup: "group",
      debug: false,
      disableUrlTracking: true,
    });
    analytics.track("custom_event");
    // segment should be called with context.page.url = undefined
    expect(mockSegment.track).toHaveBeenCalledWith("custom_event", undefined, {
      context: {
        page: { url: undefined },
      },
    });
  });

  it("should obfuscate uri properties of all events", () => {
    analytics = new Analytics();
    analytics.load({
      writeKey: "test",
      userId: "user",
      userGroup: "group",
      debug: false,
      redact: ["uri"],
    });
    analytics.track("random_event", { uri: "@my_name/my_plugin/my_operator" });
    // segment should be called with properties.uri = "<redacted>"
    expect(mockSegment.track).toHaveBeenCalledWith(
      "random_event",
      { uri: "<redacted>" },
      undefined
    );
  });

  it("should redact properties properly", () => {
    analytics = new Analytics();
    analytics.load({
      writeKey: "test",
      userId: "user",
      userGroup: "group",
      debug: false,
      redact: ["uri"],
    });
    const redacted = analytics.redact({
      uri: "@my_name/my_plugin/my_operator",
    });
    expect(redacted).toEqual({ uri: "<redacted>" });
    const redacted2 = analytics.redact({ other: "value" });
    expect(redacted2).toEqual({ other: "value" });
    const redacted3 = analytics.redact({});
    expect(redacted3).toEqual({});
    const redacted4 = analytics.redact(undefined);
    expect(redacted4).toEqual(undefined);
  });

  it("should allow setting version", () => {
    analytics.load({
      writeKey: "test",
      userId: "user",
      userGroup: "group",
      debug: false,
      version: "1.0.0",
    });
    analytics.track("custom_event");
    expect(mockSegment.track).toHaveBeenCalledWith("custom_event", undefined, {
      version: "1.0.0",
    });
  });
  
  describe("analytics.page()", () => {
    it("should call segment.page()", () => {
      analytics = new Analytics();
      analytics.load({
        writeKey: "test",
        userId: "user",
        userGroup: "group",
        debug: false,
      });
      analytics.page("my_page");
      expect(mockSegment.page).toHaveBeenCalled();
    });
    it("should be a no-op if disableUrlTracking is set to true", () => {
      analytics = new Analytics();
      analytics.load({
        writeKey: "test",
        userId: "user",
        userGroup: "group",
        debug: false,
        disableUrlTracking: true,
      });
      analytics.page("my_page");
      expect(mockSegment.page).not.toHaveBeenCalled();
    });
  });
});
