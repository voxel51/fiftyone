"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
import codecs
import inspect
from typing import Any, Iterable, List, Mapping, Optional, Tuple, Union, Type

import dill as pickle
import motor

from fiftyone.api import client
from fiftyone.api.pymongo.proxy import abstract as pymongo_abstract


class MotorProxyMeta(abc.ABCMeta):
    @classmethod
    def __prepare__(mcs, __name: str, __bases: Tuple[Type, ...], **kwds: Any):
        return super().__prepare__(__name, __bases, **kwds)

    def __new__(
        mcs,
        name: Any,
        bases: Any,
        namespace: Any,
        motor_cls: Optional[Any] = None,
        **kwargs: Any
    ):
        # Create new class.
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        # Concrete implementation inheriting from AbstractPymongoProxy.
        if not inspect.isabstract(cls) and issubclass(
            cls, pymongo_abstract.AbstractPymongoProxy
        ):
            if not motor_cls:
                raise ValueError("'motor_cls' is required.")

            # Get the public members defined on the class.
            implemented = {
                n for n, _ in inspect.getmembers(cls) if not n.startswith("_")
            }

            # Get list of methods that are async.
            async_method_names = {
                name
                for base in reversed(inspect.getmro(motor_cls))
                for name, attr in base.__dict__.items()
                if isinstance(attr, motor.metaprogramming.Async)
            }

            # Get the members defined on the Pymongo base class.
            for member_name, member in inspect.getmembers(motor_cls):
                # Ignore protected or manually overriden members on the class
                if member_name.startswith("_") or member_name in implemented:
                    continue

                # Dynamically add proxy to remote on member
                if inspect.isfunction(member):
                    setattr(
                        cls,
                        member_name,
                        pymongo_abstract.execute_instance_method(
                            member_name,
                            is_async=member_name in async_method_names,
                        ),
                    )
                else:
                    setattr(
                        cls,
                        member_name,
                        property(
                            pymongo_abstract.get_instance_attribute(
                                member_name
                            )
                        ),
                    )

            # Explcitly add `motor_cls` to base, to pass `isinstance` checks.
            cls.__bases__ = (*bases, motor_cls)

        return cls
