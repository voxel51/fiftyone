"""
Execution cache utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from cachetools.keys import hashkey
import numpy as np

from fiftyone.operators.store import ExecutionStore


def get_ctx_from_args(args):
    ctx, ctx_index = get_ctx_idx(args)
    if ctx_index == -1 or ctx_index > 1:
        raise ValueError(
            f"@execution_cache requires the first argument to be an ExecutionContext"
        )
    return ctx, ctx_index


def get_ctx_idx(args):
    from fiftyone.operators import ExecutionContext

    for i, arg in enumerate(args):
        if isinstance(arg, ExecutionContext):
            return arg, i

    return None, -1


def resolve_store_name(ctx, func):
    store_name = func.store_name if hasattr(func, "store_name") else None
    return store_name or func.__name__


def convert_args_to_dict(args):
    result = []
    for arg in args:
        if hasattr(arg, "to_dict"):
            arg = arg.to_dict()
        elif hasattr(arg, "to_json"):
            arg = arg.to_json()
        result.append(arg)
    return result


def make_mongo_safe_dict(data):
    return {
        k: make_mongo_safe_list(v) if isinstance(v, np.ndarray) else v
        for k, v in data.items()
    }


def make_mongo_safe_list(data):
    if len(data) == 0:
        return data
    return [float(v) for v in data.tolist()]


def get_store_for_func(ctx, func):
    resolved_name = resolve_store_name(ctx, func)
    link_to_dataset = hasattr(func, "link_to_dataset") and func.link_to_dataset
    return ExecutionStore.create(
        store_name=resolved_name,
        dataset_id=ctx.dataset._doc.id if link_to_dataset else None,
    )


def build_cache_key(ctx, func, cache_key_list):
    ckl = str(hashkey(convert_args_to_dict(cache_key_list)))
    return f"{ctx.operator_uri}?ckl={ckl}"


def get_cache_key_list(ctx, ctx_index, args, kwargs, key_fn):
    if key_fn:
        try:
            cache_key_list = key_fn(*args, **kwargs)
            if not isinstance(cache_key_list, list):
                raise ValueError("Custom key function must return a list.")
        except Exception as e:
            raise ValueError(f"Failed to create custom cache key: {e}")
    else:
        cache_key_list = args[ctx_index + 1 :]

    return cache_key_list


def make_mongo_safe_result(result):
    if isinstance(result, dict):
        return make_mongo_safe_dict(result)
    if isinstance(result, list):
        return [make_mongo_safe_dict(d) for d in result]
    return result
