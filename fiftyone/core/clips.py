"""
Clips views.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy

from bson import ObjectId

import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.stages as fost
import fiftyone.core.validation as fova
import fiftyone.core.view as fov


class ClipView(fos.SampleView):
    """A clip in a :class:`ClipsView`.

    :class:`ClipView` instances should not be created manually; they are
    generated by iterating over :class:`ClipsView` instances.

    Args:
        doc: a :class:`fiftyone.core.odm.DatasetSampleDocument`
        view: the :class:`ClipsView` that the frame belongs to
        selected_fields (None): a set of field names that this view is
            restricted to
        excluded_fields (None): a set of field names that are excluded from
            this view
        filtered_fields (None): a set of field names of list fields that are
            filtered in this view
    """

    @property
    def _sample_id(self):
        return ObjectId(self._doc.sample_id)

    def _save(self, deferred=False):
        sample_ops, frame_ops = super()._save(deferred=deferred)

        if not deferred:
            self._view._sync_source_sample(self)

        return sample_ops, frame_ops


class ClipsView(fov.DatasetView):
    """A :class:`fiftyone.core.view.DatasetView` of clips from a video
    :class:`fiftyone.core.dataset.Dataset`.

    Clips views contain an ordered collection of clips, each of which
    corresponds to a range of frame numbers from the source collection.

    Clips retrieved from clips views are returned as :class:`ClipView` objects.

    Args:
        source_collection: the
            :class:`fiftyone.core.collections.SampleCollection` from which this
            view was created
        clips_stage: the :class:`fiftyone.core.stages.ToClips` stage that
            defines how the clips were created
        clips_dataset: the :class:`fiftyone.core.dataset.Dataset` that serves
            the clips in this view
    """

    __slots__ = (
        "_classification_field",
        "_source_collection",
        "_clips_stage",
        "_clips_dataset",
        "__stages",
        "__media_type",
        "__name",
    )

    def __init__(
        self,
        source_collection,
        clips_stage,
        clips_dataset,
        _stages=None,
        _media_type=None,
        _name=None,
    ):
        if _stages is None:
            _stages = []

        self._classification_field = self._get_temporal_detection_field(
            source_collection, clips_stage
        )
        self._source_collection = source_collection
        self._clips_stage = clips_stage
        self._clips_dataset = clips_dataset
        self.__stages = _stages
        self.__media_type = _media_type
        self.__name = _name

    def __copy__(self):
        return self.__class__(
            self._source_collection,
            deepcopy(self._clips_stage),
            self._clips_dataset,
            _stages=deepcopy(self.__stages),
            _media_type=self.__media_type,
            _name=self.__name,
        )

    @staticmethod
    def _get_temporal_detection_field(source_collection, clips_stage):
        try:
            fova.validate_collection_label_fields(
                source_collection,
                clips_stage.field_or_expr,
                (fol.TemporalDetection, fol.TemporalDetections),
            )
            return clips_stage.field_or_expr
        except:
            return None

    @property
    def _base_view(self):
        return self.__class__(
            self._source_collection,
            self._clips_stage,
            self._clips_dataset,
        )

    @property
    def _dataset(self):
        return self._clips_dataset

    @property
    def _root_dataset(self):
        return self._source_collection._root_dataset

    @property
    def _sample_cls(self):
        return ClipView

    @property
    def _stages(self):
        return self.__stages

    @property
    def _all_stages(self):
        return (
            self._source_collection.view()._all_stages
            + [self._clips_stage]
            + self.__stages
        )

    @property
    def name(self):
        return self.__name

    @property
    def is_saved(self):
        return self.__name is not None

    @property
    def media_type(self):
        if self.__media_type is not None:
            return self.__media_type

        return self._dataset.media_type

    def _set_name(self, name):
        self.__name = name

    def _set_media_type(self, media_type):
        self.__media_type = media_type

    def _tag_labels(self, tags, label_field, ids=None, label_ids=None):
        if label_field == self._classification_field:
            _ids = self.values("_sample_id")

        _, label_ids = super()._tag_labels(
            tags, label_field, ids=ids, label_ids=label_ids
        )

        if label_field == self._classification_field:
            ids, label_ids = self._to_source_ids(label_field, _ids, label_ids)
            self._source_collection._tag_labels(
                tags, label_field, ids=ids, label_ids=label_ids
            )

    def _untag_labels(self, tags, label_field, ids=None, label_ids=None):
        if label_field == self._classification_field:
            _ids = self.values("_sample_id")

        _, label_ids = super()._untag_labels(
            tags, label_field, ids=ids, label_ids=label_ids
        )

        if label_field == self._classification_field:
            ids, label_ids = self._to_source_ids(label_field, _ids, label_ids)
            self._source_collection._untag_labels(
                tags, label_field, ids=ids, label_ids=label_ids
            )

    def _to_source_ids(self, label_field, ids, label_ids):
        _, is_list_field = self._source_collection._get_label_field_root(
            label_field
        )

        if not is_list_field:
            return ids, label_ids

        id_map = defaultdict(list)
        for _id, _label_id in zip(ids, label_ids):
            if etau.is_container(_label_id):
                id_map[_id].extend(_label_id)
            else:
                id_map[_id].append(_label_id)

        if not id_map:
            return [], []

        return zip(*id_map.items())

    def set_values(self, field_name, *args, **kwargs):
        field = field_name.split(".", 1)[0]
        must_sync = field == self._classification_field

        # The `set_values()` operation could change the contents of this view,
        # so we first record the sample IDs that need to be synced
        if must_sync and self._stages:
            ids = self.values("id")
        else:
            ids = None

        super().set_values(field_name, *args, **kwargs)

        self._sync_source(fields=[field], ids=ids)
        self._sync_source_field_schema(field_name)

    def set_label_values(self, field_name, *args, **kwargs):
        field = field_name.split(".", 1)[0]
        must_sync = field == self._classification_field

        super().set_label_values(field_name, *args, **kwargs)

        if must_sync:
            _, root = self._get_label_field_path(field)
            _, src_root = self._source_collection._get_label_field_path(field)
            _field_name = src_root + field_name[len(root) :]

            self._source_collection.set_label_values(
                _field_name, *args, **kwargs
            )

    def save(self, fields=None):
        """Saves the clips in this view to the underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.

        .. warning::

            This will permanently delete any omitted or filtered contents from
            the frames of the underlying dataset.

        Args:
            fields (None): an optional field or list of fields to save. If
                specified, only these fields are overwritten
        """
        if etau.is_str(fields):
            fields = [fields]

        self._sync_source(fields=fields)

        super().save(fields=fields)

    def keep(self):
        """Deletes all clips that are **not** in this view from the underlying
        dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._sync_source(update=False, delete=True)

        super().keep()

    def keep_fields(self):
        """Deletes any frame fields that have been excluded in this view from
        the frames of the underlying dataset.

        .. note::

            This method is not a :class:`fiftyone.core.stages.ViewStage`;
            it immediately writes the requested changes to the underlying
            dataset.
        """
        self._sync_source_keep_fields()

        super().keep_fields()

    def reload(self):
        """Reloads the view.

        Note that :class:`ClipView` instances are not singletons, so any
        in-memory clips extracted from this view will not be updated by calling
        this method.
        """
        self._source_collection.reload()

        # Regenerate the clips dataset
        _view = self._clips_stage.load_view(
            self._source_collection, reload=True
        )
        self._clips_dataset = _view._clips_dataset

        super().reload()

    def _delete_labels(self, labels, fields=None):
        clip_labels, other_labels, src_labels = self._parse_labels(
            labels, fields=fields
        )

        if clip_labels:
            clip_ids = [d["sample_id"] for d in clip_labels]
            self._clips_dataset.delete_samples(clip_ids)

        if other_labels:
            super()._delete_labels(other_labels, fields=fields)

        if src_labels:
            self._source_collection._delete_labels(src_labels, fields=fields)

    def _parse_labels(self, labels, fields=None):
        if etau.is_str(fields):
            fields = [fields]

        if fields is not None:
            labels = [d for d in labels if d["field"] in fields]

        frame_labels = [d for d in labels if d.get("frame_number") is not None]
        labels = [d for d in labels if d.get("frame_number") is None]

        field = self._classification_field

        if field is not None:
            clip_labels = [d for d in labels if d["field"] == field]
            other_labels = [d for d in labels if d["field"] != field]
        else:
            clip_labels = []
            other_labels = labels

        src_labels = deepcopy(clip_labels + frame_labels)
        if src_labels:
            clip_ids = [d["sample_id"] for d in src_labels]
            sample_ids = self._map_values(clip_ids, "id", "sample_id")
            for d, sample_id in zip(src_labels, sample_ids):
                d["sample_id"] = sample_id

        return clip_labels, other_labels, src_labels

    def _sync_source_sample(self, sample):
        if not self._classification_field:
            return

        # Sync label + support to underlying TemporalDetection

        field = self._classification_field

        classification = sample[field]
        if classification is not None:
            doc = classification.to_dict()
            doc["_cls"] = "TemporalDetection"
            doc["support"] = sample.support
        else:
            doc = None

        self._source_collection._set_labels(field, [sample.sample_id], [doc])

    def _sync_source(self, fields=None, ids=None, update=True, delete=False):
        if not self._classification_field:
            return

        field = self._classification_field

        if fields is not None and field not in fields:
            return

        # Sync label + support to underlying TemporalDetection

        if ids is not None:
            sync_view = self._clips_dataset.select(ids)
        else:
            sync_view = self

        update_ids = []
        update_docs = []
        del_labels = []
        for label_id, sample_id, support, doc in zip(
            *sync_view.values(["id", "sample_id", "support", field], _raw=True)
        ):
            if doc:
                doc["support"] = support
                doc["_cls"] = "TemporalDetection"
                update_ids.append(sample_id)
                update_docs.append(doc)
            else:
                del_labels.append(
                    {
                        "sample_id": sample_id,
                        "label_id": label_id,
                        "field": field,
                    }
                )

        if delete:
            observed_ids = set(update_ids)
            for label_id, sample_id in zip(
                *self._clips_dataset.values(["id", "sample_id"])
            ):
                if sample_id not in observed_ids:
                    del_labels.append(
                        {
                            "sample_id": sample_id,
                            "label_id": label_id,
                            "field": field,
                        }
                    )

        if update:
            self._source_collection._set_labels(field, update_ids, update_docs)

        if del_labels:
            self._source_collection._delete_labels(del_labels, fields=[field])

    def _sync_source_field_schema(self, path):
        root = path.split(".", 1)[0]
        if root != self._classification_field:
            return

        field = self.get_field(path)
        if field is None:
            return

        _, label_root = self._get_label_field_path(root)
        leaf = path[len(label_root) + 1 :]

        dst_dataset = self._source_collection._dataset
        _, dst_path = dst_dataset._get_label_field_path(root)
        dst_path += "." + leaf

        dst_dataset._merge_sample_field_schema({dst_path: field})

        if self._source_collection._is_generated:
            self._source_collection._sync_source_field_schema(dst_path)

    def _sync_source_keep_fields(self):
        # If the source TemporalDetection field is excluded, delete it from
        # this collection and the source collection
        cls_field = self._classification_field
        if cls_field and cls_field not in self.get_field_schema():
            self._source_collection.exclude_fields(cls_field).keep_fields()

        # Delete any excluded frame fields from this collection and the source
        # collection
        schema = self.get_frame_field_schema()
        src_schema = self._source_collection.get_frame_field_schema()

        del_fields = set(src_schema.keys()) - set(schema.keys())
        if del_fields:
            prefix = self._source_collection._FRAMES_PREFIX
            _del_fields = [prefix + f for f in del_fields]
            self._source_collection.exclude_fields(_del_fields).keep_fields()


