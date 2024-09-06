"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
from typing import Any

import motor

from fiftyone.api.pymongo import proxy


class MotorProxyMeta(proxy.PymongoProxyMeta):
    """Metaclass for wrapping Motor public methods with proxy"""

    # pylint: disable=no-self-argument
    def _wrap_member(
        cls, name: str, member: Any, *_, is_async: bool = False, **__
    ) -> Any:
        if is_async:

            async def ainner(instance, *args, **kwargs):
                return instance.__proxy_it__(name, args, kwargs)

            return ainner

        else:
            return super()._wrap_member(name, member)

    def _wrap_members(cls):  # pylint: disable=no-self-argument
        # Get the public members defined on the class.
        implemented = {
            n: m for n, m in inspect.getmembers(cls) if not n.startswith("_")
        }

        # Get list of methods that are async.
        async_method_names = {
            name
            for base in reversed(inspect.getmro(cls.__proxy_class__))
            for name, attr in base.__dict__.items()
            if isinstance(attr, motor.metaprogramming.Async)
            or getattr(attr, "coroutine_annotation", False)
        }

        # Get the members defined on the Pymongo base class.
        for name, member in inspect.getmembers(cls.__proxy_class__):
            # Ignore protected or manually overriden members on the class
            if name.startswith("_"):
                continue

            is_async = name in async_method_names

            if name in implemented and (
                not is_async or inspect.iscoroutinefunction(implemented[name])
            ):
                continue

            # pylint: disable-next=no-value-for-parameter
            yield name, cls._wrap_member(name, member, is_async=is_async)
