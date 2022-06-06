import copy
from inspect import isclass
import numbers
import re
import typing as t
from dataclasses import replace

import eta.core.utils as etau
from torch import isin
import fiftyone.core.utils as fou
import six
from bson import ObjectId

from .containers import (
    Dict,
    List,
    is_container,
    is_any_base_container,
    is_dict,
    is_list,
    is_tuple,
    unwrap,
)
from .datafield import Field, field
from .definitions import PRIMITIVES
from .exceptions import FiftyOneDataError
from .reference import FiftyOneReference

__all__ = ["asdict", "is_data", "sample"]

_FIFTYONE_REGEX = re.compile("^__fiftyone_\w+__$")
_DUNDER_REGEX = re.compile("^__\w+__$")

_REF_NAME = "__fiftyone_ref__"

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


def _return_type(method: t.Optional[t.Callable]) -> t.Optional[t.Type]:
    return (
        None
        if not method
        else getattr(method, "__annotations", {}).get("return", None)
    )


def _get_field(cls: t.Type, name: str, type_: t.Type) -> Field:

    default = getattr(cls, name, None)

    if is_container(type_, t.ClassVar):
        type_ = type_.__args__[0]

    field: Field
    if isinstance(default, Field):
        field = default
    else:
        field = Field(default=default)

    field.name = name
    field.type = type_

    if (
        type_ not in PRIMITIVES
        and not is_any_base_container(type_)
        and not issubclass(type_, Data)
        and _return_type(field.dump) != type_
    ):
        raise FiftyOneDataError(
            f"invalid field type {type_}, only {dict}, {list}, {tuple}, "
            f"{'.'.join(map(lambda v: str(v), PRIMITIVES))}, and {Data} types"
            " are allowed"
        )  # todo: consider dump extensions

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
        cls: t.Type["Data"],
        __name: str,
        __bases: t.Tuple[t.Type, ...],
        __dict: t.Dict[str, t.Any],
        **kwds: t.Any,
    ) -> None:
        super().__init__(__name, __bases, __dict, **kwds)  # type: ignore
        schema: t.Dict[str, Field] = {}
        for base in cls.__mro__[-1:0:-1]:
            base_ref: "FiftyOneReference" = getattr(base, _REF_NAME, None)
            if base_ref:
                for field in base_ref.schema.values():
                    schema[field.name] = field

        cls_annotations = cls.__dict__.get("__annotations__", {})
        cls_fields = [
            _get_field(cls, name, type)
            for name, type in cls_annotations.items()
            if not _FIFTYONE_REGEX.fullmatch(name)
        ]

        for field in cls_fields:
            schema[field.name] = field

            if isinstance(getattr(cls, field.name, None), Field):
                if field.default is None:
                    delattr(cls, field.name)
                else:
                    setattr(cls, field.name, field.default)

            leaf_cls = get_leaf_cls(field.type)
            if isinstance(leaf_cls, tuple):
                continue

            if issubclass(leaf_cls, Data):
                merge_schema(
                    schema,
                    {
                        ".".join([field.name, k]): v
                        for k, v in _extract_schema(leaf_cls).items()
                    },
                )

        for field in cls_fields:
            if field.link and field.required != schema[field.link].required:
                raise FiftyOneDataError("required mismatch")

        for name, value in cls.__dict__.items():
            if isinstance(value, Field) and not name in cls_annotations:
                raise FiftyOneDataError(
                    f"{name!r} is a field but has no type annotation"
                )

        cls.__fiftyone_ref__ = FiftyOneReference(schema=schema)