class TrajectoriesView(ClipsView):
    """A :class:`ClipsView` of object trajectories from a video
    :class:`fiftyone.core.dataset.Dataset`.

    Trajectories views contain an ordered collection of clips, each of which
    corresponds to a unique object trajectory from the source collection.

    Clips retrieved from trajectories views are returned as :class:`ClipView`
    objects.

    Args:
        source_collection: the
            :class:`fiftyone.core.collections.SampleCollection` from which this
            view was created
        clips_stage: the :class:`fiftyone.core.stages.ToTrajectories` stage
            that defines how the clips were created
        clips_dataset: the :class:`fiftyone.core.dataset.Dataset` that serves
            the clips in this view
    """

    __slots__ = (
        "_num_trajectory_stages",
        "__stages",
        "__media_type",
        "__name",
    )

    def __init__(
        self,
        source_collection,
        clips_stage,
        clips_dataset,
        _stages=None,
        _media_type=None,
        _name=None,
    ):
        if not isinstance(clips_stage, fost.ToTrajectories):
            raise ValueError(
                "Trajectory views must be defined by a %s stage; found %s"
                % (fost.ToTrajectories, type(clips_stage))
            )

        if _stages is None:
            _stages = []

        trajectory_stages = self._make_trajectory_stages(
            source_collection, clips_stage, clips_dataset
        )
        _stages = trajectory_stages + _stages

        self._num_trajectory_stages = len(trajectory_stages)
        self._classification_field = None
        self._source_collection = source_collection
        self._clips_stage = clips_stage
        self._clips_dataset = clips_dataset
        self.__stages = _stages
        self.__media_type = _media_type
        self.__name = _name

    def __copy__(self):
        return self.__class__(
            self._source_collection,
            deepcopy(self._clips_stage),
            self._clips_dataset,
            _stages=deepcopy(self.__stages[self._num_trajectory_stages :]),
            _media_type=self.__media_type,
            _name=self.__name,
        )

    @property
    def _stages(self):
        return self.__stages

    @property
    def _all_stages(self):
        return (
            self._source_collection.view()._all_stages
            + [self._clips_stage]
            + self.__stages[self._num_trajectory_stages :]
        )

    @property
    def name(self):
        return self.__name

    @property
    def is_saved(self):
        return self.__name is not None

    @property
    def media_type(self):
        if self.__media_type is not None:
            return self.__media_type

        return self._dataset.media_type

    def _set_name(self, name):
        self.__name = name

    def _set_media_type(self, media_type):
        self.__media_type = media_type

    @staticmethod
    def _make_trajectory_stages(source_collection, clips_stage, clips_dataset):
        field, _ = source_collection._handle_frame_field(clips_stage.field)

        trajectory_stages = []

        #
        # Exclude all frame-level fields that weren't explicitly requested
        #

        exclude_fields = set(source_collection.get_frame_field_schema().keys())
        exclude_fields -= set(source_collection._get_default_frame_fields())
        exclude_fields.discard(field)
        if clips_stage.config and clips_stage.config.get("other_fields", None):
            other_fields = clips_stage.config["other_fields"]
            if other_fields == True:
                exclude_fields.clear()
            else:
                if etau.is_str(other_fields):
                    other_fields = [other_fields]

                for other_field in other_fields:
                    (
                        _field,
                        is_frame_field,
                    ) = source_collection._handle_frame_field(other_field)
                    if is_frame_field:
                        exclude_fields.discard(_field)

        if exclude_fields:
            exclude_stage = fost.ExcludeFields(
                [source_collection._FRAMES_PREFIX + f for f in exclude_fields]
            )
            exclude_stage.validate(clips_dataset)
            trajectory_stages.append(exclude_stage)

        #
        # Select correct trajectory
        #

        filter_stage = fost.FilterLabels(
            clips_stage.field,
            (
                (F("label") == F("$" + field + ".label"))
                & (F("index") == F("$" + field + ".index"))
            ),
            only_matches=False,
        )
        filter_stage.validate(clips_dataset)
        trajectory_stages.append(filter_stage)

        return trajectory_stages


