"""
Execution cache decorator.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.operators.cache.utils import (
    _get_ctx_from_args,
    resolve_cache_info,
    _get_store_for_func,
)
from fiftyone.operators.cache.serialization import (
    auto_deserialize,
    auto_serialize,
)

from functools import wraps

_FUNC_ATTRIBUTES = [
    "store_name",
    "link_to_dataset",
    "exec_cache_version",
    "uncached",
    "clear_cache",
    "set_cache",
    "clear_all_caches",
]

_RESIDENCY_OPTIONS = [
    "transient",
    "ephemeral",
    "hybrid",
]


def execution_cache(
    _func=None,
    *,
    residency="hybrid",
    ttl=None,
    max_size=None,
    link_to_dataset=True,
    key_fn=None,
    store_name=None,
    version=None,
    operator_scoped=False,
    user_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
    collection_name=None,
    serialize=None,
    deserialize=None,
):
    """Decorator for caching function results in an
    :class:`ExecutionStore <fiftyone.operators.store.ExecutionStore>`.

    The function being cached must:

    -   accept a :class:`ctx <fiftyone.operators.executor.ExecutionContext>`
        as the first parameter
    -   be idempotent, i.e., same inputs produce the same outputs
    -   have serializable function arguments and return values
    -   have no side effects

    .. note::

        When ``residency != "ephemeral"``, cached values must be coerced to
        JSON safe types in order to be stored. By default, a default JSON
        converter is used that can handle many common types, but you can
        override this behavior if necessary by providing custom ``serialize``
        and ``deserialize`` functions.

    Examples::

        from fiftyone.operators import execution_cache

        # Default behavior: cache for the life of a dataset
        @execution_cache
        def expensive_query(ctx, path):
            return ctx.dataset.count_values(path)

        # Cache in-memory, and only while the current operator prompt modal is open
        @execution_cache(prompt_scoped=True, residency="ephemeral")
        def expensive_query(ctx, path):
            return ctx.dataset.count_values(path)

        # Cache with a custom TTL and store name
        class Processor:
            @execution_cache(ttl=60, store_name="processor_cache")
            def expensive_query(self, ctx, path):
                return ctx.dataset.count_values(path)

        #
        # Cache at the user-level
        #

        def custom_key_fn(ctx, path):
            return path, ctx.user_id

        @execution_cache(ttl=90, key_fn=custom_key_fn, jwt_scoped=True)
        def user_specific_query(ctx, path):
            return ctx.dataset.match(F("creator_id") == ctx.user_id).count_values(path)

        #
        # You can manually bypass/modify the cache if necessary
        #

        # Bypass the cache
        result = expensive_query.uncached(ctx, path)

        # Set the cache for the given arguments
        expensive_query.set_cache(ctx, path, value_to_cache)

        # Clear the cache for a specific input
        expensive_query.clear_cache(ctx, path)

        # Clear all cache entries for the function
        expensive_query.clear_all_caches()
        expensive_query.clear_all_caches(dataset_id=dataset._doc.id)

    Args:
        residency ("hybrid"): the residency of the cache. Can be one of:

            -   ``"transient"``: the cache is stored in the execution store
                with ``policy="evict"``
            -   ``"ephemeral"``: the cache is stored in memory and is cleared
                when the process ends
            -   ``"hybrid"`` (default): a combination of transient and
                ephemeral. The cache is stored in memory and in the execution
                store. The memory cache is used first, and if the value is not
                found, it falls back to the execution store
        ttl (None): a time-to-live for cached values, in seconds
        max_size (None): a maximum size for ephemeral caches. The default size
            is 1024. The cache will evict the least recently used items when
            the size exceeds this limit
        link_to_dataset (True): whether to namespace cache entries to the
            current dataset. If True, any cached values are automatically
            deleted when the dataset is deleted
        key_fn (None): a custom function to generate cache keys. By default,
            the function arguments are used as the key by serializing them as
            JSON
        store_name (None): a custom name for the execution store backing the
            cache. Defaults to the function name
        version (None): a version number to prevent cache collisions when the
            function implementation changes
        operator_scoped (False): whether to tie the cache entry to the current
            operator
        user_scoped (False): whether to tie the cache entry to the current user
        prompt_scoped (False): whether to tie the cache entry to the current
            operator prompt
        jwt_scoped (False): whether to tie the cache entry to the current
            user's JWT
        collection_name (None): override the default collection name for the
            execution store used by the cache. The default is
            ``"execution_store"``
        serialize (None): a custom serialization function to use when caching
            values and function arguments
        deserialize (None): a custom deserialization function when retrieving
            cached values
    """
    if serialize is None:
        if residency == "ephemeral":
            serialize = lambda v: v
        else:
            serialize = auto_serialize

    if deserialize is None:
        deserialize = auto_deserialize

    def decorator(func):
        for attr in _FUNC_ATTRIBUTES:
            if hasattr(func, attr):
                raise ValueError(
                    f"Function {func.__name__} is already decorated with "
                    f"@execution_cache and cannot be decorated again."
                )

        if residency not in _RESIDENCY_OPTIONS:
            raise ValueError(
                f"Invalid residency option '{residency}'. "
                f"Valid options are: {_RESIDENCY_OPTIONS}"
            )

        # max_size is only applicable for ephemeral and hybrid residency
        if max_size is not None and residency not in ("ephemeral", "hybrid"):
            raise ValueError(
                "max_size is only valid for ephemeral and hybrid residency."
            )

        func.store_name = store_name
        func.link_to_dataset = link_to_dataset
        func.exec_cache_version = version

        @wraps(func)
        def wrapper(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, memory_cache, skip_cache = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
                max_size=max_size,
            )
            if skip_cache:
                return func(*args, **kwargs)

            # Hybrid or Ephemeral
            if memory_cache is not None and cache_key in memory_cache:
                return deserialize(memory_cache[cache_key])

            # Transient or Hybrid
            cached_value = None
            if store is not None:
                cached_value = store.get(cache_key)

            if cached_value is not None:
                result = deserialize(cached_value)

                # Hybrid: warm memory cache
                if memory_cache is not None:
                    memory_cache[cache_key] = serialize(result)

                return result

            # Cache miss
            result = func(*args, **kwargs)
            value_to_cache = serialize(result)

            if store is not None:
                store.set_cache(cache_key, value_to_cache, ttl=ttl)

            if memory_cache is not None:
                memory_cache[cache_key] = value_to_cache

            return result

        def uncached(*args, **kwargs):
            return func(*args, **kwargs)

        wrapper.uncached = uncached

        def clear_cache(*args, **kwargs):
            ctx, ctx_index = _get_ctx_from_args(args)
            cache_key, store, memory_cache, _ = resolve_cache_info(
                ctx,
                ctx_index,
                args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            if store is not None:
                store.delete(cache_key)
            if memory_cache is not None and cache_key in memory_cache:
                del memory_cache[cache_key]

        wrapper.clear_cache = clear_cache

        def set_cache(*args, **kwargs):
            arg_to_cache = args[-1]
            regular_args = args[:-1]
            ctx, ctx_index = _get_ctx_from_args(regular_args)
            cache_key, store, memory_cache, _ = resolve_cache_info(
                ctx,
                ctx_index,
                regular_args,
                kwargs,
                key_fn,
                func,
                residency=residency,
                operator_scoped=operator_scoped,
                user_scoped=user_scoped,
                prompt_scoped=prompt_scoped,
                jwt_scoped=jwt_scoped,
                collection_name=collection_name,
            )
            value_to_cache = serialize(arg_to_cache)

            if store is not None:
                store.set_cache(cache_key, value_to_cache, ttl=ttl)

            if memory_cache is not None:
                memory_cache[cache_key] = value_to_cache

        wrapper.set_cache = set_cache

        def clear_all_caches(dataset_id=None):
            if dataset_id is None and func.link_to_dataset:
                raise ValueError(
                    "dataset_id must be provided when link_to_dataset=True"
                )
            store = _get_store_for_func(
                func, dataset_id=dataset_id, collection_name=collection_name
            )
            store.clear_cache()

        wrapper.clear_all_caches = clear_all_caches

        return wrapper

    return decorator if _func is None else decorator(_func)
