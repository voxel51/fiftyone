/**
 * Typed promise wrappers over the panel's Python methods.
 *
 * `useTriggerPanelEvent` is callback-shaped and untyped; every caller in
 * this plugin wants `await`. The method URIs are not constants — they come
 * off `props.schema.view`, which is why this hook takes the view rather
 * than importing anything.
 *
 * Return values arrive as `result.result` in the trigger's callback.
 */

import { useMemo } from "react";

import { CloudPanelSchemaView, PairingDisplay, PollStatus } from "../types";
import { PanelEventTrigger } from "./appBindings";

/**
 * What `start_pairing` answers: the engine's `DevicePairing`, verbatim.
 *
 * Deliberately *not* `PairingDisplay`. The display object is what Python
 * writes into panel data, and it carries an absolute `expires_at` (computed
 * server-side, so a skewed browser clock cannot shorten a pairing). This is
 * the raw reply, with the RFC's relative `expires_in` and the secret the
 * display half must never hold.
 */
export interface StartPairingResult extends Omit<PairingDisplay, "expires_at"> {
  /** Never written to panel data — held only in the pairing atom. */
  device_code: string;
  expires_in: number;
}

export interface PollPairingResult {
  status: PollStatus;
  message?: string;
}

export interface PanelMethods {
  startPairing(params: {
    api_url?: string;
    auth_url?: string;
  }): Promise<StartPairingResult | null>;
  pollPairing(params: {
    device_code: string;
    api_url: string;
    auth_url: string;
  }): Promise<PollPairingResult>;
  cancelPairing(): Promise<void>;
  disconnect(): Promise<void>;
  resetPush(): Promise<void>;
}

export function usePanelMethods(
  view: CloudPanelSchemaView,
  trigger: PanelEventTrigger,
): PanelMethods {
  return useMemo(() => {
    function call<T>(uri: string, params: Record<string, unknown>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (!uri) {
          // The view arrives a render before the first `render()` result on
          // a cold panel; a caller that fires in that window gets a clean
          // rejection rather than an undefined operator URI.
          reject(new Error("The cloud panel is still loading"));
          return;
        }

        trigger(uri, params, false, (result) => {
          if (result?.error) {
            reject(new Error(String(result.error)));
            return;
          }
          resolve(result?.result as T);
        });
      });
    }

    return {
      startPairing: (params) =>
        call<StartPairingResult | null>(view.start_pairing, { ...params }),
      pollPairing: (params) =>
        call<PollPairingResult>(view.poll_pairing, { ...params }),
      cancelPairing: () => call<void>(view.cancel_pairing, {}),
      disconnect: () => call<void>(view.disconnect, {}),
      resetPush: () => call<void>(view.reset_push, {}),
    };
  }, [
    trigger,
    view.start_pairing,
    view.poll_pairing,
    view.cancel_pairing,
    view.disconnect,
    view.reset_push,
  ]);
}