def make_clips_dataset(
    sample_collection,
    field_or_expr,
    other_fields=None,
    include_indexes=False,
    tol=0,
    min_len=0,
    trajectories=False,
    name=None,
    persistent=False,
    _generated=False,
):
    """Creates a dataset that contains one sample per clip defined by the
    given field or expression in the collection.

    The returned dataset will contain:

    -   A ``sample_id`` field that records the sample ID from which each clip
        was taken
    -   A ``support`` field that records the ``[first, last]`` frame support of
        each clip
    -   All frame-level information from the underlying dataset of the input
        collection

    In addition, sample-level fields will be added for certain clipping
    strategies:

    -   When ``field_or_expr`` is a temporal detection(s) field, the field
        will be converted to a :class:`fiftyone.core.labels.Classification`
        field
    -   When ``trajectories`` is True, a sample-level label field will be added
        recording the ``label`` and ``index`` of each trajectory

    .. note::

        The returned dataset will directly use the frame collection of the
        input dataset.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field_or_expr: can be any of the following:

            -   a :class:`fiftyone.core.labels.TemporalDetection`,
                :class:`fiftyone.core.labels.TemporalDetections`,
                :class:`fiftyone.core.fields.FrameSupportField`, or list of
                :class:`fiftyone.core.fields.FrameSupportField` field
            -   a frame-level label list field of any of the following types:

                -   :class:`fiftyone.core.labels.Classifications`
                -   :class:`fiftyone.core.labels.Detections`
                -   :class:`fiftyone.core.labels.Polylines`
                -   :class:`fiftyone.core.labels.Keypoints`
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                returns a boolean to apply to each frame of the input
                collection to determine if the frame should be clipped
            -   a list of ``[(first1, last1), (first2, last2), ...]`` lists
                defining the frame numbers of the clips to extract from each
                sample
        other_fields (None): controls whether sample fields other than the
            default sample fields are included. Can be any of the following:

            -   a field or list of fields to include
            -   ``True`` to include all other fields
            -   ``None``/``False`` to include no other fields
        include_indexes (False): whether to recreate any custom indexes on
            ``field_or_expr`` and ``other_fields`` on the new dataset (True)
            or a list of specific indexes or index prefixes to recreate.
            By default, no custom indexes are recreated
        tol (0): the maximum number of false frames that can be overlooked when
            generating clips. Only applicable when ``field_or_expr`` is a
            frame-level list field or expression
        min_len (0): the minimum allowable length of a clip, in frames. Only
            applicable when ``field_or_expr`` is a frame-level list field or an
            expression
        trajectories (False): whether to create clips for each unique object
            trajectory defined by their ``(label, index)``. Only applicable
            when ``field_or_expr`` is a frame-level field
        name (None): a name for the dataset
        persistent (False): whether the dataset should persist in the database
            after the session terminates

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    fova.validate_video_collection(sample_collection)

    if etau.is_str(other_fields):
        other_fields = [other_fields]

    if etau.is_str(field_or_expr):
        if sample_collection._is_frame_field(field_or_expr):
            if trajectories:
                clips_type = "trajectories"
            else:
                clips_type = "expression"
        else:
            if _is_frame_support_field(sample_collection, field_or_expr):
                clips_type = "support"
            else:
                clips_type = "detections"
    elif isinstance(field_or_expr, (foe.ViewExpression, dict)):
        clips_type = "expression"
    else:
        clips_type = "manual"

    if _generated:
        _name = name
        _persistent = persistent
    else:
        # We first create a temporary dataset with samples representing the
        # clips; then we clone it to pull in the corresponding frames
        _name = None
        _persistent = False

    dataset = fod.Dataset(
        name=_name,
        persistent=_persistent,
        _clips=True,
        _src_collection=sample_collection,
    )

    dataset.media_type = fom.VIDEO
    dataset.add_sample_field("sample_id", fof.ObjectIdField)
    dataset.add_sample_field("support", fof.FrameSupportField)
    dataset.create_index("sample_id")

    if clips_type == "detections":
        field = _get_label_field(sample_collection, field_or_expr)
        kwargs = foo.get_field_kwargs(field)
        kwargs["embedded_doc_type"] = fol.Classification
        dataset.add_sample_field(field_or_expr, **kwargs)

    if clips_type == "trajectories":
        field_or_expr, _ = sample_collection._handle_frame_field(field_or_expr)
        dataset.add_sample_field(
            field_or_expr,
            fof.EmbeddedDocumentField,
            embedded_doc_type=foo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field(field_or_expr + ".label", fof.StringField)
        dataset.add_sample_field(field_or_expr + ".index", fof.IntField)

    if other_fields:
        src_schema = sample_collection.get_field_schema()
        curr_schema = dataset.get_field_schema()

        if other_fields == True:
            other_fields = [f for f in src_schema if f not in curr_schema]

        add_fields = [f for f in other_fields if f not in curr_schema]
        add_schema = {k: v for k, v in src_schema.items() if k in add_fields}
        dataset._sample_doc_cls.merge_field_schema(add_schema)

    if clips_type == "detections":
        clips_field = field_or_expr
    else:
        clips_field = None

    fod._clone_indexes_for_clips_view(
        sample_collection,
        dataset,
        clips_field=clips_field,
        other_fields=other_fields,
        include_indexes=include_indexes,
    )

    _make_pretty_summary(dataset)

    if clips_type == "support":
        _write_support_clips(
            dataset,
            sample_collection,
            field_or_expr,
            other_fields=other_fields,
        )
    elif clips_type == "detections":
        _write_temporal_detection_clips(
            dataset,
            sample_collection,
            field_or_expr,
            other_fields=other_fields,
        )
    elif clips_type == "trajectories":
        _write_trajectories(
            dataset,
            sample_collection,
            field_or_expr,
            other_fields=other_fields,
        )
    elif clips_type == "expression":
        _write_expr_clips(
            dataset,
            sample_collection,
            field_or_expr,
            other_fields=other_fields,
            tol=tol,
            min_len=min_len,
        )
    else:
        _write_manual_clips(
            dataset,
            sample_collection,
            field_or_expr,
            other_fields=other_fields,
        )

    if not _generated:
        # Clone so that dataset no longer shares the same underlying frames
        # collection as the input collection
        _dataset = dataset
        dataset = _dataset.clone(name=name, persistent=persistent)
        _dataset.delete()

    return dataset


def _is_frame_support_field(sample_collection, field_path):
    field = sample_collection.get_field(field_path)
    return isinstance(field, fof.FrameSupportField) or (
        isinstance(field, fof.ListField)
        and isinstance(field.field, fof.FrameSupportField)
    )


def _get_label_field(sample_collection, field_path):
    _, path = sample_collection._get_label_field_path(field_path)
    return sample_collection.get_field(path, leaf=True)


def _make_pretty_summary(dataset):
    set_fields = ["id", "sample_id", "filepath", "support"]
    all_fields = dataset._sample_doc_cls._fields_ordered
    pretty_fields = set_fields + [f for f in all_fields if f not in set_fields]
    dataset._sample_doc_cls._fields_ordered = tuple(pretty_fields)


def _write_support_clips(
    dataset, src_collection, field_path, other_fields=None
):
    field = src_collection.get_field(field_path)
    is_list = isinstance(field, fof.ListField) and not isinstance(
        field, fof.FrameSupportField
    )

    src_dataset = src_collection._dataset
    id_field = "_id" if not src_dataset._is_clips else "_sample_id"

    project = {
        "_id": False,
        "_sample_id": "$" + id_field,
        "_media_type": True,
        "_rand": True,
        "filepath": True,
        "metadata": True,
        "tags": True,
        "created_at": True,
        "last_modified_at": True,
        "support": "$" + field.name,
    }

    if other_fields:
        project.update({f: True for f in other_fields})

    pipeline = [{"$project": project}]

    if is_list:
        pipeline.extend(
            [{"$unwind": "$support"}, {"$addFields": {"_rand": {"$rand": {}}}}]
        )

    pipeline.extend(
        [
            {"$addFields": {"_dataset_id": dataset._doc.id}},
            {"$out": dataset._sample_collection_name},
        ]
    )

    src_collection._aggregate(post_pipeline=pipeline)


def _write_temporal_detection_clips(
    dataset, src_collection, field, other_fields=None
):
    src_dataset = src_collection._dataset
    root, is_list_field = src_collection._get_label_field_root(field)
    label_type = src_collection._get_label_field_type(field)

    supported_types = (fol.TemporalDetection, fol.TemporalDetections)
    if label_type not in supported_types:
        raise ValueError(
            "Field '%s' must be a %s type; found %s"
            % (field, supported_types, label_type)
        )

    id_field = "_id" if not src_dataset._is_clips else "_sample_id"

    project = {
        "_id": False,
        "_sample_id": "$" + id_field,
        "_media_type": True,
        "_rand": True,
        "filepath": True,
        "metadata": True,
        "tags": True,
        "created_at": True,
        "last_modified_at": True,
        field: True,
    }

    if other_fields:
        project.update({f: True for f in other_fields})

    pipeline = [
        {"$project": project},
        {"$match": {"$expr": {"$gt": ["$" + field, None]}}},
    ]

    if is_list_field:
        pipeline.append({"$unwind": "$" + root})

    if label_type is fol.TemporalDetections:
        pipeline.append({"$addFields": {field: "$" + root}})

    pipeline.extend(
        [
            {
                "$addFields": {
                    "_id": "$" + field + "._id",
                    "support": "$" + field + ".support",
                    field + "._cls": "Classification",
                    "_rand": {"$rand": {}},
                    "_dataset_id": dataset._doc.id,
                }
            },
            {"$project": {field + ".support": False}},
            {"$out": dataset._sample_collection_name},
        ]
    )

    src_collection._aggregate(post_pipeline=pipeline)


def _write_trajectories(dataset, src_collection, field, other_fields=None):
    path = src_collection._FRAMES_PREFIX + field
    label_type = src_collection._get_label_field_type(path)

    supported_types = (fol.Detections, fol.Polylines, fol.Keypoints)
    if label_type not in supported_types:
        raise ValueError(
            "Frame field '%s' must be a %s type; found %s"
            % (field, supported_types, label_type)
        )

    src_dataset = src_collection._dataset
    _tmp_field = "_" + field

    trajs = _get_trajectories(src_collection, field)

    src_collection._set_values(
        _tmp_field,
        trajs,
        expand_schema=False,
        _allow_missing=True,
    )

    try:
        src_collection = fod._always_select_field(src_collection, _tmp_field)

        id_field = "_id" if not src_dataset._is_clips else "_sample_id"

        project = {
            "_id": False,
            "_sample_id": "$" + id_field,
            _tmp_field: True,
            "_media_type": True,
            "filepath": True,
            "metadata": True,
            "tags": True,
            "created_at": True,
            "last_modified_at": True,
            field: True,
        }

        if other_fields:
            project.update({f: True for f in other_fields})

        src_collection._aggregate(
            post_pipeline=[
                {"$project": project},
                {"$unwind": "$" + _tmp_field},
                {
                    "$addFields": {
                        "support": {"$slice": ["$" + _tmp_field, 2, 2]},
                        field: {
                            "_cls": "DynamicEmbeddedDocument",
                            "label": {"$arrayElemAt": ["$" + _tmp_field, 0]},
                            "index": {"$arrayElemAt": ["$" + _tmp_field, 1]},
                        },
                        "_rand": {"$rand": {}},
                        "_dataset_id": dataset._doc.id,
                    },
                },
                {"$project": {_tmp_field: False}},
                {"$out": dataset._sample_collection_name},
            ]
        )
    finally:
        src_dataset._sample_collection.update_many(
            {}, {"$unset": {_tmp_field: ""}}
        )


def _write_expr_clips(
    dataset, src_collection, expr, other_fields=None, tol=0, min_len=0
):
    if etau.is_str(expr):
        _, path = src_collection._get_label_field_path(expr)
        leaf, _ = src_collection._handle_frame_field(path)
        expr = F(leaf).length() > 0
    elif isinstance(expr, dict):
        expr = foe.ViewExpression(expr)
    else:
        # map() modifies the expression in-place and we don't want to cause
        # side effects to the caller
        expr = deepcopy(expr)

    frame_numbers, bools = src_collection.values(
        ["frames.frame_number", F("frames").map(expr)]
    )

    clips = [
        _to_rle(fns, bs, tol=tol, min_len=min_len)
        for fns, bs in zip(frame_numbers, bools)
    ]

    _write_manual_clips(
        dataset, src_collection, clips, other_fields=other_fields
    )


def _write_manual_clips(dataset, src_collection, clips, other_fields=None):
    src_dataset = src_collection._dataset
    _tmp_field = "_support"

    src_collection._set_values(
        _tmp_field,
        clips,
        expand_schema=False,
        _allow_missing=True,
    )

    try:
        src_collection = fod._always_select_field(src_collection, _tmp_field)

        id_field = "_id" if not src_dataset._is_clips else "_sample_id"

        project = {
            "_id": False,
            "_sample_id": "$" + id_field,
            "_media_type": True,
            "filepath": True,
            "support": "$" + _tmp_field,
            "metadata": True,
            "tags": True,
            "created_at": True,
            "last_modified_at": True,
        }

        if other_fields:
            project.update({f: True for f in other_fields})

        src_collection._aggregate(
            post_pipeline=[
                {"$project": project},
                {"$unwind": "$support"},
                {
                    "$addFields": {
                        "_rand": {"$rand": {}},
                        "_dataset_id": dataset._doc.id,
                    }
                },
                {"$out": dataset._sample_collection_name},
            ]
        )
    finally:
        src_dataset._sample_collection.update_many(
            {}, {"$unset": {_tmp_field: ""}}
        )


def _get_trajectories(sample_collection, frame_field):
    path = sample_collection._FRAMES_PREFIX + frame_field
    root, is_list_field = sample_collection._get_label_field_root(path)
    root, _ = sample_collection._handle_frame_field(root)

    if not is_list_field:
        raise ValueError("Trajectories can only be extracted for label lists")

    fn_expr = F("frames").map(F("frame_number"))
    uuid_expr = F("frames").map(
        F(root).map(
            F("label").concat(
                ".", (F("index") != None).if_else(F("index").to_string(), "")
            )
        )
    )

    fns, all_uuids = sample_collection.values([fn_expr, uuid_expr])

    trajs = []
    for sample_fns, sample_uuids in zip(fns, all_uuids):
        if not sample_uuids:
            trajs.append(None)
            continue

        obs = defaultdict(_Bounds)
        for fn, frame_uuids in zip(sample_fns, sample_uuids):
            if not frame_uuids:
                continue

            for uuid in frame_uuids:
                label, index = uuid.rsplit(".", 1)
                if index:
                    index = int(index)
                    obs[(label, index)].add(fn)

        clips = []
        for (label, index), bounds in obs.items():
            clips.append((label, index, bounds.min, bounds.max))

        trajs.append(clips)

    return trajs


class _Bounds(object):
    def __init__(self):
        self.min = None
        self.max = None

    def add(self, value):
        if self.min is None:
            self.min = value
            self.max = value
        else:
            self.min = min(self.min, value)
            self.max = max(self.max, value)


def _to_rle(frame_numbers, bools, tol=0, min_len=0):
    if not frame_numbers:
        return None

    ranges = []
    start = None
    last = None
    for fn, b in zip(frame_numbers, bools):
        if start is not None and fn - last > tol + int(b):
            ranges.append((start, last))
            start = None
            last = None

        if b:
            if start is None:
                start = fn

            last = fn

    if start is not None:
        ranges.append((start, last))

    if min_len > 1:
        return [(s, l) for s, l in ranges if l - s + 1 >= min_len]

    return ranges
