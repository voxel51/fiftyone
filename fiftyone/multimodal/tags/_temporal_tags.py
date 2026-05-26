"""
Private implementation for multimodal temporal tags.

Temporal tags are sample-scoped records stored in the dedicated
``temporal_tags`` collection. Dataset/sample lifecycle hooks, import/export
sidecars, and low-level orphan cleanup all flow through this module so the
storage contract stays in one place.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import itertools
import os
from typing import Iterable

from bson import ObjectId
from pymongo import ASCENDING, InsertOne, UpdateOne

import eta.core.utils as etau

import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
from fiftyone.multimodal.schemas import v1 as foms

TEMPORAL_TAGS_COLLECTION_NAME = "temporal_tags"
TEMPORAL_TAGS_EXPORT_FILENAME = "temporal_tags.json"
TEMPORAL_TAGS_EXPORT_KEY = "temporal_tags"

DEFAULT_INDEX_TYPE = foms.TimeTrackType.TIME_TRACK_TYPE_DURATION_NS
SUPPORTED_INDEX_TYPES = {
    foms.TimeTrackType.TIME_TRACK_TYPE_SEQUENCE,
    foms.TimeTrackType.TIME_TRACK_TYPE_DURATION_NS,
    foms.TimeTrackType.TIME_TRACK_TYPE_TIMESTAMP_NS,
}
_TEMPORAL_TAG_SORT = [
    ("_sample_id", ASCENDING),
    ("index_type", ASCENDING),
    ("start", ASCENDING),
    ("end", ASCENDING),
    ("tag", ASCENDING),
    ("_id", ASCENDING),
]


class TemporalTag(object):
    """A temporal tag interval on one multimodal sample.

    Args:
        sample_id: the sample ID this temporal tag applies to
        start: the inclusive start value on the tag's index type
        end: the exclusive end value on the tag's index type
        tag: the tag value
        index_type: a :class:`TimeTrackType` value describing the index
            archetype. Defaults to ``TIME_TRACK_TYPE_DURATION_NS``
        id: the persisted temporal tag ID, when available
    """

    def __init__(
        self,
        sample_id,
        start,
        end,
        tag,
        index_type=DEFAULT_INDEX_TYPE,
        id=None,
    ):
        self.sample_id = sample_id
        self.start = start
        self.end = end
        self.tag = tag
        self.index_type = index_type
        self.id = id

    def __repr__(self):
        return (
            "%s(sample_id=%r, start=%r, end=%r, tag=%r, "
            "index_type=%r, id=%r)"
            % (
                self.__class__.__name__,
                self.sample_id,
                self.start,
                self.end,
                self.tag,
                self.index_type,
                self.id,
            )
        )

    def __eq__(self, other):
        if not isinstance(other, TemporalTag):
            return False

        return self.to_dict() == other.to_dict()

    def copy(self):
        """Returns a copy of this temporal tag."""
        return self.__class__(
            self.sample_id,
            self.start,
            self.end,
            self.tag,
            index_type=self.index_type,
            id=self.id,
        )

    def to_dict(self):
        """Serializes the temporal tag to a JSON dictionary."""
        d = {
            "sample_id": self.sample_id,
            "index_type": self.index_type,
            "start": self.start,
            "end": self.end,
            "tag": self.tag,
        }
        if self.id is not None:
            d["id"] = self.id

        return d


@dataclass(frozen=True)
class TemporalTagFilter:
    """Filter for multimodal temporal tag queries.

    Range filters use half-open interval overlap semantics. For example,
    ``start=10, end=20`` matches persisted intervals whose ``start < 20`` and
    ``end > 10``.

    Args:
        sample_ids: an optional sample ID or iterable of sample IDs
        tags: an optional tag or iterable of tags
        index_type: an optional :class:`TimeTrackType` value
        start: an optional inclusive lower bound for overlap queries
        end: an optional exclusive upper bound for overlap queries
    """

    sample_ids: str | Iterable[str] | None = None
    tags: str | Iterable[str] | None = None
    index_type: int | None = None
    start: int | None = None
    end: int | None = None


class TemporalTags(object):
    """An ordered collection of temporal tags scoped to a sample collection.

    Temporal tags are stored in a dedicated collection and linked to samples by
    ID. Dataset/view scoping is applied by this facade: reads and deletes are
    restricted to the provided sample collection, and adds reject sample IDs
    outside the collection.

    Args:
        sample_collection: a :class:`fiftyone.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
    """

    def __init__(self, sample_collection):
        dataset, sample_collection, sample_ids = _resolve_sample_collection(
            sample_collection
        )
        self._dataset = dataset
        self._sample_collection = sample_collection
        self._sample_ids = sample_ids

    def __str__(self):
        return "<%s: %s>" % (
            self.__class__.__name__,
            fou.pformat(list(self.values())),
        )

    def __repr__(self):
        return "<%s: %s>" % (self.__class__.__name__, len(self))

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        collection = _get_existing_collection()
        if collection is None:
            return 0

        query = _build_query(
            self._dataset._doc.id, None, sample_ids=self._sample_ids
        )
        return collection.count_documents(query)

    def __iter__(self):
        return self.keys()

    def first(self):
        """Returns the first temporal tag in this collection.

        Returns:
            a :class:`TemporalTag`
        """
        try:
            return next(self.values())
        except StopIteration:
            raise ValueError("Sample collection has no temporal tags")

    def head(self, num_tags=3):
        """Returns a list of the first few temporal tags in this collection.

        If fewer than ``num_tags`` temporal tags exist, only the available tags
        are returned.

        Args:
            num_tags (3): the number of temporal tags

        Returns:
            a list of :class:`TemporalTag` instances
        """
        if num_tags <= 0:
            return []

        return list(itertools.islice(self.values(), num_tags))

    def tail(self, num_tags=3):
        """Returns a list of the last few temporal tags in this collection.

        If fewer than ``num_tags`` temporal tags exist, only the available tags
        are returned.

        Args:
            num_tags (3): the number of temporal tags

        Returns:
            a list of :class:`TemporalTag` instances
        """
        if num_tags <= 0:
            return []

        return list(self.values())[-num_tags:]

    def keys(self):
        """Returns an iterator over persisted temporal tag IDs."""
        for temporal_tag in self.values():
            yield temporal_tag.id

    def items(self):
        """Returns an iterator over persisted temporal tag ID/tag pairs."""
        for temporal_tag in self.values():
            yield temporal_tag.id, temporal_tag

    def values(self, filter: TemporalTagFilter | None = None):
        """Returns an iterator over temporal tags in this collection.

        Args:
            filter (None): an optional :class:`TemporalTagFilter`

        Returns:
            an iterator over :class:`TemporalTag` instances
        """
        query = _build_query(
            self._dataset._doc.id, filter, sample_ids=self._sample_ids
        )
        collection = _get_existing_collection()
        if collection is None:
            return iter(())

        docs = collection.find(query).sort(_TEMPORAL_TAG_SORT)
        return (_from_storage_doc(doc) for doc in docs)

    def add(self, tags: TemporalTag | Iterable[TemporalTag]):
        """Adds temporal tags to this collection.

        The tuple ``(dataset, sample_id, index_type, start, end, tag)`` is
        unique, so adding the same tag interval multiple times is idempotent.

        Args:
            tags: a temporal tag or iterable of temporal tags

        Returns:
            a list of persisted :class:`TemporalTag` instances
        """
        tags = _ensure_temporal_tag_list(tags)
        if not tags:
            return []

        sample_ids = _validate_sample_ids_exist(
            self._sample_collection, [tag.sample_id for tag in tags]
        )
        now = _utcnow()
        keys = []
        ops_by_key = {}

        for tag in tags:
            doc = _to_storage_doc(
                tag, self._dataset._doc.id, sample_ids[str(tag.sample_id)]
            )
            key = _unique_key(doc)
            keys.append(key)
            if key not in ops_by_key:
                ops_by_key[key] = UpdateOne(
                    _unique_query(doc),
                    {
                        "$setOnInsert": {
                            "_dataset_id": doc["_dataset_id"],
                            "_sample_id": doc["_sample_id"],
                            "index_type": doc["index_type"],
                            "start": doc["start"],
                            "end": doc["end"],
                            "tag": doc["tag"],
                            "created_at": now,
                        },
                        "$set": {"last_modified_at": now},
                    },
                    upsert=True,
                )

        collection = _get_or_create_collection()
        collection.bulk_write(list(ops_by_key.values()), ordered=False)

        persisted_docs = collection.find(
            {
                "_dataset_id": self._dataset._doc.id,
                "$or": [_query_from_unique_key(key) for key in set(keys)],
            }
        )
        docs_by_key = {_unique_key(doc): doc for doc in persisted_docs}

        return [_from_storage_doc(docs_by_key[key]) for key in keys]

    def delete(
        self,
        *,
        ids: str | Iterable[str] | None = None,
        tags: str | Iterable[str] | None = None,
        filter: TemporalTagFilter | None = None,
        delete_all: bool = False,
    ) -> int:
        """Deletes temporal tags from this collection.

        Args:
            ids (None): an optional temporal tag ID or iterable of IDs
            tags (None): an optional tag or iterable of tags
            filter (None): an optional :class:`TemporalTagFilter`
            delete_all (False): whether to allow an empty selector

        Returns:
            the number of deleted temporal tags
        """
        query = _build_query(
            self._dataset._doc.id, filter, sample_ids=self._sample_ids
        )
        has_selector = filter is not None and not _is_empty_filter(filter)

        if ids is not None:
            query["_id"] = {"$in": _ensure_object_id_list(ids, "ids")}
            has_selector = True

        if tags is not None:
            query["tag"] = _build_in_query(_ensure_string_list(tags, "tags"))
            has_selector = True

        if not has_selector and not delete_all:
            raise ValueError(
                "Refusing to delete temporal tags with an empty selector; "
                "pass delete_all=True to delete all temporal tags for the "
                "dataset"
            )

        collection = _get_existing_collection()
        if collection is None:
            return 0

        return collection.delete_many(query).deleted_count

    def clear(self):
        """Deletes all temporal tags in this collection.

        Returns:
            the number of deleted temporal tags
        """
        return self.delete(delete_all=True)

    def count(self, filter: TemporalTagFilter | None = None) -> dict[str, int]:
        """Counts temporal tag occurrences in this collection.

        Args:
            filter (None): an optional :class:`TemporalTagFilter`

        Returns:
            a dict mapping tag values to counts
        """
        pipeline = [
            {
                "$match": _build_query(
                    self._dataset._doc.id,
                    filter,
                    sample_ids=self._sample_ids,
                )
            },
            {"$group": {"_id": "$tag", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]

        collection = _get_existing_collection()
        if collection is None:
            return {}

        return {
            result["_id"]: result["count"]
            for result in collection.aggregate(pipeline)
        }


def add_temporal_tags(dataset, tags: TemporalTag | Iterable[TemporalTag]):
    """Adds temporal tags to a dataset.

    The tuple ``(dataset, sample_id, index_type, start, end, tag)`` is unique,
    so adding the same tag interval multiple times is idempotent.
    If a view is provided, all tag sample IDs must belong to the view.

    Args:
        dataset: a :class:`fiftyone.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
        tags: a temporal tag or iterable of temporal tags

    Returns:
        a list of persisted :class:`TemporalTag` instances
    """

    return TemporalTags(dataset).add(tags)


def list_temporal_tags(
    dataset, filter: TemporalTagFilter | None = None
) -> list[TemporalTag]:
    """Lists temporal tags for a dataset.

    If a view is provided, only temporal tags linked to the view's samples are
    returned.

    Args:
        dataset: a :class:`fiftyone.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
        filter (None): an optional :class:`TemporalTagFilter`

    Returns:
        a list of matching :class:`TemporalTag` instances
    """

    return list(TemporalTags(dataset).values(filter=filter))


def delete_temporal_tags(
    dataset,
    *,
    ids: str | Iterable[str] | None = None,
    tags: str | Iterable[str] | None = None,
    filter: TemporalTagFilter | None = None,
    delete_all: bool = False,
) -> int:
    """Deletes temporal tags from a dataset.

    If a view is provided, deletes are restricted to temporal tags linked to
    the view's samples. Empty selectors are rejected unless ``delete_all=True``
    is provided.

    Args:
        dataset: a :class:`fiftyone.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
        ids (None): an optional temporal tag ID or iterable of IDs
        tags (None): an optional tag or iterable of tags
        filter (None): an optional :class:`TemporalTagFilter`
        delete_all (False): whether to allow an empty selector

    Returns:
        the number of deleted temporal tags
    """

    return TemporalTags(dataset).delete(
        ids=ids, tags=tags, filter=filter, delete_all=delete_all
    )


def count_temporal_tags(
    dataset, filter: TemporalTagFilter | None = None
) -> dict[str, int]:
    """Counts temporal tag occurrences in a dataset.

    If a view is provided, only temporal tags linked to the view's samples are
    counted.

    Args:
        dataset: a :class:`fiftyone.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
        filter (None): an optional :class:`TemporalTagFilter`

    Returns:
        a dict mapping tag values to counts
    """

    return TemporalTags(dataset).count(filter=filter)


def delete_for_dataset_id(dataset_id) -> int:
    collection = _get_existing_collection()
    if collection is None:
        return 0

    return collection.delete_many({"_dataset_id": dataset_id}).deleted_count


def delete_for_sample_ids(dataset_id, sample_ids) -> int:
    collection = _get_existing_collection()
    if collection is None:
        return 0

    sample_ids = list(sample_ids)
    if not sample_ids:
        return 0

    batch_size = fou.recommend_batch_size_for_value(
        ObjectId(), max_size=100000
    )
    num_deleted = 0

    for _ids in fou.iter_batches(sample_ids, batch_size):
        sample_oids = [_ensure_object_id(_id, "sample_ids") for _id in _ids]
        num_deleted += collection.delete_many(
            {"_dataset_id": dataset_id, "_sample_id": {"$in": sample_oids}}
        ).deleted_count

    return num_deleted


def count_for_dataset_id(dataset_id) -> int:
    collection = _get_existing_collection()
    if collection is None:
        return 0

    return collection.count_documents({"_dataset_id": dataset_id})


def get_orphan_dataset_ids(dataset_ids) -> list:
    collection = _get_existing_collection()
    if collection is None:
        return []

    dataset_ids = set(dataset_ids)
    orphan_dataset_ids = [
        dataset_id
        for dataset_id in collection.distinct("_dataset_id")
        if dataset_id not in dataset_ids
    ]

    return sorted(orphan_dataset_ids, key=str)


def count_for_dataset_ids(dataset_ids) -> int:
    dataset_ids = list(dataset_ids)
    if not dataset_ids:
        return 0

    collection = _get_existing_collection()
    if collection is None:
        return 0

    return collection.count_documents(
        {"_dataset_id": _build_in_query(dataset_ids)}
    )


def delete_for_dataset_ids(dataset_ids) -> int:
    dataset_ids = list(dataset_ids)
    if not dataset_ids:
        return 0

    collection = _get_existing_collection()
    if collection is None:
        return 0

    return collection.delete_many(
        {"_dataset_id": _build_in_query(dataset_ids)}
    ).deleted_count


def clone_tags(
    source_dataset, target_dataset, sample_collection=None, now=None
) -> int:
    if now is None:
        now = _utcnow()

    collection = _get_existing_collection()
    if collection is None:
        return 0

    sample_ids = _get_sample_scope(source_dataset, sample_collection)
    query = _build_query(source_dataset._doc.id, None, sample_ids=sample_ids)

    ops = []
    for doc in collection.find(query, {"_id": False}):
        doc["_dataset_id"] = target_dataset._doc.id
        doc["created_at"] = now
        doc["last_modified_at"] = now
        ops.append(InsertOne(doc))

    if not ops:
        return 0

    return collection.bulk_write(ops, ordered=False).inserted_count


def export_tags(sample_collection, export_path, progress=None) -> int:
    dataset, _, sample_ids = _resolve_sample_collection(sample_collection)
    query = _build_query(dataset._doc.id, None, sample_ids=sample_ids)

    collection = _get_existing_collection()
    if collection is None:
        _delete_temporal_tags_export(export_path)
        return 0

    num_docs = collection.count_documents(query)
    if num_docs == 0:
        _delete_temporal_tags_export(export_path)
        return 0

    docs = collection.find(query).sort(
        [
            ("_sample_id", ASCENDING),
            ("index_type", ASCENDING),
            ("start", ASCENDING),
            ("end", ASCENDING),
            ("tag", ASCENDING),
            ("_id", ASCENDING),
        ]
    )

    foo.export_collection(
        map(_to_export_doc, docs),
        export_path,
        key=TEMPORAL_TAGS_EXPORT_KEY,
        progress=progress,
        num_docs=num_docs,
    )

    return num_docs


def import_tags(dataset, import_path, sample_ids=None, progress=None) -> int:
    del progress  # reserved for future batched imports

    if not os.path.isfile(import_path):
        return 0

    records, _ = foo.import_collection(
        import_path, key=TEMPORAL_TAGS_EXPORT_KEY
    )

    if sample_ids is not None:
        sample_ids = {str(sample_id) for sample_id in sample_ids}
        records = [
            record
            for record in records
            if str(record.get("sample_id", None)) in sample_ids
        ]

    tags = [_from_export_doc(record) for record in records]
    if not tags:
        return 0

    return len(add_temporal_tags(dataset, tags))


def _resolve_sample_collection(sample_collection):
    if isinstance(sample_collection, fov.DatasetView):
        dataset = sample_collection._dataset
    else:
        dataset = sample_collection

    _validate_dataset(dataset)

    if isinstance(sample_collection, fov.DatasetView):
        sample_ids = _get_sample_scope(dataset, sample_collection)
    else:
        sample_ids = None

    return dataset, sample_collection, sample_ids


def _validate_dataset(dataset) -> None:
    if not hasattr(dataset, "_doc") or not hasattr(
        dataset, "_sample_collection"
    ):
        raise TypeError("Expected a FiftyOne Dataset or DatasetView")

    if getattr(dataset, "deleted", False):
        raise ValueError("Cannot access temporal tags for a deleted dataset")


def _ensure_temporal_tag_list(tags) -> list[TemporalTag]:
    if isinstance(tags, TemporalTag):
        return [tags]

    try:
        tags = list(tags)
    except TypeError as e:
        raise TypeError(
            "Expected a TemporalTag or iterable of TemporalTag instances"
        ) from e

    for tag in tags:
        if not isinstance(tag, TemporalTag):
            raise TypeError(
                "Expected a TemporalTag or iterable of TemporalTag instances"
            )

    return tags


def _get_sample_scope(dataset, sample_collection=None):
    if sample_collection is None or sample_collection is dataset:
        return None

    return list(sample_collection.values("_id"))


def _validate_sample_ids_exist(
    sample_collection, sample_ids
) -> dict[str, ObjectId]:
    sample_id_map = {}
    sample_oids = []

    for sample_id in sample_ids:
        sample_oid = _ensure_object_id(sample_id, "sample_id")
        sample_id_map[str(sample_id)] = sample_oid
        sample_oids.append(sample_oid)

    if isinstance(sample_collection, fov.DatasetView):
        found_values = sample_collection.values("_id")
        if found_values is None:
            found_values = []

        found = set(found_values)
    else:
        found = set(
            sample_collection._sample_collection.distinct(
                "_id", {"_id": {"$in": sample_oids}}
            )
        )

    missing = [
        str(sample_id) for sample_id in sample_oids if sample_id not in found
    ]
    if missing:
        raise ValueError(
            "Temporal tag sample IDs not found in dataset: %s"
            % ", ".join(missing)
        )

    return sample_id_map


def _to_storage_doc(tag: TemporalTag, dataset_id, sample_id):
    start = _ensure_integer(tag.start, "start")
    end = _ensure_integer(tag.end, "end")

    if start >= end:
        raise ValueError("Temporal tag ranges must satisfy start < end")

    return {
        "_dataset_id": dataset_id,
        "_sample_id": sample_id,
        "index_type": _ensure_index_type(tag.index_type),
        "start": start,
        "end": end,
        "tag": _ensure_tag(tag.tag),
    }


def _from_storage_doc(doc) -> TemporalTag:
    return TemporalTag(
        id=str(doc["_id"]),
        sample_id=str(doc["_sample_id"]),
        index_type=doc["index_type"],
        start=doc["start"],
        end=doc["end"],
        tag=doc["tag"],
    )


def _to_export_doc(doc):
    return {
        "sample_id": str(doc["_sample_id"]),
        "index_type": doc["index_type"],
        "start": doc["start"],
        "end": doc["end"],
        "tag": doc["tag"],
    }


def _from_export_doc(doc) -> TemporalTag:
    return TemporalTag(
        sample_id=doc.get("sample_id", None),
        index_type=doc.get("index_type", None),
        start=doc.get("start", None),
        end=doc.get("end", None),
        tag=doc.get("tag", None),
    )


def _build_query(
    dataset_id, filter: TemporalTagFilter | None, sample_ids=None
):
    query = {"_dataset_id": dataset_id}

    if sample_ids is not None:
        query["_sample_id"] = _build_in_query(list(sample_ids))

    if filter is None:
        return query

    if filter.sample_ids is not None:
        filter_sample_ids = _ensure_object_id_list(
            filter.sample_ids, "sample_ids"
        )
        if sample_ids is not None:
            filter_sample_ids = _intersect_sample_ids(
                filter_sample_ids, sample_ids
            )

        query["_sample_id"] = _build_in_query(filter_sample_ids)

    if filter.tags is not None:
        query["tag"] = _build_in_query(
            _ensure_string_list(filter.tags, "tags")
        )

    if filter.index_type is not None:
        query["index_type"] = _ensure_index_type(filter.index_type)

    start = None
    end = None

    if filter.start is not None:
        start = _ensure_integer(filter.start, "start")
        query["end"] = {"$gt": start}

    if filter.end is not None:
        end = _ensure_integer(filter.end, "end")
        query["start"] = {"$lt": end}

    if start is not None and end is not None and start >= end:
        raise ValueError("Temporal tag filters must satisfy start < end")

    return query


def _intersect_sample_ids(filter_sample_ids, sample_ids):
    sample_ids = set(sample_ids)
    return [
        sample_id for sample_id in filter_sample_ids if sample_id in sample_ids
    ]


def _is_empty_filter(filter: TemporalTagFilter) -> bool:
    return (
        filter.sample_ids is None
        and filter.tags is None
        and filter.index_type is None
        and filter.start is None
        and filter.end is None
    )


def _build_in_query(values):
    if len(values) == 1:
        return values[0]

    return {"$in": values}


def _ensure_string_list(value, field_name) -> list[str]:
    if etau.is_str(value):
        values = [value]
    else:
        values = list(value)

    return [_ensure_non_empty_string(v, field_name) for v in values]


def _ensure_object_id_list(value, field_name) -> list[ObjectId]:
    if etau.is_str(value) or isinstance(value, ObjectId):
        values = [value]
    else:
        values = list(value)

    return [_ensure_object_id(v, field_name) for v in values]


def _ensure_non_empty_string(value, field_name) -> str:
    if not etau.is_str(value) or not value.strip():
        raise ValueError(
            "Temporal tag %s must be a non-empty string" % field_name
        )

    return value


def _ensure_tag(value) -> str:
    return _ensure_non_empty_string(value, "tag")


def _ensure_object_id(value, field_name) -> ObjectId:
    if isinstance(value, ObjectId):
        return value

    if not etau.is_str(value) or not ObjectId.is_valid(value):
        raise ValueError(
            "Temporal tag %s must be a valid ObjectId" % field_name
        )

    return ObjectId(value)


def _ensure_integer(value, field_name) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError("Temporal tag %s must be an integer" % field_name)

    return value


def _ensure_index_type(value) -> int:
    value = _ensure_integer(value, "index_type")

    if value not in SUPPORTED_INDEX_TYPES:
        raise ValueError(
            "Unsupported temporal tag index_type %r; expected one of %s"
            % (value, sorted(SUPPORTED_INDEX_TYPES))
        )

    return value


def _unique_query(doc):
    return {
        "_dataset_id": doc["_dataset_id"],
        "_sample_id": doc["_sample_id"],
        "index_type": doc["index_type"],
        "start": doc["start"],
        "end": doc["end"],
        "tag": doc["tag"],
    }


def _unique_key(doc):
    return (
        doc["_sample_id"],
        doc["index_type"],
        doc["start"],
        doc["end"],
        doc["tag"],
    )


def _query_from_unique_key(key):
    sample_id, index_type, start, end, tag = key
    return {
        "_sample_id": sample_id,
        "index_type": index_type,
        "start": start,
        "end": end,
        "tag": tag,
    }


def _get_or_create_collection():
    collection = foo.get_db_conn()[TEMPORAL_TAGS_COLLECTION_NAME]
    _ensure_indexes(collection)
    return collection


def _get_existing_collection():
    db = foo.get_db_conn()
    if TEMPORAL_TAGS_COLLECTION_NAME not in db.list_collection_names():
        return None

    return db[TEMPORAL_TAGS_COLLECTION_NAME]


def _delete_temporal_tags_export(export_path) -> None:
    if os.path.isfile(export_path):
        etau.delete_file(export_path)


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ensure_indexes(collection) -> None:
    collection.create_index(
        [
            ("_dataset_id", ASCENDING),
            ("_sample_id", ASCENDING),
            ("index_type", ASCENDING),
            ("start", ASCENDING),
            ("end", ASCENDING),
            ("tag", ASCENDING),
        ],
        unique=True,
        name="unique_temporal_tag",
    )
    collection.create_index(
        [
            ("_dataset_id", ASCENDING),
            ("_sample_id", ASCENDING),
            ("index_type", ASCENDING),
            ("start", ASCENDING),
            ("end", ASCENDING),
        ],
        name="temporal_tag_overlap",
    )
    collection.create_index(
        [
            ("_dataset_id", ASCENDING),
            ("tag", ASCENDING),
        ],
        name="temporal_tag_counts",
    )


__all__ = [
    "DEFAULT_INDEX_TYPE",
    "SUPPORTED_INDEX_TYPES",
    "TEMPORAL_TAGS_EXPORT_FILENAME",
    "TEMPORAL_TAGS_COLLECTION_NAME",
    "TemporalTag",
    "TemporalTagFilter",
    "TemporalTags",
    "add_temporal_tags",
    "count_temporal_tags",
    "delete_temporal_tags",
    "list_temporal_tags",
]
