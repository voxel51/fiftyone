import { getEventBus, type EventHandler } from "@fiftyone/events";
import type { TimelineStoreEventGroup } from "../events";
import type { CreateTimelineParams, TimelineName } from "../types";
import { TimelineManager } from "./TimelineManager";

/**
 * Singleton registry for all active timelines.
 */
class TimelineStore {
  private static _instance: TimelineStore;

  private timelines = new Map<TimelineName, TimelineManager>();
  private events = getEventBus<TimelineStoreEventGroup>();
  private _activeTimeline: string | null = null;

  static get instance(): TimelineStore {
    if (!TimelineStore._instance) {
      TimelineStore._instance = new TimelineStore();
    }
    return TimelineStore._instance;
  }

  /** Get or create a timeline manager for the given params. */
  getOrCreate(params: CreateTimelineParams): TimelineManager {
    let manager = this.timelines.get(params.name);

    if (!manager) {
      manager = new TimelineManager(params);
      this.timelines.set(params.name, manager);
      this.events.dispatch("store:timeline:added", {
        timeline: params.name,
        type: params.config?.type ?? "sequence",
      });
    }

    manager.initialize(params);
    return manager;
  }

  /** Retrieve a timeline manager by name. */
  get(name: string): TimelineManager | undefined {
    return this.timelines.get(name);
  }

  /** Check if a timeline exists. */
  has(name: string): boolean {
    return this.timelines.has(name);
  }

  /** Remove and destroy a timeline manager. */
  remove(name: string): void {
    const manager = this.timelines.get(name);

    if (manager) {
      manager.destroy();
      this.timelines.delete(name);
      this.events.dispatch("store:timeline:removed", {
        timeline: name,
        type: manager.config.type ?? "sequence",
      });

      if (this._activeTimeline === name) {
        this._activeTimeline = null;
        this.events.dispatch("store:timeline:activeTimelineChanged", {
          name: null,
        });
      }
    }
  }

  /** Set the currently active timeline. Only one timeline can be active at a time. Pass null to deactivate. */
  setActiveTimeline(name: string | null): void {
    if (this._activeTimeline === name) return;

    this._activeTimeline = name;
    this.events.dispatch("store:timeline:activeTimelineChanged", { name });
  }

  /** Get the currently active timeline name. Returns null if no timeline is active. */
  get activeTimeline(): string | null {
    return this._activeTimeline;
  }

  /** Subscribe to timeline store events. Returns unsubscribe function. */
  on<E extends keyof TimelineStoreEventGroup>(
    event: E,
    handler: EventHandler<TimelineStoreEventGroup[E]>
  ): () => void {
    return this.events.on(event, handler);
  }
}

export const timelineStore = TimelineStore.instance;
