"""
Execution cache utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from cachetools.keys import hashkey
import numpy as np
import json
import hashlib

import eta.core.serial as etas

import fiftyone as fo
from fiftyone.operators.store import ExecutionStore


def get_function_id(func):
    return f"{func.__module__}.{func.__qualname__}"


def get_ctx_from_args(args):
    ctx, ctx_index = get_ctx_idx(args)
    if ctx_index == -1 or ctx_index > 1:
        raise ValueError(
            f"execution_cache requires the first argument to be an ExecutionContext"
        )
    return ctx, ctx_index


def get_ctx_idx(args):
    from fiftyone.operators import ExecutionContext

    for i, arg in enumerate(args):
        if isinstance(arg, ExecutionContext):
            return arg, i

    return None, -1


def get_func_attr(func, attr, default=None):
    return getattr(func, attr) if hasattr(func, attr) else default


def resolve_store_name(ctx, func):
    store_name = get_func_attr(func, "store_name", get_function_id(func))
    version = get_func_attr(func, "exec_cache_version")
    if version:
        store_name = f"{store_name}#v{version}"
    return store_name


def get_store_for_func(ctx, func, collection_name=None):
    resolved_name = resolve_store_name(ctx, func)
    link_to_dataset = hasattr(func, "link_to_dataset") and func.link_to_dataset
    return ExecutionStore.create(
        store_name=resolved_name,
        dataset_id=ctx.dataset._doc.id if link_to_dataset else None,
        collection_name=collection_name,
    )


def build_cache_key(cache_key_list):
    structured_key = hashkey(*cache_key_list)
    key_string = json.dumps(structured_key, sort_keys=True)
    return hashlib.sha256(key_string.encode("utf-8")).hexdigest()


def get_cache_key_list(ctx_index, args, kwargs, key_fn):
    if key_fn:
        try:
            cache_key_list = key_fn(*args, **kwargs)
            if not isinstance(cache_key_list, list):
                raise ValueError("Custom key function must return a list.")
        except Exception as e:
            raise ValueError(f"Failed to create custom cache key: {e}")
    else:
        cache_key_list = args[ctx_index + 1 :]

    return convert_args_to_dict(cache_key_list)


def get_scoped_cache_key_list(
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


def resolve_cache_info(
    ctx,
    ctx_index,
    args,
    kwargs,
    key_fn,
    func,
    *,
    operator_scoped=False,
    user_scoped=False,
    prompt_scoped=False,
    jwt_scoped=False,
    collection_name=None,
):
    """
    Resolves the cache key and store for a given function call,
    including scope-based keys. Returns (cache_key, store, skip_cache).
    """
    cached_disabled = fo.config.execution_cache_enabled == False
    if cached_disabled:
        return None, None, True
    base_cache_key_list = get_cache_key_list(ctx_index, args, kwargs, key_fn)

    scoped_cache_key_list, skip_cache = get_scoped_cache_key_list(
        ctx,
        operator_scoped=operator_scoped,
        user_scoped=user_scoped,
        prompt_scoped=prompt_scoped,
        jwt_scoped=jwt_scoped,
    )

    cache_key_list = base_cache_key_list + scoped_cache_key_list
    cache_key = build_cache_key(cache_key_list)
    store = get_store_for_func(ctx, func, collection_name=collection_name)

    return cache_key, store, skip_cache


def convert_args_to_dict(args):
    return [auto_serialize(arg) for arg in args]


def auto_serialize(value):
    if isinstance(value, fo.Sample):
        return make_sample_dict(value)
    if isinstance(value, etas.Serializable):
        return value.serialize()
    elif hasattr(value, "to_dict"):
        return value.to_dict()
    elif hasattr(value, "to_json"):
        return value.to_json()
    elif isinstance(value, dict):
        return {str(k): auto_serialize(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [auto_serialize(v) for v in value]
    return value


def auto_deserialize(value):
    if is_sample_dict(value):
        value = {k: v for k, v in value.items() if k != "_cls"}
        return fo.Sample.from_dict(value)
    if isinstance(value, dict):
        return {str(k): auto_deserialize(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [auto_deserialize(v) for v in value]
    elif isinstance(value, np.ndarray):
        return [auto_deserialize(v) for v in value.tolist()]
    elif isinstance(value, (np.integer,)):
        return int(value)
    elif isinstance(value, (np.floating,)):
        val = float(value)
        if not np.isfinite(val):
            raise ValueError(
                "Non-finite float value cannot be stored in Execution Cache."
            )
        return val
    elif isinstance(value, (np.bool_, bool)):
        return bool(value)
    else:
        return value


def is_sample_dict(value):
    return (
        isinstance(value, dict)
        and "_cls" in value
        and value["_cls"] == "fiftyone.core.sample.Sample"
    )


def make_sample_dict(sample):
    return {"_cls": "fiftyone.core.sample.Sample", **sample.to_dict()}