class Data(metaclass=DataMetaclass):

    __fiftyone_ref__: t.ClassVar[FiftyOneReference] = FiftyOneReference()
    __fiftyone_path__: t.ClassVar[t.Optional[str]] = None
    __fiftyone_constructing__: t.ClassVar[bool] = False

    def __init__(self, **data: t.Dict[str, t.Any]) -> None:
        if self.__fiftyone_constructing__:
            return

        self.__fiftyone_ref__ = replace(  # type: ignore
            self.__fiftyone_ref__,
            schema=self.__fiftyone_ref__.schema.copy(),
        )
        for name in set(data).union(self.__fiftyone_fields__):
            value = data.get(name, None)
            field, value = self.__fiftyone_validate__(name, value, True)
            if field is None:
                continue

            self.__dict__[name] = value

        has_post_init = hasattr(self, _POST_INIT_NAME)
        if has_post_init:
            getattr(self, _POST_INIT_NAME)()

    def __copy__(
        self: _D,
        fields: t.Union[t.Iterable[str], t.Dict[str, str], str, None] = None,
        omit_fields: t.Union[t.List[str], t.Set[str], str, None] = None,
    ) -> _D:
        fields = _parse_fields(self, fields=fields, omit_fields=omit_fields)

        return self.__class__.__fiftyone_construct__(
            FiftyOneReference(schema=_extract_schema(self)),
            None,
            asdict(
                self,
                dict_factory=lambda d: dict(
                    (k, ObjectId()) if k == "_id" else (k, v) for k, v in d
                ),
                links=False,
            ),
        )

    def __delattr__(self, __name: str) -> None:
        field = self.__fiftyone_field__(__name)
        if __name.startswith("__") or field is None:
            return super().__delattr__(__name)

        if field.required:
            raise FiftyOneDataError("cannot delete required field")

        self.__dict__.pop(__name, None)

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
                self.__fiftyone_ref__.commit()
                field = self.__fiftyone_field__(__name)
            else:
                raise KeyError(
                    f"'{self.__class__.__name__}' has no field '{__name}'"
                )

        if field is None:
            raise FiftyOneDataError("err")

        if __value is None:
            return None

        path = (
            ".".join([self.__fiftyone_path__, __name])
            if self.__fiftyone_path__
            else __name
        )

        if is_dict(field.type):
            if not isinstance(__value, Dict):
                __value = Dict.__fiftyone_construct__(
                    self.__fiftyone_ref__,
                    path,
                    __value,
                )
                self.__dict__[__name] = __value

            return __value

        if is_list(field.type):
            if not isinstance(__value, List):
                __value = List.__fiftyone_construct__(
                    self.__fiftyone_ref__,
                    path,
                    __value,
                )
                self.__dict__[__name] = __value

            return __value

        __value = field.load(__value) if field.load else __value

        if (
            field.type
            and issubclass(field.type, Data)
            and isinstance(__value, dict)
        ):
            __value = field.type.__fiftyone_construct__(
                self.__fiftyone_ref__,
                path,
                __value,
            )
            self.__dict__[__name] = __value

        return __value

    def __setattr__(
        self, __name: str, __value: t.Any, __create: bool = False
    ) -> None:
        if __name.startswith("__"):
            return super().__setattr__(__name, __value)

        field, _ = self.__fiftyone_validate__(__name, __value, False)

        if field is None and not __create:
            raise ValueError("cannot set undefined field")

        if __value is None:
            if field.required:
                raise FiftyOneDataError("cannot delete required field")

            self.__dict__.pop(__name, None)
            return

        if isinstance(__value, Data):
            inherit_data(
                self.__fiftyone_path__, self.__fiftyone_ref__, __name, __value
            )
            __value = asdict(__value)
        elif field.dump:
            __value = field.dump(__value)

        self.__dict__[__name] = __value

    def __setitem__(self, __name: str, __value: t.Any) -> None:
        self.__setattr__(__name, __value, True)

    def __fiftyone_child_path__(self, __name: str) -> str:
        if self.__fiftyone_path__:
            return ".".join([self.__fiftyone_path__, __name])

        return __name

    def __fiftyone_field__(self, __name: str) -> t.Union[Field, None]:
        key = self.__fiftyone_child_path__(__name)
        return self.__fiftyone_ref__.schema.get(key, None)

    def __fiftyone_validate__(
        self, __name: str, __value: t.Any, __init: bool
    ) -> t.Tuple[t.Optional[Field], t.Any]:
        field = self.__fiftyone_field__(__name)
        path = (
            ".".join([self.__fiftyone_path__, __name])
            if self.__fiftyone_path__
            else __name
        )
        if not field:
            if __value is None:
                return None, None

            field = Field(name=__name, type=_infer_type(__value))
            self.__fiftyone_ref__.schema[path] = field

        if __init and __value is None:
            if field.default_factory is not None:
                __value = field.default_factory()
            elif field.default is not None:
                __value = field.default
            elif field.required and not field.link:
                raise FiftyOneDataError(
                    f"required field '{path}' with no default or default factory must have a value"
                )

        if __value is None:
            return field, __value

        if is_list(field.type):
            if isinstance(__value, list):
                l: List[t.Any] = List.__fiftyone_construct__(
                    self.__fiftyone_ref__, path, []
                )
                for item in __value:
                    l.append(item)
            else:
                raise FiftyOneDataError(
                    f"invalid value {__value} for path '{path}', expected {field.type}"
                )

        elif is_dict(field.type):
            if isinstance(__value, dict):
                d: Dict[t.Any, t.Any] = Dict.__fiftyone_construct__(
                    self.__fiftyone_ref__, path, {}
                )
                for key, value in __value.items():
                    d[key] = value
            else:
                raise FiftyOneDataError(
                    f"invalid value {__value} for path '{path}', expected {field.type}"
                )

        elif not isinstance(__value, field.type):
            raise FiftyOneDataError(
                f"invalid value {__value} for path '{path}', expected {field.type}"
            )

        if field.validator:
            field.validator(__value)

        if isinstance(__value, Data):
            inherit_data(
                self.__fiftyone_path__, self.__fiftyone_ref__, __name, __value
            )

        return field, __value

    @property
    def __fiftyone_fields__(self) -> t.Dict[str, Field]:
        return {str(field.name): field for field in fields(self)}

    def __repr__(self) -> str:
        data = {}
        for name in self.__fiftyone_fields__:
            if name.startswith("_"):
                continue

            value = self[name]

            if value is None:
                continue

            data[name] = self[name]

        return f"<{self.__class__.__name__}: {fou.pformat(data)}>"  # type: ignore

    @classmethod
    def __fiftyone_construct__(
        cls: t.Type[_D],
        __fiftyone_ref__: FiftyOneReference,
        __fiftyone_path__: t.Optional[str],
        data: t.Dict[str, t.Any],
    ) -> _D:
        cls.__fiftyone_constructing__ = True
        instance = cls()
        instance.__dict__ = data
        instance.__fiftyone_ref__ = __fiftyone_ref__  # type: ignore
        instance.__fiftyone_path__ = __fiftyone_path__  # type: ignore

        has_post_init = hasattr(instance, _POST_INIT_NAME)
        if has_post_init:
            getattr(instance, _POST_INIT_NAME)()

        cls.__fiftyone_constructing__ = False
        return instance


