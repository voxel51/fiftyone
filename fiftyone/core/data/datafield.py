from dataclasses import dataclass
import typing as t

from fiftyone.core.data.bson_schema import BSONSchemaProperties


_T = t.TypeVar("_T")
_R = t.TypeVar("_R")


FIELDS = "__fiftyone_fields__"


@dataclass
class Field(t.Generic[_T, _R]):
    name: str = None  # type: ignore
    type: t.Type[_T] = None  # type: ignore
    default: t.Optional[_T] = None
    default_factory: t.Optional[t.Callable[[], _T]] = None
    dump: t.Optional[t.Callable[[_T], _R]] = None
    load: t.Optional[t.Callable[[_R], _T]] = None
    link: t.Optional[str] = None
    required: bool = False
    validator: t.Optional[t.Callable[[_T], None]] = None

    def __post_init__(self) -> None:
        if self.default is not None and self.default_factory is not None:
            raise ValueError(
                "default and default_factory cannot bot be specified"
            )

        if (self.dump and not self.load) or (self.load and not self.dump):
            raise ValueError("both dump and load must specified or neither")


@t.overload
def field(
    *,
    default: _T,
    dump: t.Callable[[_T], _R],
    load: t.Callable[[_R], _T],
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default: _T,
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default_factory: t.Callable[[], _T],
    dump: t.Callable[[_T], _R],
    load: t.Callable[[_R], _T],
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default_factory: t.Callable[[], _T],
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    dump: t.Callable[[_T], _R],
    load: t.Callable[[_R], _T],
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    link: t.Optional[str] = ...,
    required: bool = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


def field(
    *,
    default: t.Any = None,
    default_factory: t.Optional[t.Callable[[], t.Any]] = None,
    dump: t.Optional[t.Callable[[t.Any], t.Any]] = None,
    load: t.Optional[t.Callable[[t.Any], t.Any]] = None,
    link: str = None,
    required: bool = False,
    validator: t.Optional[t.Callable[[t.Any], None]] = None,
) -> t.Any:
    return Field(
        default=default,
        default_factory=default_factory,
        dump=dump,
        load=load,
        link=link,
        required=required,
        validator=validator,
    )
