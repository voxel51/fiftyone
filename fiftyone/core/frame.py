"""
Video frames.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

from bson import ObjectId
from pymongo import ReplaceOne, UpdateOne, DeleteOne, DeleteMany


from fiftyone.core.document import Document, DocumentView
import fiftyone.core.frame_utils as fofu
import fiftyone.core.odm as foo
from fiftyone.core.singletons import FrameSingleton
import fiftyone.core.utils as fou

fov = fou.lazy_import("fiftyone.core.view")


def get_default_frame_fields(include_private=False, use_db_fields=False):
    """Returns the default fields present on all frames.

    Args:
        include_private (False): whether to include fields starting with ``_``
        use_db_fields (False): whether to return database fields rather than
            user-facing fields, when applicable

    Returns:
        a tuple of field names
    """
    return foo.get_default_fields(
        foo.DatasetFrameDocument,
        include_private=include_private,
        use_db_fields=use_db_fields,
    )


class Frames(object):
    """An ordered dictionary of :class:`Frame` instances keyed by frame number
    representing the frames of a video :class:`fiftyone.core.sample.Sample`.

    :class:`Frames` instances behave like ``defaultdict(Frame)`` instances; an
    empty :class:`Frame` instance is returned when accessing a new frame
    number.

    :class:`Frames` instances should never be created manually; they are
    instantiated automatically when video :class:`fiftyone.core.sample.Sample`
    instances are created.

    Args:
        sample: the :class:`fiftyone.core.sample.Sample` to which the frames
            are attached
    """

    def __init__(self, sample):
        self._sample = sample
        self._iter = None
        self._replacements = {}
        self._delete_frames = set()
        self._delete_all = False

    def __str__(self):
        return "<%s: %s>" % (self.__class__.__name__, fou.pformat(dict(self)))

    def __repr__(self):
        return "<%s: %s>" % (self.__class__.__name__, len(self))

    def __bool__(self):
        return len(self) > 0

    def __len__(self):
        return len(self._get_frame_numbers())

    def __contains__(self, frame_number):
        return frame_number in self._get_frame_numbers()

    def __getitem__(self, frame_number):
        fofu.validate_frame_number(frame_number)

        if frame_number in self._replacements:
            return self._replacements[frame_number]

        if not self._in_db:
            frame = Frame(frame_number=frame_number)  # empty frame
            self._set_replacement(frame)
            return frame

        if self._delete_all or frame_number in self._delete_frames:
            d = None
        else:
            d = self._get_frame_db(frame_number)

        if d is None:
            # Empty frame
            d = {"_sample_id": self._sample_id, "frame_number": frame_number}

        frame = self._make_frame(d)
        self._set_replacement(frame)

        return frame

    def __setitem__(self, frame_number, frame):
        self.add_frame(frame_number, frame)

    def __delitem__(self, frame_number):
        self._replacements.pop(frame_number, None)

        if not self._in_db:
            return

        self._delete_frames.add(frame_number)

    def __iter__(self):
        self._iter = self.keys()
        return self

    def __next__(self):
        try:
            return next(self._iter)
        except StopIteration:
            self._iter = None
            raise

    @property
    def _in_db(self):
        return self._sample._in_db

    @property
    def _dataset(self):
        return self._sample._dataset

    @property
    def _sample_id(self):
        if self._dataset._is_clips:
            return ObjectId(self._sample._doc.sample_id)

        return self._sample._id

    @property
    def _sample_collection(self):
        return self._dataset._sample_collection

    @property
    def _frame_collection(self):
        return self._dataset._frame_collection

    @property
    def _frame_collection_name(self):
        return self._dataset._frame_collection_name

    @property
    def field_names(self):
        """An ordered tuple of the names of the fields on the frames."""
        return list(self._dataset.get_frame_field_schema().keys())

    def first(self):
        """Returns the first :class:`Frame` for the sample.

        Returns:
            a :class:`Frame`
        """
        try:
            return next(self.values())
        except StopIteration:
            id_str = " '%s'" % self._sample.id if self._sample.id else ""
            raise ValueError("Sample%s has no frame labels" % id_str)

    def last(self):
        """Returns the last :class:`Frame` for the sample.

        Returns:
            a :class:`Frame`
        """
        frame_numbers = self._get_frame_numbers()
        if frame_numbers:
            return self[max(frame_numbers)]

        id_str = " '%s'" % self._sample.id if self._sample.id else ""
        raise ValueError("Sample%s has no frame labels" % id_str)

    def head(self, num_frames=3):
        """Returns a list of the first few frames for the sample.

        If fewer than ``num_frames`` frames exist, only the available frames
        are returned.

        Args:
            num_frames (3): the number of frames

        Returns:
            a list of :class:`Frame` objects
        """
        if num_frames <= 0:
            return []

        return list(itertools.islice(self.values(), num_frames))

    def tail(self, num_frames=3):
        """Returns a list of the last few frames for the sample.

        If fewer than ``num_frames`` frames exist, only the available frames
        are returned.

        Args:
            num_frames (3): the number of frames

        Returns:
            a list of :class:`Frame` objects
        """
        if num_frames <= 0:
            return []

        frame_numbers = self._get_frame_numbers()
        if num_frames > len(frame_numbers):
            offset = None
        else:
            offset = sorted(frame_numbers)[-num_frames]

        return list(self._iter_frames(offset=offset))

    def keys(self):
        """Returns an iterator over the frame numbers with labels in the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits frame numbers
        """
        for frame_number in sorted(self._get_frame_numbers()):
            yield frame_number

    def items(self):
        """Returns an iterator over the frame numberes and :class:`Frame`
        instances for the sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits ``(frame_number, Frame)`` tuples
        """
        for frame in self._iter_frames():
            yield frame.frame_number, frame

    def values(self):
        """Returns an iterator over the :class:`Frame` instances for the
        sample.

        The frames are traversed in ascending order.

        Returns:
            a generator that emits :class:`Frame` instances
        """
        for frame in self._iter_frames():
            yield frame

    def add_frame(
        self,
        frame_number,
        frame,
        expand_schema=True,
        validate=True,
        dynamic=False,
    ):
        """Adds the frame to this instance.

        If an existing frame with the same frame number exists, it is
        overwritten.

        If the provided frame is a :class:`Frame` instance that does not belong
        to a dataset, it is updated in-place to reflect its membership in this
        dataset. Otherwise, the provided frame is not modified.

        Args:
            frame_number: the frame number
            frame: a :class:`Frame` or :class:`FrameView`
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema
            validate (True): whether to validate values for existing fields
            dynamic (False): whether to declare dynamic embedded document
                fields
        """
        fofu.validate_frame_number(frame_number)

        if not isinstance(frame, (Frame, FrameView)):
            raise TypeError(
                "Expected a %s or %s; found %s"
                % (Frame, FrameView, type(frame))
            )

        if self._in_db:
            _frame = frame
            if frame._in_db:
                frame = Frame()

            d = {"_sample_id": self._sample_id}
            doc = self._dataset._frame_dict_to_doc(d)

            for field, value in _frame.iter_fields():
                doc.set_field(
                    field,
                    value,
                    create=expand_schema,
                    validate=validate,
                    dynamic=dynamic,
                )

            doc.set_field("frame_number", frame_number)
            frame._set_backing_doc(doc, dataset=self._dataset)
        else:
            if frame._in_db:
                frame = frame.copy()

            frame.set_field("frame_number", frame_number)

        self._set_replacement(frame)

    def update(
        self,
        frames,
        overwrite=True,
        expand_schema=True,
        validate=True,
        dynamic=False,
    ):
        """Adds the frame labels to this instance.

        Args:
            frames: can be any of the following

                -   a :class:`Frames` instance
                -   a dictionary mapping frame numbers to :class:`Frame`
                    instances
                -   a dictionary mapping frame numbers to dictionaries mapping
                    label fields to :class:`fiftyone.core.labels.Label`
                    instances

            overwrite (True): whether to overwrite existing frames
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema
            validate (True): whether to validate values for existing fields
            dynamic (False): whether to declare dynamic embedded document
                fields
        """
        for frame_number, frame in frames.items():
            if overwrite or frame_number not in self:
                if isinstance(frame, dict):
                    frame = Frame(frame_number=frame_number, **frame)

                self.add_frame(
                    frame_number,
                    frame,
                    expand_schema=expand_schema,
                    validate=validate,
                    dynamic=dynamic,
                )

    def merge(
        self,
        frames,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        validate=True,
        dynamic=False,
    ):
        """Merges the given frames into this instance.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the provided frames are merged into existing
        frames with the same frame numbers (and new frames created as
        necessary), overwriting any existing values for those fields, with the
        exception of list fields (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both frames are updated rather
        than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether new fields can be added to the frame schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input frame fields to different field names of this frame

        Args:
            frames: can be any of the following

                -   a :class:`Frames` instance
                -   a dictionary mapping frame numbers to :class:`Frame`
                    instances
                -   a dictionary mapping frame numbers to dictionaries mapping
                    label fields to :class:`fiftyone.core.labels.Label`
                    instances

            fields (None): an optional field or iterable of fields to which to
                restrict the merge. This can also be a dict mapping field names
                of the input frame to field names of this frame
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types.
                For label lists fields, existing
                :class:`fiftyone.core.label.Label` elements are either replaced
                (when ``overwrite`` is True) or kept (when ``overwrite`` is
                False) when their ``id`` matches a label from the provided
                frames
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema
            validate (True): whether to validate values for existing fields
            dynamic (False): whether to declare dynamic embedded document
                fields
        """
        for frame_number, frame in frames.items():
            if isinstance(frame, dict):
                frame = Frame(frame_number=frame_number, **frame)

            if frame_number in self:
                self[frame_number].merge(
                    frame,
                    fields=fields,
                    omit_fields=omit_fields,
                    merge_lists=merge_lists,
                    overwrite=overwrite,
                    expand_schema=expand_schema,
                    validate=validate,
                    dynamic=dynamic,
                )
            else:
                if fields is not None or omit_fields is not None:
                    frame = frame.copy(fields=fields, omit_fields=omit_fields)

                self.add_frame(
                    frame_number,
                    frame,
                    expand_schema=expand_schema,
                    validate=validate,
                    dynamic=dynamic,
                )

    def clear(self):
        """Removes all frames from this sample."""
        self._replacements.clear()

        if not self._in_db:
            return

        self._delete_all = True
        self._delete_frames.clear()

    def save(self):
        """Saves all frames for the sample to the database."""
        self._save()

    def _save(self, deferred=False):
        if not self._in_db:
            raise ValueError(
                "Cannot save frames of a sample that has not been added to "
                "a dataset"
            )

        delete_ops = self._save_deletions(deferred=deferred)
        replace_ops = self._save_replacements(deferred=deferred)
        return delete_ops + replace_ops

    def reload(self, hard=False):
        """Reloads all frames for the sample from the database.

        Args:
            hard (False): whether to reload the frame schema in addition to the
                field values for the frames. This is necessary if new fields
                may have been added to the dataset's frame schema
        """
        self._delete_all = False
        self._delete_frames.clear()
        self._replacements.clear()

        Frame._sync_docs_for_sample(
            self._frame_collection_name,
            self._sample.id,
            self._get_frame_numbers,  # pass fcn so it can be lazily called
            hard=hard,
        )

    def _get_frame_numbers(self):
        frame_numbers = set(self._replacements.keys())

        if not self._in_db or self._delete_all:
            return frame_numbers

        frame_numbers |= self._get_frame_numbers_db()
        frame_numbers -= self._delete_frames

        return frame_numbers

    def _get_frame_db(self, frame_number):
        return self._frame_collection.find_one(
            {"_sample_id": self._sample_id, "frame_number": frame_number}
        )

    def _get_frames_match_stage(self):
        if self._dataset._is_clips:
            first, last = self._sample.support
            return {
                "$match": {
                    "$expr": {
                        "$and": [
                            {"$eq": ["$_sample_id", self._sample_id]},
                            {"$gte": ["$frame_number", first]},
                            {"$lte": ["$frame_number", last]},
                        ]
                    }
                }
            }

        return {"$match": {"_sample_id": self._sample_id}}

    def _get_frame_numbers_db(self):
        pipeline = [
            self._get_frames_match_stage(),
            {
                "$group": {
                    "_id": None,
                    "frame_numbers": {"$push": "$frame_number"},
                }
            },
        ]

        try:
            d = next(foo.aggregate(self._frame_collection, pipeline))
            return set(d["frame_numbers"])
        except StopIteration:
            return set()

    def _get_ids_map(self):
        pipeline = [
            {"$match": {"_sample_id": self._sample_id}},
            {"$project": {"frame_number": True}},
        ]

        id_map = {}
        for d in foo.aggregate(self._frame_collection, pipeline):
            id_map[d["frame_number"]] = d["_id"]

        return id_map

    def _set_replacement(self, frame):
        self._replacements[frame.frame_number] = frame

    def _iter_frames(self, offset=None):
        if offset is None:
            offset = -1

        if not self._in_db or self._delete_all:
            for frame_number in sorted(self._replacements.keys()):
                if frame_number >= offset:
                    yield self._replacements[frame_number]

            return

        if self._replacements:
            max_repl_fn = max(self._replacements.keys())
            repl_done = False
        else:
            max_repl_fn = -1
            repl_done = True

        results = self._iter_frames_db()

        try:
            d = next(results)
            db_done = False
        except StopIteration:
            d = None
            db_done = True

        frame_number = 1
        while True:
            if repl_done and db_done:
                break

            if frame_number >= offset:
                if not repl_done and frame_number in self._replacements:
                    yield self._replacements[frame_number]

                elif (
                    not db_done
                    and frame_number == d["frame_number"]
                    and frame_number not in self._delete_frames
                ):
                    frame = self._make_frame(d)
                    self._set_replacement(frame)

                    yield frame

            frame_number += 1

            if not repl_done:
                repl_done = max_repl_fn < frame_number

            if not db_done:
                while d["frame_number"] < frame_number:
                    try:
                        d = next(results)
                    except StopIteration:
                        db_done = True
                        break

    def _iter_frames_db(self):
        pipeline = [
            self._get_frames_match_stage(),
            {"$sort": {"frame_number": 1}},
        ]
        return foo.aggregate(self._frame_collection, pipeline)

    def _make_frame(self, d):
        doc = self._dataset._frame_dict_to_doc(d)
        return Frame.from_doc(doc, dataset=self._dataset)

    def _make_dict(self, frame, include_id=False):
        d = frame.to_mongo_dict(include_id=include_id)

        # We omit None here to allow frames with None-valued new fields to
        # be added without raising nonexistent field errors. This is safe
        # because None and missing are equivalent in our data model
        d = {k: v for k, v in d.items() if v is not None}

        d["_sample_id"] = self._sample_id

        return d

    def _to_frames_dict(self, include_private=False):
        return {
            str(fn): frame.to_dict(include_private=include_private)
            for fn, frame in self.items()
        }

    def _save_deletions(self, deferred=False):
        ops = []

        if self._delete_all:
            if deferred:
                ops.append(DeleteMany({"_sample_id": self._sample_id}))
            else:
                self._frame_collection.delete_many(
                    {"_sample_id": self._sample_id}
                )

            Frame._reset_docs(
                self._frame_collection_name, sample_ids=[self._sample.id]
            )

            self._delete_all = False
            self._delete_frames.clear()

        if self._delete_frames:
            ops = [
                DeleteOne(
                    {
                        "_sample_id": self._sample_id,
                        "frame_number": frame_number,
                    }
                )
                for frame_number in self._delete_frames
            ]

            if not deferred:
                self._frame_collection.bulk_write(ops, ordered=False)

            Frame._reset_docs_for_sample(
                self._frame_collection_name,
                self._sample.id,
                self._delete_frames,
            )

            self._delete_frames.clear()

        return ops

    def _save_replacements(
        self, include_singletons=True, validate=True, deferred=False
    ):
        if include_singletons:
            #
            # Since frames are singletons, the user will expect changes to any
            # in-memory frames to be saved, even if they aren't currently in
            # `_replacements`. This can happen, if, for example, our
            # replacements were flushed by a previous call to `sample.save()`
            # but then an in-memory frame was modified without explicitly
            # accessing it via `sample.frames[]`
            #
            replacements = Frame._get_instances(
                self._frame_collection_name, self._sample.id
            )
        else:
            replacements = None

        if replacements:
            replacements.update(self._replacements)
        else:
            replacements = self._replacements

        if not replacements:
            return []

        if validate:
            self._validate_frames(replacements)

        ops = []
        new_dicts = {}
        for frame_number, frame in replacements.items():
            d = self._make_dict(frame)
            if not frame._in_db:
                new_dicts[frame_number] = d

            op = ReplaceOne(
                {"frame_number": frame_number, "_sample_id": self._sample_id},
                d,
                upsert=True,
            )
            ops.append(op)

        if not deferred:
            self._frame_collection.bulk_write(ops, ordered=False)

        if new_dicts:
            ids_map = self._get_ids_map()
            for frame_number, d in new_dicts.items():
                frame = replacements[frame_number]
                if isinstance(frame._doc, foo.NoDatasetFrameDocument):
                    doc = self._dataset._frame_dict_to_doc(d)
                    frame._set_backing_doc(doc, dataset=self._dataset)

                frame._doc.id = ids_map[frame_number]

        self._replacements.clear()

        return ops

    def _validate_frames(self, frames):
        schema = self._dataset.get_frame_field_schema(include_private=True)

        for frame_number, frame in frames.items():
            non_existent_fields = None

            for field_name, value in frame.iter_fields():
                field = schema.get(field_name, None)
                if field is None:
                    if value is not None:
                        if non_existent_fields is None:
                            non_existent_fields = {field_name}
                        else:
                            non_existent_fields.add(field_name)
                else:
                    if value is not None or not field.null:
                        try:
                            field.validate(value)
                        except Exception as e:
                            raise ValueError(
                                "Invalid value for field '%s' of frame %d. "
                                "Reason: %s"
                                % (field_name, frame_number, str(e))
                            )

            if non_existent_fields:
                raise ValueError(
                    "Frame fields %s do not exist on dataset '%s'"
                    % (non_existent_fields, self._dataset.name)
                )


class FramesView(Frames):
    """An ordered dictionary of :class:`FrameView` instances keyed by frame
    number representing the frames of a video
    :class:`fiftyone.core.sample.SampleView`.

    :class:`FramesView` instances behave like ``defaultdict(FrameView)``
    instances; an empty :class:`FrameView` instance is returned when accessing
    a new frame number.

    :class:`FramesView` instances should never be created manually; they are
    instantiated automatically when video
    :class:`fiftyone.core.sample.SampleView` instances are created.

    Args:
        sample_view: the :class:`fiftyone.core.sample.SampleView` to which the
            frames are attached
    """

    def __init__(self, sample_view):
        super().__init__(sample_view)

        view = sample_view._view

        sf, ef = view._get_selected_excluded_fields(
            frames=True, roots_only=True
        )
        ff = view._get_filtered_fields(frames=True)

        needs_frames = view._needs_frames()
        contains_all_fields = view._contains_all_fields(frames=True)

        optimized_view = fov.make_optimized_select_view(view, sample_view.id)
        frames_pipeline = optimized_view._pipeline(frames_only=True)

        self._view = view
        self._selected_fields = sf
        self._excluded_fields = ef
        self._filtered_fields = ff
        self._needs_frames = needs_frames
        self._contains_all_fields = contains_all_fields
        self._frames_pipeline = frames_pipeline

    @property
    def field_names(self):
        return list(self._view.get_frame_field_schema().keys())

    def add_frame(
        self,
        frame_number,
        frame,
        expand_schema=True,
        validate=True,
        dynamic=False,
    ):
        """Adds the frame to this instance.

        If an existing frame with the same frame number exists, it is
        overwritten.

        Unlike :class:`Frames.add_frame`, the provided frame is never modified
        in-place. Instead, a new :class:`FrameView` is constructed internally
        with the contents of the provided frame.

        Args:
            frame_number: the frame number
            frame: a :class:`Frame` or :class:`FrameView`
            expand_schema (True): whether to dynamically add new frame fields
                encountered to the dataset schema. If False, an error is raised
                if the frame's schema is not a subset of the dataset schema
            validate (True): whether to validate values for existing fields
            dynamic (False): whether to declare dynamic embedded document
                fields
        """
        fofu.validate_frame_number(frame_number)

        if not isinstance(frame, (Frame, FrameView)):
            raise TypeError(
                "Expected a %s or %s; found %s"
                % (Frame, FrameView, type(frame))
            )

        frame_view = self._make_frame({"_sample_id": self._sample_id})

        for field, value in frame.iter_fields():
            frame_view.set_field(
                field,
                value,
                create=expand_schema,
                validate=validate,
                dynamic=dynamic,
            )

        frame_view.set_field("frame_number", frame_number)
        self._set_replacement(frame_view)

    def reload(self):
        """Reloads the view into the frames of the attached sample.

        Calling this method has the following effects:

        -   Clears the in-memory cache of :class:`FrameView` instances that you
            have loaded via this object. Any frames that you subsequently
            access will be loaded directly from the database

        -   Any additions, modifications, or deletions to frame views that you
            have loaded from this instance but not committed to the database by
            calling :meth:`save` will be discarded

        .. note::

            :class:`FrameView` objects are not singletons, so calling this
            method will not have any effect on :class:`FrameView` instances
            that you have **previously** loaded via this object

        Args:
            hard (False): whether to reload the frame schema in addition to the
                field values for the frames. This is necessary if new fields
                may have been added to the dataset's frame schema
        """
        self._delete_all = False
        self._delete_frames.clear()
        self._replacements.clear()

    def _get_frame_numbers_db(self):
        if not self._needs_frames:
            return super()._get_frame_numbers_db()

        pipeline = self._frames_pipeline + [
            {
                "$group": {
                    "_id": None,
                    "frame_numbers": {"$push": "$frame_number"},
                }
            }
        ]

        try:
            d = next(foo.aggregate(self._sample_collection, pipeline))
            return set(d["frame_numbers"])
        except StopIteration:
            return set()

    def _get_frame_db(self, frame_number):
        if not self._needs_frames:
            return super()._get_frame_db(frame_number)

        try:
            result = self._view._aggregate(
                frames_only=True,
                post_pipeline=[
                    {
                        "$match": {
                            "_sample_id": self._sample_id,
                            "frame_number": frame_number,
                        }
                    }
                ],
            )
            return next(result)
        except StopIteration:
            return None

    def _iter_frames_db(self):
        if not self._needs_frames:
            return super()._iter_frames_db()

        return foo.aggregate(self._sample_collection, self._frames_pipeline)

    def _make_frame(self, d):
        doc = self._dataset._frame_dict_to_doc(d)
        return FrameView(
            doc,
            self._view,
            selected_fields=self._selected_fields,
            excluded_fields=self._excluded_fields,
            filtered_fields=self._filtered_fields,
        )

    def _save_replacements(self, validate=True, deferred=False):
        if not self._replacements:
            return []

        if self._contains_all_fields:
            return super()._save_replacements(
                include_singletons=False,
                validate=validate,
                deferred=deferred,
            )

        if validate:
            self._validate_frames(self._replacements)

        ops = []
        for frame_number, frame in self._replacements.items():
            doc = self._make_dict(frame)

            # Update elements of filtered array fields separately
            if self._filtered_fields is not None:
                for field in self._filtered_fields:
                    root, leaf = field.split(".", 1)
                    for element in doc.pop(root, {}).get(leaf, []):
                        ops.append(
                            UpdateOne(
                                {
                                    "frame_number": frame_number,
                                    "_sample_id": self._sample_id,
                                    field + "._id": element["_id"],
                                },
                                {"$set": {field + ".$": element}},
                            )
                        )

            # Update non-filtered fields
            ops.append(
                UpdateOne(
                    {
                        "frame_number": frame_number,
                        "_sample_id": self._sample_id,
                    },
                    {"$set": doc},
                    upsert=True,
                )
            )

        if not deferred:
            self._frame_collection.bulk_write(ops, ordered=False)

        self._replacements.clear()

        return ops

    def save(self):
        super().save()
        self._reload_parents()

    def _reload_parents(self):
        Frame._sync_docs_for_sample(
            self._frame_collection_name,
            self._sample.id,
            self._get_frame_numbers,  # pass fcn so it can be lazily called
        )


class Frame(Document, metaclass=FrameSingleton):
    """A frame in a video :class:`fiftyone.core.sample.Sample`.

    Frames store all information associated with a particular frame of a video,
    including one or more sets of labels (ground truth, user-provided, or
    FiftyOne-generated) as well as additional features associated with subsets
    of the data and/or label sets.

    .. note::

        :class:`Frame` instances that are attached to samples **in datasets**
        are singletons, i.e.,  ``sample.frames[frame_number]`` will always
        return the same :class:`Frame` instance.

    Args:
        **kwargs: frame fields and values
    """

    _NO_DATASET_DOC_CLS = foo.NoDatasetFrameDocument

    @property
    def sample_id(self):
        return self._doc._sample_id

    @property
    def _sample_id(self):
        _id = self._doc._sample_id
        return ObjectId(_id) if _id is not None else None

    def save(self):
        """Saves the frame to the database."""
        if not self._in_db:
            raise ValueError(
                "Use `sample.save()` to save newly added frames to a sample"
            )

        super().save()

    def _reload_backing_doc(self):
        if not self._in_db:
            return

        d = self._dataset._frame_collection.find_one(
            {"_sample_id": self._sample_id, "frame_number": self.frame_number}
        )
        self._doc = self._dataset._frame_dict_to_doc(d)


class FrameView(DocumentView):
    """A view into a :class:`Frame` in a video dataset.

    Like :class:`Frame` instances, the fields of a :class:`FrameView` instance
    can be modified, new fields can be created, and any changes can be saved to
    the database.

    :class:`FrameView` instances differ from :class:`Frame` instances in the
    following ways:

    -   A frame view may contain only a subset of the fields of its source
        frame, either by selecting and/or excluding specific fields
    -   A frame view may contain array fields or embedded array fields that
        have been filtered, thus containing only a subset of the array elements
        from the source frame
    -   Excluded fields of a frame view may not be accessed or modified

    .. note::

        :meth:`FrameView.save` will not delete any excluded fields or filtered
        array elements from the source frame.

    Frame views should never be created manually; they are generated when
    accessing the frames in a :class:`fiftyone.core.view.DatasetView`.

    Args:
        doc: a :class:`fiftyone.core.odm.frame.DatasetFrameDocument`
        view: the :class:`fiftyone.core.view.DatasetView` that the frame
            belongs to
        selected_fields (None): a set of field names that this frame view is
            restricted to, if any
        excluded_fields (None): a set of field names that are excluded from
            this frame view, if any
        filtered_fields (None): a set of field names of list fields that are
            filtered in this frame view, if any
    """

    _DOCUMENT_CLS = Frame

    @property
    def sample_id(self):
        return self._doc._sample_id

    @property
    def _sample_id(self):
        _id = self._doc._sample_id
        return ObjectId(_id) if _id is not None else None
