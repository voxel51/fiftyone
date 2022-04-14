import copy
import numbers
import re
import typing as t
from dataclasses import replace
from datetime import date, datetime

import fiftyone.core.utils as fou
import six

from .datafield import MISSING, Field, field, fields


__all__ = ["asdict", "is_data", "sample"]

_FIFTYONE_REGEX = re.compile("^__fiftyone_\w+__$")
_DUNDER_REGEX = re.compile("^__\w+__$")

_SCHEMA_NAME = "__fiftyone_schema__"

_POST_INIT_NAME = "__post_init__"


_D = t.TypeVar("_D", bound="Data")
_T = t.TypeVar("_T")


def __dataclass_transform__(
    *,
    eq_default: bool = True,
    order_default: bool = False,
    kw_only_default: bool = True,
    field_descriptors: t.Tuple[
        t.Union[t.Type, t.Callable[..., t.Any]], ...
    ] = (()),
) -> t.Callable[[_T], _T]:
    return lambda a: a


def _get_field(cls: t.Type, a_name: str, a_type: t.Type) -> Field:
    default = getattr(cls, a_name, MISSING)

    field: Field
    if isinstance(default, Field):
        field = default
    else:
        field = Field(default=default)

    field.name = a_name
    field.type = a_type

    if isinstance(field.default, (list, dict, set)):
        raise FiftyOneDataError(
            f"mutable default {type(field.default)} for field "
            f"{field.name} is not allowed: use default_factory"
        )

    return field


@__dataclass_transform__(
    kw_only_default=True, field_descriptors=(field, Field)
)
class DataMetaclass(type):
    def __init__(
        cls,
        __name: str,
        __bases: t.Tuple[t.Type, ...],
        __dict: t.Dict[str, t.Any],
        **kwds: t.Any,
    ) -> None:
        super().__init__(__name, __bases, __dict, **kwds)
        field_data: t.Dict[str, Field] = {}
        for b in cls.__mro__[-1:0:-1]:
            base_fields = getattr(b, _SCHEMA_NAME, None)
            if base_fields:
                for field in base_fields.values():
                    field_data[field.name] = field

        cls_annotations = cls.__dict__.get("__annotations__", {})
        cls_fields = [
            _get_field(cls, name, type)
            for name, type in cls_annotations.items()
            if not _FIFTYONE_REGEX.fullmatch(name)
        ]

        for field in cls_fields:
            field_data[field.name] = field

            if isinstance(getattr(cls, field.name, None), Field):
                if field.default is MISSING:
                    delattr(cls, field.name)
                else:
                    setattr(cls, field.name, field.default)

        for name, value in cls.__dict__.items():
            if isinstance(value, Field) and not name in cls_annotations:
                raise FiftyOneDataError(
                    f"{name!r} is a field but has no type annotation"
                )

        cls.__fiftyone_schema__ = field_data


class Data(metaclass=DataMetaclass):

    __fiftyone_collection__: t.ClassVar[t.Optional[str]] = None
    __fiftyone_path__: t.ClassVar[t.Optional[str]] = None
    __fiftyone_schema__: t.ClassVar[t.Dict[str, Field]] = {}

    def __init__(self, **data: t.Dict[str, t.Any]) -> None:

        self.__fiftyone_schema__ = self.__fiftyone_schema__.copy()  # type: ignore
        for name, value in data.items():
            if value is None:
                continue

            field = self.__fiftyone_ensure_field__(name, value)
            if value is not None and field.validator:
                field.validator(value)

            if isinstance(value, Data):
                _inherit_data(self, name, value)

            self.__dict__[name] = value

        has_post_init = hasattr(self, _POST_INIT_NAME)
        if has_post_init:
            getattr(self, _POST_INIT_NAME)()

    def __getattribute__(self, __name: str) -> t.Any:
        if _DUNDER_REGEX.fullmatch(__name):
            return super().__getattribute__(__name)

        field = self.__fiftyone_field__(__name)
        if field is None:
            return super().__getattribute__(__name)

        return self.__getitem__(__name, field)

    def __getitem__(self, __name: str, field: Field = None) -> t.Any:
        if field is None:
            field = self.__fiftyone_field__(__name)

        if field is None:
            raise KeyError(
                f"'{self.__class__.__name__}' has no field '{__name}'"
            )

        if field.link:
            __value = self[field.link]
        else:
            __value = self.__dict__.get(__name, None)

        __value = (
            __value
            if __value is None or not field.load
            else field.load(__value)
        )

        if (
            field.type
            and issubclass(field.type, Data)
            and isinstance(__value, dict)
        ):
            __value = field.type.__fiftyone_construct__(
                self.__fiftyone_collection__,
                (
                    ".".join([self.__fiftyone_path__, __name])
                    if self.__fiftyone_path__
                    else __name
                ),
                self.__fiftyone_schema__,
                __value,
            )

        return __value

    def __setattr__(self, __name: str, __value: t.Any) -> None:
        field = self.__fiftyone_field__(__name)
        if field is None:
            return super().__setattr__(__name, __value)

        if __value is None:
            self.__dict__.pop(__name, None)
            return

        field.validator and field.validator(__value)

        if isinstance(__value, Data):
            _inherit_data(self, __name, __value)
            __value = asdict(__value)
        elif field.dump:
            __value = field.dump(__value)

        self.__dict__[__name] = __value

    def __fiftyone_ensure_field__(self, __name: str, __value: t.Any) -> Field:
        field = self.__fiftyone_field__(__name)
        if field:
            return field

        field = Field(name=__name, type=_infer_type(__value))
        path = (
            ".".join([self.__fiftyone_path__, __name])
            if self.__fiftyone_path__
            else __name
        )
        self.__fiftyone_schema__[path] = field
        return field

    def __fiftyone_field__(self, __name: str) -> t.Union[Field, None]:
        key = self.__fiftyone_child_path__(__name)
        return self.__fiftyone_schema__.get(key, None)

    @property
    def __fiftyone_fields__(self) -> t.Iterator[str]:
        for name in self.__fiftyone_schema__:
            if self.__fiftyone_path__:
                name = name[len(self.__fiftyone_path__) + 1 :]

            if name and "." not in name:
                yield name

    def __fiftyone_child_path__(self, __name: str) -> str:
        if self.__fiftyone_path__:
            return ".".join([self.__fiftyone_path__, __name])

        return __name

    def __repr__(self) -> str:
        data = {}
        for name in self.__fiftyone_fields__:
            data[name] = self[name]

        return f"<{self.__class__.__name__}: {fou.pformat(data)}>"  # type: ignore

    @classmethod
    def __fiftyone_construct__(
        cls: t.Type[_D],
        __fiftyone_collection__: t.Optional[str],
        __fiftyone_path__: t.Optional[str],
        __fiftyone_schema__: t.Dict[str, Field],
        data: t.Dict[str, t.Any],
    ) -> _D:
        instance = cls()
        instance.__dict__ = data
        instance.__fiftyone_collection__ = __fiftyone_collection__  # type: ignore
        instance.__fiftyone_path__ = __fiftyone_path__  # type: ignore
        instance.__fiftyone_schema__ = __fiftyone_schema__  # type: ignore
        return instance


