/**
 * The keystone reentrancy guard (§1.1), shared across dispatch channels:
 * subscribers are sinks, so any guarded write attempted while ANY channel
 * (label changes, display, interaction) is dispatching throws in dev. One
 * instance spans the engine and its interaction state, so a label write from
 * an interaction listener is as illegal as one from a change listener (§6.5).
 */

const REENTRANCY_CHECK_ENABLED =
  typeof process === "undefined" || process.env?.NODE_ENV !== "production";

export class DispatchGuard {
  private depth = 0;

  /** Run a dispatch with the guard held (nests across channels). */
  run(fn: () => void): void {
    this.depth++;

    try {
      fn();
    } finally {
      this.depth--;
    }
  }

  /** Dev-mode throw when a guarded write happens during any dispatch. */
  assert(op: string): void {
    if (REENTRANCY_CHECK_ENABLED && this.depth > 0) {
      throw new Error(
        `${op} was called from within a subscriber. Subscribers are sinks ` +
          `and must never write back to the engine.`
      );
    }
  }
}
