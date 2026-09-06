/**
 * The pairing polling loop.
 *
 * Owns the one piece of state that must not reach the server-rendered panel
 * data: `device_code`. Panel state is workspace-persisted and panel data is
 * echoed on every event, so the code lives in a module-private jotai atom
 * and is passed back as a parameter on each poll.
 */

import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectionStatus, PollStatus } from "../types";
import { PanelMethods } from "./usePanelMethods";

/** How much a `slow_down` adds to the poll interval, per RFC 8628. */
export const SLOW_DOWN_BACKOFF_S = 5;

/**
 * RFC 8628's default interval, and the floor this client will accept. A
 * server answering `0` — or omitting the field — would otherwise become a
 * `setTimeout(…, 0)` loop hammering CAS for the whole pairing TTL.
 */
export const MIN_POLL_INTERVAL_S = 5;

export interface PairingUrls {
  api_url: string;
  auth_url: string;
}

export interface Pairing {
  /** Starts a pairing for these URLs and begins polling. */
  begin(urls: PairingUrls): Promise<void>;
  /** Abandons the current codes and starts a new pairing on the same URLs. */
  retry(): Promise<void>;
  /** Stops polling and calls `cancel_pairing`. */
  cancel(): Promise<void>;
  /** True between `begin` and the first `start_pairing` result. */
  isStarting: boolean;
}

interface PairingSecret extends PairingUrls {
  device_code: string;
  interval: number;
}

/**
 * Module-private, per the no-exported-atoms rule. Never read by a component
 * and never written to panel state or data — a `device_code` is a bearer
 * credential for the pairing, and both of those surfaces are persisted and
 * echoed.
 */
const secretAtom = atom<PairingSecret | null>(null);

export function usePairing(
  methods: PanelMethods,
  status: ConnectionStatus,
): Pairing {
  const [secret, setSecret] = useAtom(secretAtom);
  const [isStarting, setIsStarting] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secretRef = useRef<PairingSecret | null>(secret);
  secretRef.current = secret;

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // The loop is self-rescheduling, so `schedule` and the poll body refer to
  // each other. The ref breaks the cycle and keeps the latest closure — a
  // `setTimeout` captured a render ago must still see current props.
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback(
    (seconds: number) => {
      stop();
      timer.current = setTimeout(() => {
        void pollRef.current();
      }, seconds * 1000);
    },
    [stop],
  );

  pollRef.current = async () => {
    const current = secretRef.current;
    if (current === null) {
      return;
    }

    let answer;
    try {
      answer = await methods.pollPairing({
        device_code: current.device_code,
        api_url: current.api_url,
        auth_url: current.auth_url,
      });
    } catch {
      // A failed round trip is indistinguishable from a blip from here;
      // Python already reports real refusals as statuses.
      schedule(current.interval);
      return;
    }

    switch (answer.status) {
      case PollStatus.SlowDown: {
        const slower = {
          ...current,
          interval: current.interval + SLOW_DOWN_BACKOFF_S,
        };
        setSecret(slower);
        secretRef.current = slower;
        schedule(slower.interval);
        return;
      }
      case PollStatus.Pending:
      case PollStatus.Unavailable:
        // A transport blip must not kill a live pairing — the user is
        // looking at a code that is still good.
        schedule(current.interval);
        return;
      default:
        // issued / expired / denied / refused: Python has already written
        // the resulting connection into panel data.
        stop();
        setSecret(null);
        secretRef.current = null;
    }
  };

  const begin = useCallback(
    async (urls: PairingUrls) => {
      stop();
      setIsStarting(true);
      try {
        const started = await methods.startPairing(urls);
        if (!started?.device_code) {
          // `start_pairing` answers `{}` when it could not reach the cloud;
          // the reason is already on `connection.error`.
          setSecret(null);
          secretRef.current = null;
          return;
        }

        const next: PairingSecret = {
          device_code: started.device_code,
          api_url: urls.api_url,
          auth_url: urls.auth_url,
          interval: Math.max(MIN_POLL_INTERVAL_S, started.interval || 0),
        };
        setSecret(next);
        secretRef.current = next;
        schedule(next.interval);
      } finally {
        setIsStarting(false);
      }
    },
    [methods, schedule, setSecret, stop],
  );

  const retry = useCallback(async () => {
    const current = secretRef.current;
    if (current === null) {
      return;
    }
    await begin({ api_url: current.api_url, auth_url: current.auth_url });
  }, [begin]);

  const cancel = useCallback(async () => {
    stop();
    setSecret(null);
    secretRef.current = null;
    await methods.cancelPairing();
  }, [methods, setSecret, stop]);

  // A pairing cancelled from another tab, or one Python resolved on its
  // own, leaves this connection out of `pairing`; nothing left to poll for.
  useEffect(() => {
    if (status !== ConnectionStatus.Pairing) {
      stop();
    }
  }, [status, stop]);

  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({ begin, retry, cancel, isStarting }),
    [begin, retry, cancel, isStarting],
  );
}
