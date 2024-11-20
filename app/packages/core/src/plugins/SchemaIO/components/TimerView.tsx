import { useEffect, useRef } from "react";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { ViewPropsType } from "../utils/types";

export type TimerViewParams = {
  on_interval?: string;
  on_timeout?: string;
  interval?: number;
  timeout?: number;
  params?: object;
};

class Timer {
  protected _ref: NodeJS.Timeout | null = null;

  start() {}
  stop() {}
}

class IntervalTimer extends Timer {
  constructor(private interval: number, private onInterval: () => void) {
    super();
  }

  start() {
    this.stop();
    this._ref = setInterval(() => this.onInterval(), this.interval);
  }
  stop() {
    if (this._ref) {
      clearInterval(this._ref);
      this._ref = null;
    }
  }
}

class TimeoutTimer extends Timer {
  constructor(private timeout: number, private onTimeout: () => void) {
    super();
  }

  start() {
    this.stop();
    this._ref = setTimeout(() => this.onTimeout(), this.timeout);
  }
  stop(): void {
    if (this._ref) {
      clearTimeout(this._ref);
      this._ref = null;
    }
  }
}

function useTimer(params: TimerViewParams) {
  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();
  const {
    on_interval,
    interval,
    timeout,
    on_timeout,
    params: operator_params,
  } = params;
  const ref = useRef<Timer | null>(null);

  useEffect(() => {
    if (!interval && !timeout) {
      console.warn(
        "useTimer requires either `interval` or `timeout` to be defined."
      );
      return;
    }

    const TimerType = interval ? IntervalTimer : TimeoutTimer;
    const handleTimerEvent = interval
      ? () => {
          if (on_interval) {
            triggerEvent(panelId, {
              operator: on_interval,
              params: operator_params || {},
              prompt: null,
            });
          }
        }
      : () => {
          if (on_timeout) {
            triggerEvent(panelId, {
              operator: on_timeout,
              params: operator_params || {},
              prompt: null,
            });
          }
        };

    // Clean up existing timer
    if (ref.current) {
      ref.current.stop();
    }

    // Initialize and start the timer
    ref.current = new TimerType(interval || timeout!, handleTimerEvent);
    ref.current.start();

    return () => {
      ref.current?.stop();
    };
  }, [on_interval, interval, on_timeout, timeout, triggerEvent, panelId]);
}

export default function TimerView(props: ViewPropsType) {
  const { schema } = props;
  const { view = {} } = schema;

  useTimer(view as TimerViewParams);
  return null;
}
