"""
``PlanCache``: the one piece of in-process state in the plugin, so its
expiry and single-use semantics are worth pinning.
"""

from cloud.constants import PLAN_CACHE_TTL_S
from cloud.plan_cache import PlanCache


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_take_returns_the_same_plan_object():
    cache = PlanCache()
    plan = object()

    token = cache.put(plan, "local", "dataset")

    assert cache.take(token, "local", "dataset") is plan


def test_take_is_single_use():
    cache = PlanCache()
    token = cache.put(object(), "local", "dataset")

    cache.take(token, "local", "dataset")

    assert cache.take(token, "local", "dataset") is None


def test_take_after_ttl_returns_none():
    clock = Clock()
    cache = PlanCache(clock=clock)
    token = cache.put(object(), "local", "dataset")

    clock.now = PLAN_CACHE_TTL_S + 1

    assert cache.take(token, "local", "dataset") is None


def test_take_refuses_a_mismatched_selection():
    cache = PlanCache()
    token = cache.put(object(), "local", "view")

    assert cache.take(token, "local", "dataset") is None


def test_take_refuses_a_token_from_another_dataset():
    cache = PlanCache()
    token = cache.put(object(), "local", "dataset")

    assert cache.take(token, "other", "dataset") is None


def test_put_purges_expired_entries():
    clock = Clock()
    cache = PlanCache(clock=clock)
    stale = cache.put(object(), "local", "dataset")

    clock.now = PLAN_CACHE_TTL_S + 1
    fresh = cache.put(object(), "local", "dataset")

    # The stale plan is gone even though nothing ever asked for it — a plan
    # holds every sample document, so a long-lived server must not keep
    # them.
    assert cache.take(stale, "local", "dataset") is None
    assert cache.take(fresh, "local", "dataset") is not None


def test_take_of_none_or_unknown_token_returns_none():
    cache = PlanCache()

    assert cache.take(None, "local", "dataset") is None
    assert cache.take("", "local", "dataset") is None
    assert cache.take("deadbeef", "local", "dataset") is None
