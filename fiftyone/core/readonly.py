"""
Helpers for implementing read-only versions of data objects

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
from functools import wraps


class ReadOnlyObjectException(Exception):
    def __init__(self, class_name):
        message = f"Cannot edit a read-only {class_name} object"
        super().__init__(message)


def _get_argument_by_param_name(func, param_name, *args, **kwargs):
    # Resolve function arguments
    bound_args = inspect.signature(func).bind(*args, **kwargs)
    bound_args.apply_defaults()

    # Support "." notation to get nested fields
    chunks = param_name.split(".")
    param_name = chunks[0]
    nested_attrs = chunks[1:]

    if param_name in bound_args.arguments:
        arg = bound_args.arguments[param_name]
    elif param_name in kwargs:
        arg = kwargs[param_name]
    else:
        raise RuntimeError(
            f"Param '{param_name}' is not in signature"
            f" of function '{func.__name__}'"
        )

    # Traverse nested attributes if any, get()ing or getattr()ing along the way.
    for attr in nested_attrs:
        if arg is None:
            break
        elif isinstance(arg, dict):
            arg = arg.get(attr, None)
        else:
            arg = getattr(arg, attr, None)

    return arg


def mutates_data(
    maybe_func=None, *, condition_param=None, data_obj_param="self"
):
    def check_readonly_decorator(func):
        @wraps(func)
        def check_readonly_wrapper(*args, **kwargs):
            try:
                data_object = _get_argument_by_param_name(
                    func, data_obj_param, *args, **kwargs
                )
            except TypeError:
                # If we get a TypeError here that means the arguments are
                #   invalid so we can just run the function which will throw
                #   the TypeError itself, thus leaving ourselves out of the
                #   stack trace.
                pass

            else:
                if hasattr(data_object, "_readonly") and bool(
                    data_object._readonly
                ):
                    if condition_param is None or bool(
                        _get_argument_by_param_name(
                            func, condition_param, *args, **kwargs
                        )
                    ):
                        raise ReadOnlyObjectException(
                            type(data_object).__name__
                        )

            return func(*args, **kwargs)

        return check_readonly_wrapper

    return (
        check_readonly_decorator(maybe_func)
        if maybe_func
        else check_readonly_decorator
    )
