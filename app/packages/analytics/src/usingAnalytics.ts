import { AnalyticsBrowser } from "@segment/analytics-next";

export type AnalyticsInfo = {
  writeKey: string;
  userId: string;
  userGroup: string;
  doNotTrack?: boolean;
  debug: boolean;
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
    if (this._debug) {
      console.log("track", name, properties);
    }
    if (!this._segment) return;
    this._segment.track(name, properties);
  }

  trackEvent(name: string, properties?: {}) {
    if (!this._segment) return;
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