def asdict_default_factory(items: t.List[t.Tuple[str, t.Any]]) -> t.Dict:
    return {k: v for k, v in items if not k.startswith("_")}


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


def is_data(obj: t.Any) -> bool:
    cls = obj if isinstance(obj, type) else type(obj)
    return issubclass(cls, Data)


def fields(data: t.Union[t.Type[Data], Data]) -> t.Tuple[Field, ...]:
    if not is_data(data):
        raise FiftyOneDataError(
            "fields() must be called with a data instance or class"
        )

    l: t.List[Field] = []
    for path in sorted(data.__fiftyone_ref__.schema):
        name = (
            path[len(data.__fiftyone_path__) + 1 :]
            if data.__fiftyone_path__
            else path
        )

        if name and "." not in name:
            l.append(data.__fiftyone_ref__.schema[path])

    return tuple(l)


def get_leaf_cls(
    d: t.Type,
) -> t.Union[t.Tuple[t.Type, ...], t.Type]:
    current: t.Type = d

    while is_dict(current) or is_list(current):
        current = current.__args__[-1]

    if is_tuple(current):
        return tuple(current.__args__)

    return current


def inherit_data(
    path: t.Optional[str],
    ref: FiftyOneReference,
    name: str,
    data: _D,
) -> None:
    prefix = ".".join([path, name]) if path else name

    merge_schema(
        ref.schema,
        {
            ".".join([prefix, k]) if prefix else k: v
            for k, v in _extract_schema(data).items()
        },
    )

    data_schema = data.__fiftyone_ref__.schema

    data.__fiftyone_path__ = prefix  # type: ignore
    data.__fiftyone_ref__ = ref  # type: ignore

    for path, field in data_schema.items():
        type = unwrap(field.type, -1)
        if type and isclass(type) and issubclass(type, Data):
            items = _get_items(path, data)
            for item in items:
                item.__fiftyone_path__ = ".".join([prefix, name])  # type: ignore
                item.__fiftyone_ref__ = ref  # type: ignore


