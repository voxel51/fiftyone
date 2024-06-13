import { AnalyticsBrowser } from "@segment/analytics-next";

const DEFAULT_WRITE_KEYS = {
  dev: "MrAGfUuvQq2FOJIgAgbwgjMQgRNgruRa", // oss-dev
  prod: "SjCRPH72QTHlVhFZIT5067V9rhuq80Dl", // oss-prod
};

let _analytics: Analytics = null;

export default function usingAnalytics(info): Analytics {
  if (!_analytics) {
    _analytics = new Analytics(info);
  }
  return _analytics;
}

class Analytics {
  private _segment?: AnalyticsBrowser;
  constructor(private info: { doNotTrack: boolean; dev: "prod" | "dev" }) {
    if (!info || info.doNotTrack) {
      return;
    }
    this.enable();
  }

  enable(writeKey?: string) {
    this._segment = AnalyticsBrowser.load({
      writeKey: writeKey || getWriteKey(this.info.dev),
    });
    const userId = getUserId(this.info);
    if (userId) {
      this.identify(userId);
    }
    const group = getUserGroup();
    this.group(group);
  }

  disable() {
    this._segment = null;
  }

  page(name?: string, properties?: {}) {
    if (!this._segment) return;
    this._segment.page(name, properties);
  }

  track(name: string, properties?: {}) {
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

function getWriteKey(mode: "dev" | "prod") {
  if (window && window.FIFTYONE_SEGMENT_WRITE_KEY) {
    return window.FIFTYONE_SEGMENT_WRITE_KEY;
  }
  const env = process.env.NODE_ENV;
  return DEFAULT_WRITE_KEYS[env];
}

function getUserId(info) {
  if (window && window.FIFTYONE_ANLYTICS_ID) {
    return window.FIFTYONE_USER_ID;
  }
  return info.uid;
}

function getUserGroup() {
  if (window && window.FIFTYONE_ANLYTICS_GROUP) {
    return window.FIFTYONE_ANLYTICS_GROUP;
  }
  return "fiftyone-oss-users";
}
