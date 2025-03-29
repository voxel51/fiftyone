"""
Execution cache decorator.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from functools import wraps
import numpy as np

from fiftyone.operators.store import ExecutionStore
from .utils import (
    get_ctx_from_args,
    make_mongo_safe_value,
    build_cache_key,
    get_store_for_func,
    get_cache_key_list,
)


def execution_cache(
    _func=None,
    *,
    ttl=None,
    link_to_dataset=True,  # TODO: rename to dataset_scoped
    key_fn=None,
    store_name=None,
    version=None,
    operator_scoped=False,
    user_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
):
    """
    Decorator for caching function results in an ``ExecutionStore``.

    The function must:
        - accept a `ctx` argument as the first parameter
        - return a serializable value
        - be idempotent (i.e., it should produce the same
            output for the same input) and not have any side effects
        - have serializeable parameters or a custom ``key_fn`` to generate
            cache keys

    Args:
        ttl (None): Time-to-live for the cached value in seconds.
        link_to_dataset (True): Whether to tie the cache entry to the dataset
        key_fn (None): A custom function to generate cache keys.
            If not provided, the function arguments are used as the key by serializing them as JSON.
        store_name (None): Custom name for the execution store.
            Defaults to the function name.
        version (None): Set a version number to prevent cache collisions
            when the function implementation changes.
        operator_scoped (False): Whether to tie the cache entry to the current operator
        user_scoped (False): Whether to tie the cache entry to the current user
        prompt_scoped (False): Whether to tie the cache entry to
            the current operator prompt
        jwt_scoped (False): Whether to tie the cache entry to the current user's JWT

    note::

        When using ``link_to_dataset=True``:
            - the associated store is deleted the dataset is deleted
            - the cache entry is namespaced to the dataset

    note::

        Return values will be coerced from JSON unsafe types to safe types.
        This may yield unexpected return values if the cached function returns
        non-serializable types (e.g., NumPy arrays), since they are converted
        to a JSON-compatible format.

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
        func.store_name = store_name
        func.link_to_dataset = link_to_dataset
        func.exec_cache_version = version

        @wraps(func)
        def wrapper(*args, **kwargs):
            # TODO: add a mechanism to entirely disable caching

            ctx, ctx_index = get_ctx_from_args(args)
            cache_key_list = get_cache_key_list(
                ctx, ctx_index, args, kwargs, key_fn
            )

            #
            # TODO: cleanup this logic, it's a bit of a mess with the elifs
            # <mess>
            #

            if operator_scoped:
                cache_key_list.append(ctx.operator_uri)

            if prompt_scoped:
                cache_key_list.append(ctx.operator_prompt_id)

            if jwt_scoped and ctx.user_request_token:
                cache_key_list.append(ctx.user_request_token)
            elif jwt_scoped:
                # refuse to cache JWT-scoped data without a JWT
                return func(*args, **kwargs)

            if user_scoped and ctx.user_id:
                cache_key_list.append(ctx.user_id)
            elif user_scoped:
                # refuse to cache user-scoped data without a user_id
                return func(*args, **kwargs)

            #
            # </mess>
            #

            cache_key = build_cache_key(cache_key_list)
            store = get_store_for_func(ctx, func)

            cached_value = store.get(cache_key)
            if cached_value is not None:
                return cached_value

            result = func(*args, **kwargs)
            result = make_mongo_safe_value(result)
            store.set_cache(cache_key, result, ttl=ttl)

            return result

        return wrapper

    return decorator if _func is None else decorator(_func)
