import typing as t

from .exceptions import FiftyOneDataError
from .reference import FiftyOneReference


_KT = t.TypeVar("_KT")
_T = t.TypeVar("_T")
_VT = t.TypeVar("_VT")
_VT_co = t.TypeVar("_VT_co", covariant=True)


class SupportsKeysAndGetItem(t.Protocol[_KT, _VT_co]):
    def keys(self) -> t.Iterable[_KT]:
        ...

    def __getitem__(self, __k: _KT) -> _VT_co:
        ...


class Dict(t.Dict[_KT, t.Optional[_VT]]):

    __fiftyone_ref__: FiftyOneReference
    __fiftyone_path__: str
    __fiftyone_level__: int = 0

    def __setitem__(self, __k: _KT, __v: t.Optional[_VT]) -> None:
        super().__setitem__(__k, __v)

    def setdefault(
        self, __key: _KT, __default: t.Optional[_VT] = None
    ) -> t.Optional[_VT]:
        return super().setdefault(__key, self.__fiftyone_validate__(__default))  # type: ignore

    @t.overload
    def update(
        self,
        __m: SupportsKeysAndGetItem[_KT, t.Optional[_VT]],
        **kwargs: t.Optional[_VT],
    ) -> None:
        ...

    @t.overload
    def update(
        self,
        __m: t.Iterable[t.Tuple[_KT, t.Optional[_VT]]],
        **kwargs: t.Optional[_VT],
    ) -> None:
        ...

    @t.overload
    def update(self, **kwargs: t.Optional[_VT]) -> None:
        ...

    def update(self, *args, **kwargs) -> None:  # type: ignore
        return super().update(*args, **kwargs)

    def __fiftyone_validate__(self, __value: _VT) -> _VT:
        return _validate(
            self.__fiftyone_path__,
            self.__fiftyone_ref__,
            self.__fiftyone_level__,
            __value,
        )

    @classmethod
    def __fiftyone_construct__(
        cls,
        __fiftyone_ref__: FiftyOneReference,
        __fiftyone_path__: str,
        items: t.MutableMapping[_KT, _VT],
    ) -> "Dict[_KT, _VT]":
        dict = cls(items)
        dict.__fiftyone_path__ = __fiftyone_path__
        dict.__fiftyone_ref__ = __fiftyone_ref__
        return dict


class List(t.List[_T]):

    __fiftyone_ref__: FiftyOneReference
    __fiftyone_path__: str
    __fiftyone_level__: int = 0

    @t.overload
    def __setitem__(self, __i: t.SupportsIndex, __o: _T) -> None:
        ...

    @t.overload
    def __setitem__(self, __s: slice, __o: t.Iterable[_T]) -> None:
        ...

    def __setitem__(self, __si, __o):  # type: ignore
        super().__setitem__(__si, self.__fiftyone_validate__(__o))

    def __iadd__(self, __x: t.Iterable[_T]) -> "List[_T]":
        return super().__iadd__(self.__fiftyone_validate__(v) for v in __x)

    def append(self, __object: _T) -> None:
        super().append(self.__fiftyone_validate__(__object))

    def extend(self, __iterable: t.Iterable[_T]) -> None:
        super().extend(self.__fiftyone_validate__(v) for v in __iterable)

    def insert(self, __index: int, __object: _T) -> None:
        super().insert(__index, self.__fiftyone_validate__(__object))

    def __fiftyone_validate__(self, __value: _T) -> _T:
        return _validate(
            self.__fiftyone_path__,
            self.__fiftyone_ref__,
            self.__fiftyone_level__,
            __value,
        )

    @classmethod
    def __fiftyone_construct__(
        cls,
        __fiftyone_ref__: FiftyOneReference,
        __fiftyone_path__: str,
        items: t.Iterable[_T],
    ) -> "List[_T]":
        list = cls(items)
        list.__fiftyone_path__ = __fiftyone_path__
        list.__fiftyone_ref__ = __fiftyone_ref__
        return list


def is_any_base_container(type: t.Type) -> bool:
    return any(map(lambda c: is_container(type, c), (dict, list, tuple)))


def is_container(
    type: t.Type, check: t.Union[t.Type[dict], t.Type[list], t.Type[tuple]]
) -> bool:
    return type == check or getattr(type, "__origin__", None) == check


def is_dict(type: t.Type) -> bool:
    return is_container(type, dict)


def is_list(type: t.Type) -> bool:
    return is_container(type, list)


def is_tuple(type: t.Type) -> bool:
    return is_container(type, tuple)


def unwrap(type: t.Type[t.Any], level: int, i: int = -1) -> t.Type[t.Any]:
    item_type = getattr(type, "__args__", (None,))[i]
    if item_type is None or isinstance(item_type, t.TypeVar):
        return t.Any

    if level > 0 or level < 0:
        return unwrap(item_type, level - 1)

    return item_type


def _validate(
    path: str, ref: FiftyOneReference, level: int, __value: _T
) -> _T:
    type = unwrap(
        ref.schema[path].type,
        level,
    )

    if __value is None:
        raise FiftyOneDataError(
            f"invalid item value {__value} for path '{path}', expected {type}"
        )

    if is_list(type):
        if isinstance(__value, list):
            l: List[t.Any] = List.__fiftyone_construct__(ref, path, [])
            l.__fiftyone_level__ = level + 1
            for item in __value:
                l.append(item)

            __value = items  # type: ignore
        else:
            raise FiftyOneDataError(
                f"invalid item value {__value} for path '{path}', expected {type}"
            )

    elif is_dict(type):
        if isinstance(__value, dict):
            d: Dict[t.Any, t.Any] = Dict.__fiftyone_construct__(ref, path, {})
            d.__fiftyone_level__ = level + 1
            for key, value in __value.items():
                d[key] = value

            __value = d  # type: ignore
        else:
            raise FiftyOneDataError(
                f"invalid item value {__value} for path '{path}', expected {type}"
            )

    elif not isinstance(__value, type):
        raise FiftyOneDataError(
            f"invalid item value {__value} for path '{path}', expected {type}"
        )

    return __value
