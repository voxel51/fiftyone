"""
FiftyOne singleton implementations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
import weakref

import eta.core.serial as etas
import eta.core.utils as etau

from .data import Data, DataMetaclass
from .datafield import Field

_KEYS_NAME = "__fiftyone_keys__"


class DocumentMetaclass(DataMetaclass):
    def __init__(
        cls,
        __name: str,
        __bases: t.Tuple[t.Type, ...],
        __dict: t.Dict[str, t.Any],
        **kwds: t.Any,
    ) -> None:
        super().__init__(__name, __bases, __dict, **kwds)

        is_base = etau.get_class_name(cls) == f"{__name__}.Document"

        if _KEYS_NAME not in cls.__dict__ and not is_base:
            raise FiftyOneDocumentError(f"{_KEYS_NAME} tuple is not defined")

        if not cls.__dict__[_KEYS_NAME] and not is_base:
            raise FiftyOneDocumentError(f"{_KEYS_NAME} has no keys")

        cls.__fiftyone_instances__ = weakref.WeakValueDictionary[
            str, "Document"
        ]()

    def _register_instance(cls, obj):
        cls._instances[obj._doc.collection_name][obj.id] = obj

    def _get_instance(cls, doc):
        try:
            return cls._instances[doc.collection_name][str(doc.id)]
        except KeyError:
            return None

    def _reload_instance(cls, obj):
        # pylint: disable=no-value-for-parameter
        cls._reload_doc(obj._doc.collection_name, obj.id)

    def _rename_fields(cls, collection_name, field_names, new_field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            data = sample._doc._data
            for field_name, new_field_name in zip(
                field_names, new_field_names
            ):
                data[new_field_name] = data.pop(field_name, None)

    def _clear_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data[field_name] = None

    def _purge_fields(cls, collection_name, field_names):
        if collection_name not in cls._instances:
            return

        for sample in cls._instances[collection_name].values():
            for field_name in field_names:
                sample._doc._data.pop(field_name, None)

    def _reload_doc(cls, collection_name, sample_id, hard=False):
        if collection_name not in cls._instances:
            return

        sample = cls._instances[collection_name].get(sample_id, None)
        if sample is not None:
            sample.reload(hard=hard)

    def _reload_docs(cls, collection_name, sample_ids=None, hard=False):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        if sample_ids is not None:
            sample_ids = set(sample_ids)
            for sample in samples.values():
                if sample.id in sample_ids:
                    sample.reload(hard=hard)
        else:
            for sample in samples.values():
                sample.reload(hard=hard)

    def _sync_docs(cls, collection_name, sample_ids, hard=False):
        if collection_name not in cls._instances:
            return

        samples = cls._instances[collection_name]

        sample_ids = set(sample_ids)
        reset_ids = set()
        for sample in samples.values():
            if sample.id in sample_ids:
                sample.reload(hard=hard)
            else:
                reset_ids.add(sample.id)
                sample._reset_backing_doc()

        for sample_id in reset_ids:
            samples.pop(sample_id, None)

    def _reset_docs(cls, collection_name, sample_ids=None):
        if collection_name not in cls._instances:
            return

        if sample_ids is not None:
            samples = cls._instances[collection_name]
            for sample_id in sample_ids:
                sample = samples.pop(sample_id, None)
                if sample is not None:
                    sample._reset_backing_doc()
        else:
            samples = cls._instances.pop(collection_name)
            for sample in samples.values():
                sample._reset_backing_doc()


class FiftyOneDocumentError(TypeError):
    pass


_D = t.TypeVar("_D", bound="Document")


class Document(Data, metaclass=DocumentMetaclass):

    __fiftyone_keys__: t.ClassVar[t.Tuple[str, ...]] = ()
    __fiftyone_instances__: t.ClassVar[
        weakref.WeakValueDictionary[str, "Document"]
    ] = {}

    def __copy__(self):
        return self.copy()

    def has_field(self, name: str) -> bool:
        return bool(self.__fiftyone_field__(name))

    def get_field(self, field_name: str) -> t.Any:
        return getattr(self, field_name)

    def set_field(self, name: str, value: t.Any, create: bool = True) -> None:
        if create:
            self[name] = value
        else:
            setattr(self, name, value)

    def update_fields(
        self, values: t.Dict[str, t.Any], expand_schema: bool = True
    ) -> None:
        for name, value in values.items():
            if expand_schema:
                self[name] = value
            else:
                setattr(self, name, value)

    def clear_field(self, field_name: str) -> None:
        del self[field_name]

    def iter_fields(
        self, include_id: bool = False
    ) -> t.Iterator[t.Tuple[str, Field]]:
        for name in self.__fiftyone_fields__:
            if name == "id" and not include_id:
                continue

            field: Field = self.__fiftyone_field__(name)  # type: ignore
            yield name, field

    def merge(
        self,
        document,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
    ):
        if not overwrite:
            existing_field_names = set(self.field_names)

        fields = document._parse_fields(fields=fields, omit_fields=omit_fields)

        for src_field, dst_field in fields.items():
            value = document[src_field]

            if value is None:
                continue

            try:
                curr_value = self[dst_field]
            except KeyError:
                curr_value = None

            if merge_lists:
                field_type = type(curr_value)

                if issubclass(field_type, list):
                    if value is not None:
                        curr_value.extend(
                            v for v in value if v not in curr_value
                        )

                    continue

                if field_type in fol._LABEL_LIST_FIELDS:
                    if value is not None:
                        list_field = field_type._LABEL_LIST_FIELD
                        _merge_labels(
                            curr_value[list_field],
                            value[list_field],
                            overwrite=overwrite,
                        )

                    continue

            if (
                not overwrite
                and dst_field in existing_field_names
                and curr_value is not None
            ):
                continue

            self.set_field(dst_field, value, create=expand_schema)

    def to_dict(self):
        d = self._doc.to_dict(extended=True)
        return {k: v for k, v in d.items() if not k.startswith("_")}

    def to_mongo_dict(self, include_id=False):
        d = self._doc.to_dict()
        if not include_id:
            d.pop("_id", None)

        return d

    def to_json(self, pretty_print=False):
        return etas.json_to_str(self.to_dict(), pretty_print=pretty_print)

    def save(self):
        if not self._in_db:
            raise ValueError(
                "Cannot save a document that has not been added to a dataset"
            )

        self._doc.save()

    def _parse_fields(self, fields=None, omit_fields=None):
        if fields is None:
            fields = {f: f for f in self.field_names if f != "id"}
        elif etau.is_str(fields):
            fields = {fields: fields}

        if not isinstance(fields, dict):
            fields = {f: f for f in fields}

        if omit_fields is not None:
            if etau.is_str(omit_fields):
                omit_fields = {omit_fields}
            else:
                omit_fields = set(omit_fields)

            fields = {k: v for k, v in fields.items() if k not in omit_fields}

        return fields

    def copy(self, fields=None, omit_fields=None):
        fields = self._parse_fields(fields=fields, omit_fields=omit_fields)
        return self.__class__(
            **{v: deepcopy(self[k]) for k, v in fields.items()}
        )

    def reload(self, hard=False):
        if hard:
            self._reload_backing_doc()
        else:
            # We can only reload fields that are in our schema
            self._doc.reload(*list(self._doc))

    @classmethod
    def from_dict(cls: t.Type[_D], d: t.Dict[str, t.Any]) -> _D:
        return cls(**d)

    @classmethod
    def from_json(cls: t.Type[_D], path: str) -> _D:
        return cls.from_dict(etas.load_json(path))
