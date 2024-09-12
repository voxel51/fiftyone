import { AnalyticsBrowser } from "@segment/analytics-next";

export type AnalyticsInfo = {
  writeKey: string;
  userId: string;
  userGroup: string;
  doNotTrack?: boolean;
  debug: boolean;
};

export type AnalyticsConfig = {
  debounceInterval: number;
};

let _analytics: Analytics = null;

export default function usingAnalytics(info: AnalyticsInfo): Analytics {
  if (!_analytics) {
    _analytics = new Analytics();
  }
  if (info) {
    _analytics.load(info);
  }
  return _analytics;
}

export class Analytics {
  private _segment?: AnalyticsBrowser;
  private _debug = false;
  private _lastEventTimestamps: Record<string, number> = {}; // Tracks last event times
  private _debounceInterval = 1000; // Default debounce interval in milliseconds (5 seconds)

  constructor(config?: AnalyticsConfig) {
    if (config?.debounceInterval) {
      this._debounceInterval = config.debounceInterval;
    }
  }

  load(info: AnalyticsInfo) {
    if (this._segment) return;
    this._debug = info?.debug;
    if (!info || info.doNotTrack) {
      console.warn("Analytics disabled");
      console.log(info);
      this.disable();
      return;
    }
    if (!info.writeKey) {
      console.warn("Analytics disabled (no write key)");
      this.disable();
      return;
    }
    this.enable(info);
  }

  enable(info: AnalyticsInfo) {
    this._segment = AnalyticsBrowser.load({
      writeKey: info.writeKey,
    });
    if (info.userId) {
      this.identify(info.userId);
    }
    if (info.userGroup) {
      this.group(info.userGroup);
    }
  }

  disable() {
    this._segment = null;
  }

  page(name?: string, properties?: {}) {
    if (!this._segment) return;
    this._segment.page(name, properties);
  }

  track(name: string, properties?: {}) {
    const now = Date.now();
    const lastTimestamp = this._lastEventTimestamps[name] || 0;

    if (now - lastTimestamp < this._debounceInterval) {
      if (this._debug) {
        console.log("Debounced event:", name);
      }
      return;
    }

    this._lastEventTimestamps[name] = now;

    if (this._debug) {
      console.log("track", name, properties);
    }

    if (!this._segment) return;
    this._segment.track(name, properties);
  }

  trackEvent(name: string, properties?: {}) {
    this.track(name, properties);
  }

  identify(userId: string, traits?: {}) {
    if (!this._segment) return;
    this._segment.identify(userId, traits);
  }

  group(groupId: string, traits?: {}) {
    if (!this._segment) return;
    this._segment.group(groupId, traits);
  }
}
