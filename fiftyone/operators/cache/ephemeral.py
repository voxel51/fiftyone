from cachetools import LRUCache
from threading import Lock

_EPHEMERAL_CACHE_REGISTRY = {}
_EPHEMERAL_CACHE_LOCK = Lock()


def get_ephemeral_cache(func_id, max_size=None):
    max_size = max_size or 1024
    with _EPHEMERAL_CACHE_LOCK:
        if func_id not in _EPHEMERAL_CACHE_REGISTRY:
            _EPHEMERAL_CACHE_REGISTRY[func_id] = LRUCache(maxsize=max_size)
        return _EPHEMERAL_CACHE_REGISTRY[func_id]


def clear_all_ephemeral_caches():
    with _EPHEMERAL_CACHE_LOCK:
        for cache in _EPHEMERAL_CACHE_REGISTRY.values():
            cache.clear()
        _EPHEMERAL_CACHE_REGISTRY.clear()