def merge_schema(
    schema: t.Dict[str, Field], other: t.Dict[str, Field]
) -> None:
    paths = set(schema.keys()).union(set(other.keys()))
    for path in paths:
        if path in schema and path in other:
            # todo _merge_field()?
            assert schema[path].type == other[path].type or issubclass(
                schema[path].type, other[path].type
            )
            continue

        if path not in schema:
            schema[path] = replace(other[path])


def _asdict_inner(
    obj: t.Any,
    dict_factory: t.Callable[[t.List[t.Tuple[str, t.Any]]], t.Dict],
    links: bool,
) -> t.Any:
    if _is_data_instance(obj):
        result = []
        for field in fields(obj):

            if not links and field.link:
                continue

            value = _asdict_inner(
                getattr(obj, field.name), dict_factory, links
            )

            if value is None:
                continue

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


def _extract_schema(data: t.Union[t.Type[Data], Data]) -> t.Dict[str, Field]:
    length = len(data.__fiftyone_path__) if data.__fiftyone_path__ else 0
    schema = {}
    for path, field in data.__fiftyone_ref__.schema.items():
        if length and len(path) < length:
            continue

        path = path[length + 1 if length else 0 :]
        schema[path] = field

    return schema


def _flatten(items: t.List) -> t.List:
    if items == []:
        return items
    if isinstance(items[0], list):
        return _flatten(items[0]) + _flatten(items[1:])
    return items[:1] + _flatten(items[1:])


def _get_items(path: str, data: Data) -> t.List[Data]:
    if "." not in path:
        v = data[path]
        return v if isinstance(v, list) else [v]

    root, rest = path.split(".", 1)
    v = data[root]

    if not isinstance(v, list):
        v = [v]

    return _flatten([_get_items(rest, d) for d in v])


def _infer_type(value: t.Any) -> t.Type:
    type_ = type(value)

    if type_ in PRIMITIVES or issubclass(type_, Data):
        return type_

    if isinstance(value, numbers.Number):
        return float

    if isinstance(value, six.string_types):
        return str

    if isinstance(value, dict):
        key_types: t.Set[t.Type[t.Any]] = set(
            _infer_type(v) for v in value.keys()
        )

        key_type = None
        if len(key_types):
            key_type = key_types.pop()

            if key_types:
                raise FiftyOneDataError("more than one key type")

            if key_type not in {int, str}:
                raise FiftyOneDataError("invalid key type")

        value_types: t.Set[t.Type[t.Any]] = set(
            _infer_type(v) for v in value.values()
        )

        value_type = None
        if len(value_types) == 1:
            value_type = value_types.pop()

        if key_type and value_type:
            return t.Dict.__getitem__((key_type, value_type))

        return t.Dict

    if isinstance(value, list):
        item_types: t.Set[t.Type[t.Any]] = set(_infer_type(v) for v in value)
        if len(item_types) == 1:
            return t.List[item_types.pop()]

        return t.List

    if isinstance(value, tuple):
        return t.Tuple.__getitem__(tuple(_infer_type(v) for v in value))

    raise ValueError("todo")


def _is_data_instance(obj: t.Any) -> bool:
    return isinstance(obj, Data)


def _is_link(field: t.Optional[Field]) -> bool:
    if field is None:
        return False

    return field.link is not None


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
