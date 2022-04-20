import copy
import numbers
import re
import typing as t
from dataclasses import replace
from datetime import date, datetime
import numpy as np

import eta.core.utils as etau
import fiftyone.core.utils as fou
import six

from .datafield import Field, field
from .dict import Dict
from .list import List

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
    default = getattr(cls, a_name, None)

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
                if field.default is None:
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

    __fiftyone_collections__: t.ClassVar[t.Optional[t.Dict[str, str]]] = None
    __fiftyone_path__: t.ClassVar[t.Optional[str]] = None
    __fiftyone_schema__: t.ClassVar[t.Dict[str, Field]] = {}

    def __init__(self, **data: t.Dict[str, t.Any]) -> None:
        self.__fiftyone_schema__ = self.__fiftyone_schema__.copy()  # type: ignore
        for name in set(data).union(self.__fiftyone_fields__):
            value = data.get(name, None)
            field = self.__fiftyone_ensure_field__(name, value)
            if value is None:
                if field.required and field.default_factory is None:
                    raise FiftyOneDataError(
                        f"required field '{name}' with no default or default factory must have a value"
                    )

                if field.default_factory is not None:
                    value = field.default_factory()

                if field.default is not None:
                    value = field.default

                if value is None:
                    continue

            if field.validator:
                field.validator(value)

            if isinstance(value, Data):
                _inherit_data(self, name, value)

            self.__dict__[name] = value

        has_post_init = hasattr(self, _POST_INIT_NAME)
        if has_post_init:
            getattr(self, _POST_INIT_NAME)()

    def __copy__(
        self: _D,
        path: t.Optional[str] = None,
        schema: t.Optional[t.Dict[str, Field]] = None,
        fields: t.Union[t.Iterable[str], t.Dict[str, str], str, None] = None,
        omit_fields: t.Union[t.List[str], t.Set[str], str, None] = None,
    ) -> _D:
        fields = _parse_fields(self, fields=fields, omit_fields=omit_fields)

        return self.__class__.__fiftyone_construct__(
            None,
            path,
            schema or _extract_schema(self),
            asdict(self, dict_factory=dict, links=False),
        )

    def __getattribute__(self, __name: str) -> t.Any:
        if _DUNDER_REGEX.fullmatch(__name):
            return super().__getattribute__(__name)

        field = self.__fiftyone_field__(__name)
        if field is None and __name not in self.__dict__:
            return super().__getattribute__(__name)

        return self.__getitem__(__name, field)

    def __getitem__(self, __name: str, field: Field = None) -> t.Any:
        if field is None:
            field = self.__fiftyone_field__(__name)

        if field and field.link:
            __value = self[field.link]
        else:
            __value = self.__dict__.get(__name, None)

        if field is None:
            if __value is not None:
                field = self.__fiftyone_ensure_field__(__name, __value)
            else:
                raise KeyError(
                    f"'{self.__class__.__name__}' has no field '{__name}'"
                )

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
                self.__fiftyone_collections__,
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

    def __fiftyone_child_path__(self, __name: str) -> str:
        if self.__fiftyone_path__:
            return ".".join([self.__fiftyone_path__, __name])

        return __name

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
    def __fiftyone_fields__(self) -> t.Dict[str, Field]:
        return {str(field.name): field for field in fields(self)}

    def __repr__(self) -> str:
        data = {}
        for name in self.__fiftyone_fields__:
            data[name] = self[name]

        return f"<{self.__class__.__name__}: {fou.pformat(data)}>"  # type: ignore

    @classmethod
    def __fiftyone_construct__(
        cls: t.Type[_D],
        __fiftyone_collections__: t.Optional[str],
        __fiftyone_path__: t.Optional[str],
        __fiftyone_schema__: t.Dict[str, Field],
        data: t.Dict[str, t.Any],
    ) -> _D:
        instance = cls()
        instance.__dict__ = data
        instance.__fiftyone_collections__ = __fiftyone_collections__  # type: ignore
        instance.__fiftyone_path__ = __fiftyone_path__  # type: ignore
        instance.__fiftyone_schema__ = __fiftyone_schema__  # type: ignore
        return instance


def _parse_fields(
    data: Data,
    fields: t.Union[t.Iterable[str], t.Dict[str, str], str, None] = None,
    omit_fields: t.Union[t.List[str], t.Set[str], str, None] = None,
) -> t.Dict[str, str]:
    if fields is None:
        fields = {
            f: f
            for f in data.__fiftyone_fields__
            if f != "_id" and not _is_link(data.__fiftyone_field__(f))
        }
    elif etau.is_str(fields):
        fields = {fields: fields}  # type: ignore

    if not isinstance(fields, dict):
        fields = {f: f for f in fields}

    if omit_fields is not None:
        if etau.is_str(omit_fields):
            omit_fields = {omit_fields}  # type: ignore
        else:
            omit_fields = set(omit_fields)

        fields = {k: v for k, v in fields.items() if k not in omit_fields}

    return fields


