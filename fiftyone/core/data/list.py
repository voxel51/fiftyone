import typing as t

_T = t.TypeVar("_T")


class List(t.List[_T]):

    __fiftyone_schema__: t.Dict[str, t.Dict[str, t.Type]]
    __fiftyone_type__: t.Type
    __fiftyone_path__: str

    @t.overload
    def __setitem__(self, __i: t.SupportsIndex, __o: _T) -> None:
        ...

    @t.overload
    def __setitem__(self, __s: slice, __o: t.Iterable[_T]) -> None:
        ...

    def __setitem__(self, __si, __o):  # type: ignore
        super().__setitem__(__si, __o)

    def __iadd__(self, __x: t.Iterable[_T]) -> "List[_T]":
        return super().__iadd__(__x)

    def append(self, __object: _T) -> None:
        super().append(__object)

    def extend(self, __iterable: t.Iterable[_T]) -> None:
        super().extend(__iterable)

    def insert(self, __index: int, __object: _T) -> None:
        super().insert(__index, __object)