def _is_data_instance(obj: t.Any) -> bool:
    return isinstance(obj, Data)


def is_data(obj: t.Any) -> bool:
    cls = obj if isinstance(obj, type) else type(obj)
    return issubclass(cls, Data)


def asdict(obj: t.Any, *, dict_factory: t.Type = dict) -> dict:
    if not _is_data_instance(obj):
        raise TypeError("asdict() should be called on data instances")
    return _asdict_inner(obj, dict_factory)


def _asdict_inner(obj: t.Any, dict_factory: t.Callable) -> t.Any:
    if _is_data_instance(obj):
        result = []
        for f in fields(obj):
            if not f.name:
                continue
            value = _asdict_inner(getattr(obj, f.name), dict_factory)
            result.append((f.name, value))
        return dict_factory(result)
    elif isinstance(obj, tuple) and hasattr(obj, "_fields"):
        return type(obj)(*[_asdict_inner(v, dict_factory) for v in obj])
    elif isinstance(obj, (list, tuple)):
        return type(obj)(_asdict_inner(v, dict_factory) for v in obj)
    elif isinstance(obj, dict):
        return type(obj)(
            (_asdict_inner(k, dict_factory), _asdict_inner(v, dict_factory))
            for k, v in obj.items()
        )
    else:
        return copy.deepcopy(obj)


_PRIMITIVES = {bool, date, datetime, int, float, str}
_CONTAINERS: t.Set[t.Type] = {t.Dict, t.List, tuple}


def _infer_type(value: t.Any) -> t.Union[t.Type, None]:
    type_ = type(value)

    if type_ in _PRIMITIVES or issubclass(type_, Data):
        return type_

    if isinstance(value, numbers.Number):
        return float

    if isinstance(value, six.string_types):
        return str

    for t in _CONTAINERS:
        if isinstance(value, t):
            return t

    raise ValueError("todo")


def _inherit_data(parent: Data, name: str, data: Data) -> None:
    _merge_schema(
        parent.__fiftyone_schema__,
        {".".join([name, k]): v for k, v in data.__fiftyone_schema__.items()},
    )

    data_schema = data.__fiftyone_schema__
    prefix = (
        ".".join([parent.__fiftyone_path__, name])
        if parent.__fiftyone_path__
        else name
    )
    data.__fiftyone_path__ = prefix  # type: ignore
    data.__fiftyone_schema__ = parent.__fiftyone_schema__  # type: ignore

    for path, field in data_schema.items():
        if field.type and issubclass(field.type, Data):
            items = _get_items(path, data)
            for item in items:
                item.__fiftyone_collection__ = parent.__fiftyone_collection__  # type: ignore
                item.__fiftyone_path__ = ".".join([prefix, name])  # type: ignore
                item.__fiftyone_schema__ = parent.__fiftyone_schema__  # type: ignore


def _get_items(path: str, data: Data) -> t.List[Data]:
    if "." not in path:
        v = data[path]
        return v if isinstance(v, list) else [v]

    root, rest = path.split(".", 1)
    v = data[root]

    if not isinstance(v, list):
        v = [v]

    return _flatten([_get_items(rest, d) for d in v])


def _merge_schema(
    schema: t.Dict[str, Field], other: t.Dict[str, Field]
) -> None:
    paths = set(schema.keys()).union(set(other.keys()))
    for path in paths:
        if path in schema and path in other:
            # todo _merge_field()?
            assert schema[path].type == other[path].type
            continue

        if path not in schema:
            schema[path] = replace(other[path])


def _flatten(items: t.List) -> t.List:
    if items == []:
        return items
    if isinstance(items[0], list):
        return _flatten(items[0]) + _flatten(items[1:])
    return items[:1] + _flatten(items[1:])


class FiftyOneDataError(TypeError):
    pass
