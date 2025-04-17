"""
Execution cache utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from cachetools.keys import hashkey
from dateutil import parser as dateparser
import hashlib
import json

import fiftyone as fo
from fiftyone.operators.store import ExecutionStore
import fiftyone.operators.cache.serialization as focs
from fiftyone.operators.cache.ephemeral import get_ephemeral_cache


def resolve_cache_info(
    ctx,
    ctx_index,
    args,
    kwargs,
    key_fn,
    func,
    *,
    residency="transient",
    operator_scoped=False,
    user_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
    collection_name=None,
    max_size=None,
):
    """
    Resolves the cache key, store, and memory cache for a given function call,
    including scope-based keys.

    Returns:
        A tuple: (cache_key, store, memory_cache, skip_cache)
    """
    cache_disabled = not fo.config.execution_cache_enabled
    if cache_disabled:
        return None, None, None, True

    base_cache_key_tuple = _get_cache_key_tuple(
        ctx_index, args, kwargs, key_fn
    )

    scoped_cache_key_list, skip_cache = _get_scoped_cache_key_list(
        ctx,
        operator_scoped=operator_scoped,
        user_scoped=user_scoped,
        prompt_scoped=prompt_scoped,
        jwt_scoped=jwt_scoped,
    )

    cache_key_list = list(base_cache_key_tuple) + scoped_cache_key_list
    cache_key = _build_cache_key(cache_key_list)

    memory_cache = None
    store = None

    if residency == "ephemeral":
        func_id = _get_function_id(func)
        memory_cache = get_ephemeral_cache(func_id, max_size=max_size)
    elif residency == "hybrid":
        func_id = _get_function_id(func)
        memory_cache = get_ephemeral_cache(func_id, max_size=max_size)
        store = _get_store_for_func(
            func,
            dataset_id=ctx.dataset._doc.id,
            collection_name=collection_name,
        )
    elif residency == "transient":
        store = _get_store_for_func(
            func,
            dataset_id=ctx.dataset._doc.id,
            collection_name=collection_name,
        )

    return cache_key, store, memory_cache, skip_cache


def _get_function_id(func):
    return f"{func.__module__}.{func.__qualname__}"


def _get_ctx_from_args(args):
    ctx, ctx_index = _get_ctx_idx(args)
    if ctx_index == -1 or ctx_index > 1:
        raise ValueError(
            "execution_cache requires the first argument to be an ExecutionContext"
        )
    return ctx, ctx_index


def _get_ctx_idx(args):
    from fiftyone.operators import ExecutionContext

    for i, arg in enumerate(args):
        if isinstance(arg, ExecutionContext):
            return arg, i

    return None, -1


def _resolve_store_name(func):
    store_name = getattr(func, "store_name", None) or _get_function_id(func)
    version = getattr(func, "exec_cache_version", None)
    if version:
        store_name = f"{store_name}#v{version}"
    return store_name


def _get_store_for_func(func, dataset_id=None, collection_name=None):
    resolved_name = _resolve_store_name(func)
    link_to_dataset = hasattr(func, "link_to_dataset") and func.link_to_dataset
    if link_to_dataset and dataset_id is None:
        raise ValueError(
            f"{func.__name__} is linked to a dataset but no dataset_id was provided."
        )
    return ExecutionStore.create(
        store_name=resolved_name,
        dataset_id=dataset_id if link_to_dataset else None,
        collection_name=collection_name,
    )


def _build_cache_key(cache_key_list):
    serialized_key_list = focs.auto_serialize(cache_key_list)
    structured_key = hashkey(*serialized_key_list)
    key_string = json.dumps(structured_key, sort_keys=True)
    return hashlib.sha256(key_string.encode("utf-8")).hexdigest()


def _get_cache_key_tuple(ctx_index, args, kwargs, key_fn):
    if key_fn:
        try:
            cache_key_list = key_fn(*args, **kwargs)
            if isinstance(cache_key_list, list):
                cache_key_list = tuple(cache_key_list)
            elif not isinstance(cache_key_list, tuple):
                raise ValueError(
                    "Custom key function must return a tuple or list."
                )
        except Exception as e:
            raise ValueError(f"Failed to create custom cache key: {e}")
    else:
        cache_key_list = tuple(args[ctx_index + 1 :])

    return cache_key_list


def _get_scoped_cache_key_list(
    ctx,
    operator_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
    user_scoped=False,
):
    scoped_keys = []
    skip_cache = False

    scopes = [
        (operator_scoped, lambda: ctx.operator_uri, True),
        (prompt_scoped, lambda: ctx.prompt_id, True),
        (jwt_scoped, lambda: ctx.user_request_token, False),
        (user_scoped, lambda: ctx.user_id, False),
    ]

    for enabled, get_value, allow_missing in scopes:
        if enabled:
            value = get_value()
            if value:
                scoped_keys.append(value)
            elif allow_missing is False:
                skip_cache = True

    return scoped_keys, skip_cache


def _is_sample_dict(value):
    return (
        isinstance(value, dict)
        and "_cls" in value
        and value["_cls"] == "fiftyone.core.sample.Sample"
    )


def _make_sample_dict(sample):
    return {"_cls": "fiftyone.core.sample.Sample", **sample.to_dict()}


def _try_parse_date(value):
    if isinstance(value, str):
        try:
            parsed = dateparser.parse(value)
            return parsed
        except (ValueError, OverflowError):
            return value
    return value
