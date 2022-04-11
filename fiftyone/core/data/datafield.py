from dataclasses import dataclass, field as f
import typing as t


__all__ = ["field", "fields", "Field", "FIELDS", "MISSING"]

_T = t.TypeVar("_T")
_R = t.TypeVar("_R")


class MISSING_TYPE:
    pass


MISSING = MISSING_TYPE()


FIELDS = "__fiftyone_fields__"


@dataclass
class Field(t.Generic[_T, _R]):
    name: str = f(init=False)
    type: t.Type[_T] = f(init=False)
    default: t.Union[_T, MISSING_TYPE] = MISSING
    default_factory: t.Union[t.Callable[[], _T], MISSING_TYPE] = MISSING
    dump: t.Optional[t.Callable[[_T], _R]] = None
    load: t.Optional[t.Callable[[_R], _T]] = None
    link: t.Optional[str] = None
    validator: t.Optional[t.Callable[[_T], None]] = None


@t.overload
def field(
    *,
    default: _T,
    dump: t.Optional[t.Callable[[_T], _R]] = ...,
    load: t.Optional[t.Callable[[_R], _T]] = ...,
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default: _T,
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default_factory: t.Callable[[], _T],
    dump: t.Optional[t.Callable[[_T], _R]] = ...,
    load: t.Optional[t.Callable[[_R], _T]] = ...,
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    default_factory: t.Callable[[], _T],
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    dump: t.Optional[t.Callable[[_T], _R]] = ...,
    load: t.Optional[t.Callable[[_R], _T]] = ...,
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


@t.overload
def field(
    *,
    link: t.Optional[str] = ...,
    validator: t.Optional[t.Callable[[_T], None]] = ...,
) -> _T:
    ...


def field(
    *,
    default: t.Any = MISSING,
    default_factory: t.Union[t.Callable[[], t.Any], MISSING_TYPE] = MISSING,
    dump: t.Optional[t.Callable[[t.Any], t.Any]] = None,
    load: t.Optional[t.Callable[[t.Any], t.Any]] = None,
    link: str = None,
    validator: t.Optional[t.Callable[[t.Any], None]] = None,
) -> t.Any:
    if default is None and default_factory is None:
        raise ValueError("both dump and load must specified or neither")
    return Field(
        default=default,
        default_factory=default_factory,
        dump=dump,
        load=load,
        validator=validator,
        link=link,
    )


def fields(class_or_instance: t.Any) -> t.Tuple[Field, ...]:
    try:
        fields: t.Dict[str, Field] = getattr(class_or_instance, FIELDS)
    except AttributeError:
        raise TypeError("must be called with a fiftyone data type or instance")

    return tuple(field for field in fields.values())