def _is_link(field: t.Optional[Field]) -> bool:
    if field is None:
        return False

    return field.link is not None


def _is_data_instance(obj: t.Any) -> bool:
    return isinstance(obj, Data)


def is_data(obj: t.Any) -> bool:
    cls = obj if isinstance(obj, type) else type(obj)
    return issubclass(cls, Data)


def asdict_default_factory(items: t.List[t.Tuple[str, t.Any]]) -> t.Dict:
    return {k: v for k, v in items if not k.startswith("_")}


def _asdict_inner(
    obj: t.Any,
    dict_factory: t.Callable[[t.List[t.Tuple[str, t.Any]]], t.Dict],
    links: bool,
) -> t.Any:
    if _is_data_instance(obj):
        result = []
        for field in fields(obj):
            if not field.name:
                continue

            if field.name == "id":
                continue

            if not links and field.link:
                continue

            value = _asdict_inner(
                getattr(obj, field.name), dict_factory, links
            )
            result.append((field.name, value))

        return dict_factory(result)

    if isinstance(obj, (list, tuple)):
        list_cls = list if isinstance(obj, List) else type(obj)
        return list_cls(_asdict_inner(v, dict_factory, links) for v in obj)

    if isinstance(obj, dict):
        dict_cls: t.Union[t.Type[t.Dict], t.Type[Dict]]
        if isinstance(obj, Dict):
            dict_cls = dict
        else:
            dict_cls = type(obj)
        return dict_cls(
            (
                _asdict_inner(k, dict_factory, links),
                _asdict_inner(v, dict_factory, links),
            )
            for k, v in obj.items()
        )

    return copy.deepcopy(obj)


def asdict(
    data: Data,
    *,
    dict_factory: t.Callable[
        [t.List[t.Tuple[str, t.Any]]], t.Dict
    ] = asdict_default_factory,
    links: bool = True,
) -> t.Dict:
    if not _is_data_instance(data):
        raise FiftyOneDataError("asdict() must be called with a data instance")

    return _asdict_inner(data, dict_factory, links)


def fields(data: t.Union[t.Type[Data], Data]) -> t.Tuple[Field, ...]:
    if not is_data(data):
        raise FiftyOneDataError(
            "fields() must be called with a data instance or class"
        )

    l: t.List[Field] = []
    for path in sorted(data.__fiftyone_schema__):
        name = (
            path[len(data.__fiftyone_path__) + 1 :]
            if data.__fiftyone_path__
            else path
        )

        if name and "." not in name:
            l.append(data.__fiftyone_schema__[path])

    return tuple(l)


PRIMITIVES = {bool, bytes, date, datetime, int, float, np.ndarray, str}
CONTAINERS: t.Set[t.Type] = {t.Dict, t.List, tuple}


def _infer_type(value: t.Any) -> t.Union[t.Type, None]:
    type_ = type(value)

    if type_ in PRIMITIVES or issubclass(type_, Data):
        return type_

    if isinstance(value, numbers.Number):
        return float

    if isinstance(value, six.string_types):
        return str

    for t in CONTAINERS:
        if isinstance(value, t):
            return t

    raise ValueError("todo")


def _extract_schema(data: Data) -> t.Dict[str, Field]:
    length = len(data.__fiftyone_path__) if data.__fiftyone_path__ else 0
    schema = {}
    for path, field in data.__fiftyone_schema__.items():
        if length and len(path) < length:
            continue

        path = path[length + 1 if length else 0 :]
        schema[path] = field

    return schema


def _inherit_data(parent: Data, name: str, data: Data) -> None:
    prefix = (
        ".".join([parent.__fiftyone_path__, name])
        if parent.__fiftyone_path__
        else name
    )

    merge_schema(
        parent.__fiftyone_schema__,
        {".".join([prefix, k]): v for k, v in _extract_schema(data).items()},
    )

    data_schema = data.__fiftyone_schema__

    data.__fiftyone_path__ = prefix  # type: ignore
    data.__fiftyone_schema__ = parent.__fiftyone_schema__  # type: ignore

    for path, field in data_schema.items():
        if field.type and issubclass(field.type, Data):
            items = _get_items(path, data)
            for item in items:
                item.__fiftyone_collections__ = parent.__fiftyone_collections__  # type: ignore
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


def merge_schema(
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
