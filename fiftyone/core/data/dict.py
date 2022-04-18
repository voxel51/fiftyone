import typing as t


_KT = t.TypeVar("_KT")
_VT = t.TypeVar("_VT")
_VT_co = t.TypeVar("_VT_co", covariant=True)


class SupportsKeysAndGetItem(t.Protocol[_KT, _VT_co]):
    def keys(self) -> t.Iterable[_KT]:
        ...

    def __getitem__(self, __k: _KT) -> _VT_co:
        ...


class Dict(t.Dict[_KT, t.Optional[_VT]]):

    __fiftyone_schema__: t.Dict[str, t.Dict[str, t.Type]]
    __fiftyone_path__: str

    def __setitem__(self, __k: _KT, __v: t.Optional[_VT]) -> None:
        super().__setitem__(__k, __v)

    def setdefault(
        self, __key: _KT, __default: t.Optional[_VT] = None
    ) -> t.Optional[_VT]:
        return super().setdefault(__key, __default)

    @t.overload
    def update(
        self,
        __m: SupportsKeysAndGetItem[_KT, t.Optional[_VT]],
        **kwargs: t.Optional[_VT]
    ) -> None:
        ...

    @t.overload
    def update(
        self,
        __m: t.Iterable[t.Tuple[_KT, t.Optional[_VT]]],
        **kwargs: t.Optional[_VT]
    ) -> None:
        ...

    @t.overload
    def update(self, **kwargs: t.Optional[_VT]) -> None:
        ...

    def update(self, *args, **kwargs) -> None:  # type: ignore
        return super().update(*args, **kwargs)
