"""
FiftyOne operator decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio

from bson import ObjectId
from cachetools.keys import hashkey
from contextlib import contextmanager
from functools import wraps
import json
import signal
import os

import fiftyone as fo
from fiftyone.plugins.core import _iter_plugin_metadata_files
from fiftyone.operators.store import ExecutionStore


def coroutine_timeout(seconds):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await asyncio.wait_for(
                        func(*args, **kwargs), timeout=seconds
                    )
                else:
                    raise TypeError(
                        f"Function {func.__name__} is not a coroutine function"
                    )
            except asyncio.TimeoutError:
                raise_timeout_error(seconds)

        return wrapper

    return decorator


@contextmanager
def timeout(seconds: int):
    signal.signal(
        signal.SIGALRM, lambda signum, frame: raise_timeout_error(seconds)
    )
    signal.alarm(seconds)

    try:
        yield
    finally:
        signal.signal(signal.SIGALRM, signal.SIG_IGN)


def raise_timeout_error(seconds):
    raise TimeoutError(f"Timeout occurred after {seconds} seconds") from None


cache = {}
dir_cache = {"state": None}


def plugins_cache(func):
    """Decorator that returns cached function results as long as no plugins
    have been modified since last time.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        if not fo.config.plugins_cache_enabled:
            return func(*args, **kwargs)

        curr_dir_state = dir_state(fo.config.plugins_dir)
        if curr_dir_state != dir_cache["state"]:
            cache.clear()
            dir_cache["state"] = curr_dir_state

        key = hashkey(func, *args, **kwargs)
        if key not in cache:
            cache[key] = func(*args, **kwargs)

        return cache[key]

    return wrapper


def dir_state(dirpath):
    try:
        state = hash(os.path.getmtime(dirpath))
    except:
        return None

    for p in _iter_plugin_metadata_files(root_dir=dirpath):
        state ^= hash(os.path.getmtime(os.path.dirname(p)))

    return state


def execution_cache(
    ttl=None,
    link_to_dataset=True,
    key_fn=None,
    store_name=None,
):
    """
    Decorator for caching function results in an ``ExecutionStore``.

    The function must:
        - accept a `ctx` argument as the first parameter.
        - return a serializable value.
        - be idempotent (i.e., it should produce the same
            output for the same input) and not have any side effects.
        - have serializeable parameters or a custom ``key_fn`` to generate
            cache keys.

    Args:
        ttl (None): Time-to-live for the cached value in seconds.
        link_to_dataset (True): Whether to tie the cache entry to the dataset
            (auto-cleans when the dataset is deleted).
        key_fn (None): A custom function to generate cache keys.
            If not provided, the function arguments are used as the key by serializing them as JSON.
        store_name (None): Custom name for the execution store.
            Defaults to the function name.

    Example Usage:
        # Standalone function with default caching
        @execution_cache
        def expensive_query(ctx, path):
            return ctx.dataset.count_values(path)

        # Instance method with dataset-scoped caching
        class Processor:
            @execution_cache(ttl=60, store_name="processor_cache")
            def expensive_query(self, ctx, path):
                return ctx.dataset.count_values(path)

        # Using a custom key function
        def custom_key_fn(ctx, path, user_id):
            return [path, user_id]

        @execution_cache(ttl=90, key_fn=custom_key_fn)
        def user_specific_query(ctx, path, user_id):
            return ctx.dataset.count_values(path)
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)

            if ctx_index == -1 or ctx_index > 1:
                raise ValueError(
                    f"@execution_cache requires the first argument to be an ExecutionContext"
                )

            dataset_id = ctx.dataset._doc.id if link_to_dataset else None

            # Store name
            resolved_store_name = _resolve_store_name(ctx, func, store_name)
            if not isinstance(resolved_store_name, str):
                raise ValueError("`store_name` must be a string if provided.")

            # Cache key
            cache_key_list = args[
                ctx_index + 1 :
            ]  # Skip `ctx` and `self` if present
            if key_fn:
                try:
                    cache_key_list = key_fn(*args, **kwargs)
                    if not isinstance(cache_key_list, list):
                        raise ValueError(
                            "Custom key function must return a list."
                        )
                except Exception as e:
                    raise ValueError(
                        f"Failed to create custom cache key `{func.__name__}`: {e}"
                    )

            cache_key = str(hashkey(_convert_args_to_dict(cache_key_list)))

            store = ExecutionStore.create(
                store_name=resolved_store_name, dataset_id=dataset_id
            )

            cached_value = store.get(cache_key)
            if cached_value is not None:
                return cached_value  # Cache hit

            result = func(*args, **kwargs)
            store.set(cache_key, result, ttl=ttl)
            return result

        return wrapper

    return decorator


def _resolve_store_name(ctx, func, store_name=None):
    if store_name is None:
        return f"{ctx.operator_uri}#{func.__name__}"

    return store_name


def _get_ctx_from_args(args):
    from fiftyone.operators import ExecutionContext

    ctx_index = -1
    for i, arg in enumerate(args):
        if isinstance(arg, ExecutionContext):
            ctx_index = i
            break
    return args[ctx_index] if ctx_index >= 0 else None, ctx_index


def _convert_args_to_dict(args):
    result = []
    for arg in args:
        if isinstance(arg, object):
            if hasattr(arg, "to_dict"):
                arg = arg.to_dict()
            elif hasattr(arg, "to_json"):
                arg = arg.to_json()

        result.append(arg)

    return result
