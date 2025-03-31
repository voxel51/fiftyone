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
    return (
        getattr(func, attr) if hasattr(func, attr) else get_function_id(func)
    )


def resolve_store_name(ctx, func):
    store_name = (
        func.store_name
        if hasattr(func, "store_name")
        else get_function_id(func)
    )
    store_name = get_func_attr(func, "store_name", store_name)
    version = get_func_attr(func, "exec_cache_version")
    if version:
        store_name = f"{store_name}#v{version}"
    return store_name


def convert_args_to_dict(args):
    return [convert_arg_to_serializable_dict(arg) for arg in args]


def convert_arg_to_serializable_dict(arg):
    if isinstance(arg, etas.Serializable):
        return arg.serialize()
    elif hasattr(arg, "to_dict"):
        return arg.to_dict()
    elif hasattr(arg, "to_json"):
        return arg.to_json()
    return arg


def make_mongo_safe_dict(data):
    return {k: make_mongo_safe_value(v) for k, v in data.items()}


def make_mongo_safe_value(value):
    if isinstance(value, dict):
        return {str(k): make_mongo_safe_value(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple, set)):
        return [make_mongo_safe_value(v) for v in value]
    elif isinstance(value, np.ndarray):
        return [make_mongo_safe_value(v) for v in value.tolist()]
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


def get_store_for_func(ctx, func):
    resolved_name = resolve_store_name(ctx, func)
    link_to_dataset = hasattr(func, "link_to_dataset") and func.link_to_dataset
    return ExecutionStore.create(
        store_name=resolved_name,
        dataset_id=ctx.dataset._doc.id if link_to_dataset else None,
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
    store = get_store_for_func(ctx, func)

    return cache_key, store, skip_cache


def is_cache_disabled():
    fo.config
    return False
