"""
A parking spot for a built plan between the preview and the confirm.

``build_push_plan`` walks every sample — ``isfile``, ``getsize``,
``to_dict`` — which is seconds to minutes on a real dataset, and the user
sees the numbers it produced before deciding. Handing the confirm the same
plan object turns two scans into one.

In-process on purpose. The execution store is not an option: a ``PushPlan``
carries every sample document and blows the 16 MB value cap. Losing the
cache to a server restart costs one rebuild, which ``push_to_cloud`` already
handles by emitting ``planning`` and planning again.
"""

import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from .constants import PLAN_CACHE_TTL_S


@dataclass(frozen=True)
class PlanEntry:
    """A parked plan plus what it was built for and when."""

    plan: Any
    local_dataset: str
    target: str
    created_at: float


class PlanCache:
    """Module-level, thread-safe, TTL'd. Tokens are opaque and single-use.

    The token travels to the browser in ``push.plan_token`` and comes back
    on ``mode="push"``; it names nothing about the dataset, so echoing it
    through panel data leaks nothing.
    """

    def __init__(
        self,
        ttl_seconds: float = PLAN_CACHE_TTL_S,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.__entries: Dict[str, "PlanEntry"] = {}
        self.__lock = threading.Lock()
        self.__ttl = ttl_seconds
        self.__clock = clock

    def put(self, plan: Any, local_dataset: str, target: str) -> str:
        """Parks a ``PushPlan`` and returns its token.

        ``local_dataset`` and ``target`` are stored alongside so
        :meth:`take` can refuse a token whose plan was built for a
        different selection — an expired-then-rebuilt plan is correct, a
        mismatched one is not. Purges expired entries on the way in so the
        cache cannot grow without bound.
        """
        token = uuid.uuid4().hex
        now = self.__clock()
        with self.__lock:
            self.__purge(now)
            self.__entries[token] = PlanEntry(
                plan=plan,
                local_dataset=local_dataset,
                target=target,
                created_at=now,
            )
        return token

    def take(
        self, token: Optional[str], local_dataset: str, target: str
    ) -> Optional[Any]:
        """Removes and returns the plan for ``token``.

        Returns ``None`` on an absent, expired, or mismatched token — every
        one of which the caller handles identically, by rebuilding.
        """
        if not token:
            return None

        now = self.__clock()
        with self.__lock:
            self.__purge(now)
            entry = self.__entries.pop(token, None)

        if entry is None:
            return None
        if entry.local_dataset != local_dataset or entry.target != target:
            return None
        return entry.plan

    def clear(self) -> None:
        """Drops everything. Tests only."""
        with self.__lock:
            self.__entries.clear()

    def __purge(self, now: float) -> None:
        """Caller holds the lock."""
        expired = [
            token
            for token, entry in self.__entries.items()
            if now - entry.created_at > self.__ttl
        ]
        for token in expired:
            del self.__entries[token]


#: The one cache. Module-level so the preview execution and the confirm
#: execution — different requests, same process — see the same entries.
PLAN_CACHE = PlanCache()
