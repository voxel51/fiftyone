"""
Mixins and helpers for dataset backing documents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict

from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

from .database import get_db_conn
from .dataset import create_field, SampleFieldDocument
from .document import Document
from .utils import (
    deserialize_value,
    serialize_value,
    create_field,
    create_implied_field,
    get_implied_field_kwargs,
    validate_field_name,
    validate_fields_match,
)

fod = fou.lazy_import("fiftyone.core.dataset")
fog = fou.lazy_import("fiftyone.core.groups")


def get_default_fields(cls, include_private=False, use_db_fields=False):
    """Gets the default fields present on all instances of the given
    :class:`DatasetMixin` class.

    Args:
        cls: the :class:`DatasetMixin` class
        include_private (False): whether to include fields starting with ``_``
        use_db_fields (False): whether to return database fields rather than
            user-facing fields, when applicable

    Returns:
        a tuple of field names
    """
    return cls._get_fields_ordered(
        include_private=include_private, use_db_fields=use_db_fields
    )


class DatasetMixin(object):
    """Mixin interface for :class:`fiftyone.core.odm.document.Document`
    subclasses that are backed by a dataset.
    """

    # Subtypes must declare this
    _is_frames_doc = None

    # Subtypes must declare this
    _dataset = None

    def __setattr__(self, name, value):
        if name in self._fields and value is not None:
            self._fields[name].validate(value)

        super().__setattr__(name, value)

    @property
    def collection_name(self):
        return self.__class__.__name__

    @property
    def field_names(self):
        return self._get_field_names(include_private=False)

    @classmethod
    def _doc_name(cls):
        return "Frame" if cls._is_frames_doc else "Sample"

    @classmethod
    def _fields_attr(cls):
        return "frame_fields" if cls._is_frames_doc else "sample_fields"

    def _get_field_names(self, include_private=False, use_db_fields=False):
        return self._get_fields_ordered(
            include_private=include_private,
            use_db_fields=use_db_fields,
        )

    @classmethod
    def _get_default_fields(cls, include_private=False, use_db_fields=False):
        # pylint: disable=no-member
        return cls.__bases__[0]._get_fields_ordered(
            include_private=include_private,
            use_db_fields=use_db_fields,
        )

    @classmethod
    def _get_fields_ordered(cls, include_private=False, use_db_fields=False):
        field_names = cls._fields_ordered

        if not include_private:
            field_names = tuple(
                f for f in field_names if not f.startswith("_")
            )

        if use_db_fields:
            field_names = cls._to_db_fields(field_names)

        return field_names

    @classmethod
    def _to_db_fields(cls, field_names):
        # pylint: disable=no-member
        return tuple(cls._fields[f].db_field or f for f in field_names)

    def has_field(self, field_name):
        # pylint: disable=no-member
        return field_name in self._fields

    def get_field(self, field_name):
        if not self.has_field(field_name):
            raise AttributeError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        return super().get_field(field_name)

    def set_field(
        self,
        field_name,
        value,
        create=True,
        validate=True,
        dynamic=False,
    ):
        validate_field_name(field_name)

        if not self.has_field(field_name):
            if create:
                self.add_implied_field(
                    field_name,
                    value,
                    expand_schema=True,
                    validate=validate,
                    dynamic=dynamic,
                )
            else:
                raise ValueError(
                    "%s has no field '%s'" % (self._doc_name(), field_name)
                )
        elif value is not None:
            if validate:
                self._fields[field_name].validate(value)

            if dynamic:
                self.add_implied_field(
                    field_name,
                    value,
                    expand_schema=create,
                    validate=validate,
                    dynamic=dynamic,
                )

        super().__setattr__(field_name, value)

    def clear_field(self, field_name):
        self.set_field(field_name, None, create=False)

    @classmethod
    def get_field_schema(
        cls, ftype=None, embedded_doc_type=None, include_private=False
    ):
        """Returns a schema dictionary describing the fields of this document.

        If the document belongs to a dataset, the schema will apply to all
        documents in the collection.

        Args:
            ftype (None): an optional field type or iterable of field types to
                which to restrict the returned schema. Must be subclass(es) of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type or
                iterable of types to which to restrict the returned schema.
                Must be subclass(es) of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema

        Returns:
             a dictionary mapping field names to field types
        """
        fof.validate_type_constraints(
            ftype=ftype, embedded_doc_type=embedded_doc_type
        )

        schema = OrderedDict()
        field_names = cls._get_fields_ordered(include_private=include_private)
        for field_name in field_names:
            # pylint: disable=no-member
            field = cls._fields[field_name]

            if fof.matches_type_constraints(
                field, ftype=ftype, embedded_doc_type=embedded_doc_type
            ):
                schema[field_name] = field

        return schema

    @classmethod
    def merge_field_schema(
        cls,
        schema,
        expand_schema=True,
        recursive=True,
        validate=True,
    ):
        """Merges the field schema into this document.

        Args:
            schema: a dictionary mapping field names or
                ``embedded.field.names``to
                :class:`fiftyone.core.fields.Field` instances
            expand_schema (True): whether to add new fields to the schema
                (True) or simply validate that fields already exist with
                consistent types (False)
            recursive (True): whether to recursively merge embedded document
                fields
            validate (True): whether to validate the field against an existing
                field at the same path

        Returns:
            True/False whether any new fields were added

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name or a new field is found but
                ``expand_schema == False``
        """
        new_schema = {}

        for path, field in schema.items():
            new_fields = cls._merge_field(
                path,
                field,
                validate=validate,
                recursive=recursive,
            )
            if new_fields:
                new_schema.update(new_fields)

        if new_schema and not expand_schema:
            raise ValueError(
                "%s fields %s do not exist"
                % (cls._doc_name(), list(new_schema.keys()))
            )

        if not new_schema:
            return False

        for path, field in new_schema.items():
            cls._add_field_schema(path, field)

        cls._dataset.save()

        return True

    @classmethod
    def add_field(
        cls,
        path,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        expand_schema=True,
        recursive=True,
        validate=True,
        **kwargs,
    ):
        """Adds a new field or embedded field to the document, if necessary.

        Args:
            path: the field name or ``embedded.field.name``
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
            fields (None): a list of :class:`fiftyone.core.fields.Field`
                instances defining embedded document attributes. Only
                applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            description (None): an optional description
            info (None): an optional info dict
            expand_schema (True): whether to add new fields to the schema
                (True) or simply validate that the field already exists with a
                consistent type (False)
            recursive (True): whether to recursively add embedded document
                fields
            validate (True): whether to validate the field against an existing
                field at the same path

        Returns:
            True/False whether one or more fields or embedded fields were added
            to the document or its children

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name
        """
        field = cls._create_field(
            path,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            fields=fields,
            description=description,
            info=info,
            **kwargs,
        )

        return cls.merge_field_schema(
            {path: field},
            expand_schema=expand_schema,
            recursive=recursive,
            validate=validate,
        )

    @classmethod
    def add_implied_field(
        cls,
        path,
        value,
        expand_schema=True,
        dynamic=False,
        recursive=True,
        validate=True,
    ):
        """Adds the field or embedded field to the document, if necessary,
        inferring the field type from the provided value.

        Args:
            path: the field name or ``embedded.field.name``
            value: the field value
            expand_schema (True): whether to add new fields to the schema
                (True) or simply validate that the field already exists with a
                consistent type (False)
            dynamic (False): whether to declare dynamic embedded document
                fields
            recursive (True): whether to recursively add embedded document
                fields
            validate (True): whether to validate the field against an existing
                field at the same path

        Returns:
            True/False whether one or more fields or embedded fields were added
            to the document or its children

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name
        """
        field = create_implied_field(path, value, dynamic=dynamic)

        return cls.merge_field_schema(
            {path: field},
            expand_schema=expand_schema,
            recursive=recursive,
            validate=validate,
        )

    @classmethod
    def _create_field(
        cls,
        path,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        **kwargs,
    ):
        field_name = path.rsplit(".", 1)[-1]
        return create_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            fields=fields,
            description=description,
            info=info,
            **kwargs,
        )

    @classmethod
    def _rename_fields(cls, sample_collection, paths, new_paths):
        """Renames the fields of the documents in this collection.

        Args:
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection`
            paths: an iterable of field names or ``embedded.field.names``
            new_paths: an iterable of new field names or
                ``embedded.field.names``
        """
        dataset = cls._dataset
        dataset_doc = dataset._doc
        media_type = dataset.media_type
        is_frame_field = cls._is_frames_doc
        is_dataset = isinstance(sample_collection, fod.Dataset)
        new_group_field = None

        simple_paths = []
        coll_paths = []
        schema_paths = []

        for path, new_path in zip(paths, new_paths):
            is_root_field = "." not in path
            field, is_default = cls._get_field(
                path, allow_missing=True, check_default=True
            )
            existing_field = cls._get_field(new_path, allow_missing=True)

            if field is None and is_root_field:
                raise AttributeError(
                    "%s field '%s' does not exist" % (cls._doc_name(), path)
                )

            if is_default:
                raise ValueError(
                    "Cannot rename default %s field '%s'"
                    % (cls._doc_name().lower(), path)
                )

            if existing_field is not None:
                raise ValueError(
                    "%s field '%s' already exists"
                    % (cls._doc_name(), new_path)
                )

            validate_field_name(
                new_path,
                media_type=media_type,
                is_frame_field=is_frame_field,
            )

            if fog.is_group_field(field):
                if "." in new_path:
                    raise ValueError(
                        "Invalid group field '%s'; group fields must be "
                        "top-level fields" % new_path
                    )

                new_group_field = new_path

            if is_dataset and is_root_field:
                simple_paths.append((path, new_path))
            else:
                coll_paths.append((path, new_path))

            if field is not None:
                schema_paths.append((path, new_path))

        if simple_paths:
            _paths, _new_paths = zip(*simple_paths)
            cls._rename_fields_simple(_paths, _new_paths)

        if coll_paths:
            _paths, _new_paths = zip(*coll_paths)
            cls._rename_fields_collection(
                sample_collection, _paths, _new_paths
            )

        for path, new_path in schema_paths:
            cls._rename_field_schema(path, new_path)

        if new_group_field:
            dataset_doc.group_field = new_group_field

        dataset_doc.app_config._rename_paths(paths, new_paths)
        dataset_doc.save()

    @classmethod
    def _clone_fields(cls, sample_collection, paths, new_paths):
        """Clones the field(s) of the documents in this collection.

        Args:
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection`
            paths: an iterable of field names or ``embedded.field.names``
            new_paths: an iterable of new field names or
                ``embedded.field.names``
        """
        dataset = cls._dataset
        dataset_doc = dataset._doc
        media_type = dataset.media_type
        is_frame_field = cls._is_frames_doc
        is_dataset = isinstance(sample_collection, fod.Dataset)

        simple_paths = []
        coll_paths = []
        schema_paths = []

        for path, new_path in zip(paths, new_paths):
            is_root_field = "." not in path
            field = cls._get_field(path, allow_missing=True)
            existing_field = cls._get_field(new_path, allow_missing=True)

            if field is not None:
                if fog.is_group_field(field):
                    raise ValueError(
                        "Cannot clone group field '%s'. Datasets may only "
                        "have one group field" % path
                    )
            elif is_root_field:
                raise AttributeError(
                    "%s field '%s' does not exist" % (cls._doc_name(), path)
                )

            if existing_field is not None:
                raise ValueError(
                    "%s field '%s' already exists"
                    % (cls._doc_name(), new_path)
                )

            validate_field_name(
                new_path,
                media_type=media_type,
                is_frame_field=is_frame_field,
            )

            if is_dataset and is_root_field:
                simple_paths.append((path, new_path))
            else:
                coll_paths.append((path, new_path))

            if field is not None:
                schema_paths.append((path, new_path))

        if simple_paths:
            _paths, _new_paths = zip(*simple_paths)
            cls._clone_fields_simple(_paths, _new_paths)

        if coll_paths:
            _paths, _new_paths = zip(*coll_paths)
            cls._clone_fields_collection(sample_collection, _paths, _new_paths)

        for path, new_path in schema_paths:
            cls._clone_field_schema(path, new_path)

        dataset_doc.save()

    @classmethod
    def _clear_fields(cls, sample_collection, paths):
        """Clears the field(s) of the documents in this collection.

        Args:
            sample_collection: the
                :class:`fiftyone.core.samples.SampleCollection`
            paths: an iterable of field names or ``embedded.field.names``
        """
        is_dataset = isinstance(sample_collection, fod.Dataset)

        simple_paths = []
        coll_paths = []

        for path in paths:
            is_root_field = "." not in path
            field = cls._get_field(path, allow_missing=True)

            if field is None and is_root_field:
                raise AttributeError(
                    "%s field '%s' does not exist" % (cls._doc_name(), path)
                )

            if is_dataset and is_root_field:
                simple_paths.append(path)
            else:
                coll_paths.append(path)

        if simple_paths:
            cls._clear_fields_simple(simple_paths)

        if coll_paths:
            cls._clear_fields_collection(sample_collection, coll_paths)

    @classmethod
    def _delete_fields(cls, paths, error_level=0):
        """Deletes the field(s) from the documents in this collection.

        Args:
            paths: an iterable of field names or ``embedded.field.names``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a field cannot be deleted
            -   1: log warning if a field cannot be deleted
            -   2: ignore fields that cannot be deleted
        """
        dataset = cls._dataset
        dataset_doc = dataset._doc
        media_type = dataset.media_type
        is_frame_field = cls._is_frames_doc

        del_paths = []
        del_schema_paths = []

        for path in paths:
            field, is_default = cls._get_field(
                path, allow_missing=True, check_default=True
            )

            if field is None:
                if "." in path:
                    # Allow for dynamic embedded fields
                    del_paths.append(path)
                else:
                    fou.handle_error(
                        AttributeError(
                            "%s field '%s' does not exist"
                            % (cls._doc_name(), path)
                        ),
                        error_level,
                    )

                continue

            if is_default:
                fou.handle_error(
                    ValueError(
                        "Cannot delete default %s field '%s'"
                        % (cls._doc_name().lower(), path)
                    ),
                    error_level,
                )
                continue

            if (
                media_type == fom.GROUP
                and not is_frame_field
                and path == dataset.group_field
            ):
                media_types = list(set(dataset_doc.group_media_types.values()))
                if len(media_types) > 1:
                    fou.handle_error(
                        ValueError(
                            "Cannot delete group field '%s' of a grouped "
                            "dataset that contains multiple media types" % path
                        ),
                        error_level,
                    )
                    continue

                dataset._group_slice = None
                dataset_doc.group_field = None
                dataset_doc.default_group_slice = None
                dataset_doc.group_media_types = {}
                dataset_doc.media_type = media_types[0]

            del_paths.append(path)
            del_schema_paths.append(path)

        if del_paths:
            cls._delete_fields_simple(del_paths)

        for del_path in del_schema_paths:
            cls._delete_field_schema(del_path)

        if del_paths:
            dataset_doc.app_config._delete_paths(del_paths)
            dataset_doc.save()

    @classmethod
    def _remove_dynamic_fields(cls, paths, error_level=0):
        """Removes the dynamic embedded field(s) from the collection's schema.

        The actual data is **not** deleted from the collection.

        Args:
            paths: an iterable of ``embedded.field.names``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a field cannot be removed
            -   1: log warning if a field cannot be removed
            -   2: ignore fields that cannot be removed
        """
        del_paths = []

        for path in paths:
            field, is_default = cls._get_field(
                path, allow_missing=True, check_default=True
            )

            if field is None:
                fou.handle_error(
                    AttributeError(
                        "%s field '%s' does not exist"
                        % (cls._doc_name(), path)
                    ),
                    error_level,
                )
                continue

            if "." not in path:
                fou.handle_error(
                    ValueError(
                        "Cannot remove top-level %s field '%s' from schema"
                        % (cls._doc_name().lower(), path)
                    ),
                    error_level,
                )
                continue

            if is_default:
                fou.handle_error(
                    ValueError(
                        "Cannot remove default %s field '%s'"
                        % (cls._doc_name().lower(), path)
                    ),
                    error_level,
                )
                continue

            del_paths.append(path)

        for del_path in del_paths:
            cls._delete_field_schema(del_path)

        if del_paths:
            dataset_doc = cls._dataset._doc
            dataset_doc.app_config._delete_paths(del_paths)
            dataset_doc.save()

    @classmethod
    def _rename_fields_simple(cls, paths, new_paths):
        if not paths:
            return

        _paths, _new_paths = cls._handle_db_fields(paths, new_paths)

        rename_expr = {k: v for k, v in zip(_paths, _new_paths)}

        coll = get_db_conn()[cls.__name__]
        coll.update_many({}, {"$rename": rename_expr})

    @classmethod
    def _rename_fields_collection(cls, sample_collection, paths, new_paths):
        from fiftyone import ViewField as F

        if not paths:
            return

        _paths, _new_paths = cls._handle_db_fields(paths, new_paths)

        if cls._is_frames_doc:
            prefix = sample_collection._FRAMES_PREFIX
            paths = [prefix + p for p in paths]
            new_paths = [prefix + p for p in new_paths]
            _paths = [prefix + p for p in _paths]
            _new_paths = [prefix + p for p in _new_paths]

        view = sample_collection.view()
        for path, new_path in zip(_paths, _new_paths):
            new_base = new_path.rsplit(".", 1)[0]
            if "." in path:
                base, leaf = path.rsplit(".", 1)
            else:
                base, leaf = path, ""

            if new_base == base:
                expr = F(leaf)
            else:
                expr = F("$" + path)

            view = view.set_field(new_path, expr, _allow_missing=True)

        view = view.mongo([{"$unset": _paths}])

        #
        # Ideally only the embedded field would be saved, but the `$merge`
        # operator will always overwrite top-level fields of each document, so
        # we limit the damage by projecting onto the modified fields
        #
        field_roots = sample_collection._get_root_fields(paths + new_paths)
        view.save(field_roots)

    @classmethod
    def _clone_fields_simple(cls, paths, new_paths):
        if not paths:
            return

        _paths, _new_paths = cls._handle_db_fields(paths, new_paths)

        set_expr = {v: "$" + k for k, v in zip(_paths, _new_paths)}

        coll = get_db_conn()[cls.__name__]
        coll.update_many({}, [{"$set": set_expr}])

    @classmethod
    def _clone_fields_collection(cls, sample_collection, paths, new_paths):
        from fiftyone import ViewField as F

        if not paths:
            return

        _paths, _new_paths = cls._handle_db_fields(paths, new_paths)

        if cls._is_frames_doc:
            prefix = sample_collection._FRAMES_PREFIX
            paths = [prefix + p for p in paths]
            new_paths = [prefix + p for p in new_paths]
            _paths = [prefix + p for p in _paths]
            _new_paths = [prefix + p for p in _new_paths]

        view = sample_collection.view()
        for path, new_path in zip(_paths, _new_paths):
            new_base = new_path.rsplit(".", 1)[0]
            if "." in path:
                base, leaf = path.rsplit(".", 1)
            else:
                base, leaf = path, ""

            if new_base == base:
                expr = F(leaf)
            else:
                expr = F("$" + path)

            view = view.set_field(new_path, expr, _allow_missing=True)

        #
        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each document, so
        # we limit the damage by projecting onto the modified fields
        #
        field_roots = sample_collection._get_root_fields(new_paths)
        view.save(field_roots)

    @classmethod
    def _clear_fields_simple(cls, paths):
        if not paths:
            return

        _paths = cls._handle_db_fields(paths)

        coll = get_db_conn()[cls.__name__]
        coll.update_many({}, {"$set": {p: None for p in _paths}})

    @classmethod
    def _clear_fields_collection(cls, sample_collection, paths):
        if not paths:
            return

        _paths = cls._handle_db_fields(paths)

        if cls._is_frames_doc:
            prefix = sample_collection._FRAMES_PREFIX
            paths = [prefix + p for p in paths]
            _paths = [prefix + p for p in _paths]

        view = sample_collection.view()
        for _path in _paths:
            view = view.set_field(_path, None, _allow_missing=True)

        #
        # Ideally only the embedded field would be merged in, but the `$merge`
        # operator will always overwrite top-level fields of each document, so
        # we limit the damage by projecting onto the modified fields
        #
        field_roots = sample_collection._get_root_fields(paths)
        view.save(field_roots)

    @classmethod
    def _delete_fields_simple(cls, paths):
        if not paths:
            return

        _paths = cls._handle_db_fields(paths)

        coll = get_db_conn()[cls.__name__]
        coll.update_many({}, [{"$unset": _paths}])

    @classmethod
    def _handle_db_field(cls, path, new_path=None):
        field = cls._get_field(path, allow_missing=True)

        if field is None or field.db_field is None:
            if new_path is not None:
                return path, new_path

            return path

        _path = _get_db_field(field, path)

        if new_path is not None:
            _new_path = _get_db_field(field, new_path)
            return _path, _new_path

        return _path

    @classmethod
    def _handle_db_fields(cls, paths, new_paths=None):
        if new_paths is not None:
            return zip(
                *[
                    cls._handle_db_field(p, np)
                    for p, np in zip(paths, new_paths)
                ]
            )

        return tuple(cls._handle_db_field(p) for p in paths)

    @classmethod
    def _merge_field(cls, path, field, validate=True, recursive=True):
        chunks = path.split(".")
        field_name = chunks[-1]

        # Handle embedded fields
        root = None
        doc = cls
        for chunk in chunks[:-1]:
            if root is None:
                root = chunk
            else:
                root += "." + chunk

            schema = doc._fields

            if chunk not in schema:
                raise ValueError(
                    "Cannot infer an appropriate type for non-existent %s "
                    "field '%s' while defining embedded field '%s'"
                    % (cls._doc_name().lower(), root, path)
                )

            doc = schema[chunk]

            if isinstance(doc, fof.ListField):
                doc = doc.field

            if not isinstance(doc, fof.EmbeddedDocumentField):
                raise ValueError(
                    "Cannot define schema for embedded %s field '%s' because "
                    "field '%s' is a %s, not an %s"
                    % (
                        cls._doc_name().lower(),
                        path,
                        root,
                        type(doc),
                        fof.EmbeddedDocumentField,
                    )
                )

        if isinstance(field, fof.ObjectIdField) and field_name.startswith("_"):
            field_name = field_name[1:]

        if field_name == "id":
            return

        if field_name in doc._fields:
            existing_field = doc._fields[field_name]

            if recursive and isinstance(
                existing_field, fof.EmbeddedDocumentField
            ):
                return existing_field._merge_fields(
                    path, field, validate=validate, recursive=recursive
                )

            if validate:
                validate_fields_match(path, field, existing_field)

            return

        dataset = cls._dataset
        media_type = dataset.media_type
        is_frame_field = cls._is_frames_doc

        validate_field_name(
            field_name,
            media_type=media_type,
            is_frame_field=is_frame_field,
        )

        if fog.is_group_field(field):
            if is_frame_field:
                raise ValueError(
                    "Cannot create frame-level group field '%s'. "
                    "Group fields must be top-level sample fields" % field_name
                )

            # `group_field` could be None here if we're in the process
            # of merging one dataset's schema into another
            if dataset.group_field not in (None, field_name):
                raise ValueError(
                    "Cannot add group field '%s'. Datasets may only "
                    "have one group field" % field_name
                )

        return {path: field}

    @classmethod
    def _add_field_schema(cls, path, field):
        field_name, doc, field_docs = cls._parse_path(path)

        field = field.copy()
        field.db_field = _get_db_field(field, field_name)
        field.name = field_name

        doc._declare_field(cls._dataset, path, field)
        _add_field_doc(field_docs, field)

    @classmethod
    def _rename_field_schema(cls, path, new_path):
        same_root, new_field_name = _parse_paths(path, new_path)
        field_name, doc, field_docs = cls._parse_path(path)

        field = doc._fields[field_name]
        new_db_field = _get_db_field(field, new_field_name)

        field.name = new_field_name
        field.db_field = new_db_field

        if same_root:
            doc._update_field(cls._dataset, field_name, path, field)
            _update_field_doc(field_docs, field_name, field)
        else:
            doc._undeclare_field(field_name)
            _delete_field_doc(field_docs, field_name)

            _, new_doc, new_field_docs = cls._parse_path(new_path)
            new_doc._declare_field(cls._dataset, new_path, field)
            _add_field_doc(new_field_docs, field)

    @classmethod
    def _clone_field_schema(cls, path, new_path):
        field_name, doc, _ = cls._parse_path(path)
        field = doc._fields[field_name]

        cls._add_field_schema(new_path, field)

    @classmethod
    def _delete_field_schema(cls, path):
        field_name, doc, field_docs = cls._parse_path(path)

        doc._undeclare_field(field_name)
        _delete_field_doc(field_docs, field_name)

    @classmethod
    def _get_field(cls, path, allow_missing=False, check_default=False):
        chunks = path.split(".")
        field_name = chunks[-1]
        doc = cls

        try:
            for chunk in chunks[:-1]:
                doc = doc._fields[chunk]
                if isinstance(doc, fof.ListField):
                    doc = doc.field

            field = doc._fields[field_name]
        except Exception:
            field, doc = None, None
            if not allow_missing:
                raise

        if not check_default:
            return field

        if doc is None:
            return field, None

        is_default = field_name in doc._get_default_fields()

        return field, is_default

    @classmethod
    def _get_field_doc(cls, path, allow_missing=False):
        chunks = path.split(".")
        field_docs = cls._dataset._doc[cls._fields_attr()]

        field_doc = None
        for chunk in chunks:
            found = False
            for _field_doc in field_docs:
                if _field_doc.name == chunk:
                    field_doc = _field_doc
                    field_docs = _field_doc.fields
                    found = True
                    break

            if not found:
                if not allow_missing:
                    raise ValueError(
                        "%s field '%s' does not exist"
                        % (cls._doc_name(), path)
                    )

                return None

        return field_doc

    @classmethod
    def _parse_path(cls, path, allow_missing=False):
        chunks = path.split(".")
        field_name = chunks[-1]
        doc = cls
        field_docs = cls._dataset._doc[cls._fields_attr()]

        root = None
        for chunk in chunks[:-1]:
            if root is None:
                root = chunk
            else:
                root += "." + chunk

            found = False
            for field_doc in field_docs:
                if field_doc.name == chunk:
                    field_docs = field_doc.fields
                    found = True
                    break

            if not found:
                if allow_missing:
                    return None, None, None

                raise ValueError(
                    "Invalid %s field '%s'; field '%s' does not exist"
                    % (cls._doc_name().lower(), path, root)
                )

            doc = doc._fields[chunk]

            if isinstance(doc, fof.ListField):
                doc = doc.field

            if not isinstance(doc, fof.EmbeddedDocumentField):
                if allow_missing:
                    return None, None, None

                raise ValueError(
                    "Invalid %s field '%s'; field '%s' is a %s, not an %s"
                    % (
                        cls._doc_name().lower(),
                        path,
                        root,
                        type(doc),
                        fof.EmbeddedDocumentField,
                    )
                )

        return field_name, doc, field_docs

    @classmethod
    def _declare_field(cls, dataset, path, field_or_doc):
        if cls._is_frames_doc:
            path = "frames." + path

        if isinstance(field_or_doc, SampleFieldDocument):
            field = field_or_doc.to_field()
        else:
            field = field_or_doc

        field_name = field.name

        # pylint: disable=no-member
        prev = cls._fields.pop(field_name, None)

        if prev is None:
            cls._fields_ordered += (field_name,)
        else:
            prev._set_dataset(None, None)
            field.required = prev.required
            field.null = prev.null

        field._set_dataset(dataset, path)
        cls._fields[field_name] = field

        setattr(cls, field_name, field)

    @classmethod
    def _update_field(cls, dataset, field_name, new_path, field):
        if cls._is_frames_doc:
            new_path = "frames." + new_path

        new_field_name = field.name

        cls._fields_ordered = tuple(
            (fn if fn != field_name else new_field_name)
            for fn in cls._fields_ordered
        )

        prev = cls._fields.pop(field_name, None)
        delattr(cls, field_name)

        if prev is not None:
            prev._set_dataset(None, None)

        field._set_dataset(dataset, new_path)
        cls._fields[new_field_name] = field
        setattr(cls, new_field_name, field)

    @classmethod
    def _undeclare_field(cls, field_name):
        # pylint: disable=no-member
        prev = cls._fields.pop(field_name, None)

        if prev is not None:
            prev._set_dataset(None, None)

        cls._fields_ordered = tuple(
            fn for fn in cls._fields_ordered if fn != field_name
        )

        delattr(cls, field_name)

    def _update(self, object_id, update_doc, filtered_fields=None, **kwargs):
        """Updates an existing document.

        Helper method; should only be used inside
        :meth:`DatasetSampleDocument.save`.
        """
        updated_existing = True

        collection = self._get_collection()

        select_dict = {"_id": object_id}

        extra_updates = self._extract_extra_updates(
            update_doc, filtered_fields
        )

        if update_doc:
            result = collection.update_one(
                select_dict, update_doc, upsert=True
            ).raw_result
            if result is not None:
                updated_existing = result.get("updatedExisting")

        for update, element_id in extra_updates:
            result = collection.update_one(
                select_dict,
                update,
                array_filters=[{"element._id": element_id}],
                upsert=True,
            ).raw_result

            if result is not None:
                updated_existing = updated_existing and result.get(
                    "updatedExisting"
                )

        return updated_existing

    def _extract_extra_updates(self, update_doc, filtered_fields):
        """Extracts updates for filtered list fields that need to be updated
        by ID, not relative position (index).
        """
        extra_updates = []

        #
        # Check for illegal modifications
        # Match the list, or an indexed item in the list, but not a field
        # of an indexed item of the list:
        #   my_detections.detections          <- MATCH
        #   my_detections.detections.1        <- MATCH
        #   my_detections.detections.1.label  <- NO MATCH
        #
        if filtered_fields:
            for d in update_doc.values():
                for k in d.keys():
                    for ff in filtered_fields:
                        if k.startswith(ff) and not k[len(ff) :].lstrip(
                            "."
                        ).count("."):
                            raise ValueError(
                                "Modifying root of filtered list field '%s' "
                                "is not allowed" % k
                            )

        if filtered_fields and "$set" in update_doc:
            d = update_doc["$set"]
            del_keys = []

            for k, v in d.items():
                filtered_field = None
                for ff in filtered_fields:
                    if k.startswith(ff):
                        filtered_field = ff
                        break

                if filtered_field:
                    element_id, el_filter = self._parse_id_and_array_filter(
                        k, filtered_field
                    )
                    extra_updates.append(
                        ({"$set": {el_filter: v}}, element_id)
                    )

                    del_keys.append(k)

            for k in del_keys:
                del d[k]

            if not update_doc["$set"]:
                del update_doc["$set"]

        return extra_updates

    def _parse_id_and_array_filter(self, list_element_field, filtered_field):
        """Converts the ``list_element_field`` and ``filtered_field`` to an
        element object ID and array filter.

        Example::

            Input:
                list_element_field = "test_dets.detections.1.label"
                filtered_field = "test_dets.detections"

            Output:
                ObjectId("5f2062bf27c024654f5286a0")
                "test_dets.detections.$[element].label"
        """
        el = self
        for field_name in filtered_field.split("."):
            el = el[field_name]

        el_fields = (
            list_element_field[len(filtered_field) :].lstrip(".").split(".")
        )
        idx = int(el_fields.pop(0))

        el = el[idx]
        el_filter = ".".join([filtered_field, "$[element]"] + el_fields)

        return el._id, el_filter


class NoDatasetMixin(object):
    """Mixin for :class:`fiftyone.core.odm.document.SerializableDocument`
    subtypes that are not backed by a dataset.
    """

    # Subtypes must declare this
    _is_frames_doc = None

    def __getattr__(self, name):
        return self.get_field(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super().__setattr__(name, value)
        else:
            self.set_field(name, value)

    def _get_field_names(self, include_private=False, use_db_fields=False):
        field_names = tuple(self._data.keys())

        if not include_private:
            field_names = tuple(
                f for f in field_names if not f.startswith("_")
            )

        if use_db_fields:
            field_names = self._to_db_fields(field_names)

        return field_names

    def _to_db_fields(self, field_names):
        db_fields = []

        for field_name in field_names:
            if field_name == "id":
                db_fields.append("_id")
            elif isinstance(
                self._data.get(field_name, None), ObjectId
            ) and not field_name.startswith("_"):
                db_fields.append("_" + field_name)
            else:
                db_fields.append(field_name)

        return tuple(db_fields)

    def _get_repr_fields(self):
        return self.field_names

    @classmethod
    def _doc_name(cls):
        return "Frame" if cls._is_frames_doc else "Sample"

    @property
    def field_names(self):
        return self._get_field_names(include_private=False)

    @property
    def in_db(self):
        return False

    @staticmethod
    def _get_default(field):
        if field.null:
            return None

        if field.default is not None:
            value = field.default

            if callable(value):
                value = value()

            if isinstance(value, list) and value.__class__ != list:
                value = list(value)
            elif isinstance(value, tuple) and value.__class__ != tuple:
                value = tuple(value)
            elif isinstance(value, dict) and value.__class__ != dict:
                value = dict(value)

            return value

        raise ValueError("Field '%s' has no default" % field)

    def has_field(self, field_name):
        try:
            return field_name in self._data
        except AttributeError:
            # If `_data` is not initialized
            return False

    def get_field(self, field_name):
        try:
            return self._data[field_name]
        except KeyError:
            raise AttributeError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

    def set_field(
        self,
        field_name,
        value,
        create=True,
        validate=True,
        dynamic=False,
    ):
        if not create and not self.has_field(field_name):
            raise ValueError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        validate_field_name(field_name)
        self._data[field_name] = value

    def clear_field(self, field_name):
        if field_name in self.default_fields:
            default_value = self._get_default(self.default_fields[field_name])
            self.set_field(field_name, default_value, create=False)
            return

        if not self.has_field(field_name):
            raise ValueError(
                "%s has no field '%s'" % (self._doc_name(), field_name)
            )

        self._data.pop(field_name)

    def to_dict(self, extended=False):
        d = {}
        for k, v in self._data.items():
            # Store ObjectIds in private fields in the DB
            if k == "id":
                k = "_id"
            elif isinstance(v, ObjectId) and not k.startswith("_"):
                k = "_" + k

            d[k] = serialize_value(v, extended=extended)

        return d

    @classmethod
    def from_dict(cls, d, extended=False):
        kwargs = {}
        for k, v in d.items():
            v = deserialize_value(v)

            if k == "_id":
                k = "id"
            elif isinstance(v, ObjectId) and k.startswith("_"):
                k = k[1:]

            kwargs[k] = v

        return cls(**kwargs)

    def save(self):
        pass

    def _save(self, deferred=False):
        pass

    def reload(self):
        pass

    def delete(self):
        pass


def _get_db_field(field, path):
    if field.db_field is None:
        return path.rsplit(".", 1)[-1]

    # This is hacky, but we must account for the fact that ObjectIdField often
    # uses db_field = "_<field_name>"
    if field.db_field == "_" + field.name:
        chunks = path.rsplit(".", 1)
        chunks[-1] = "_" + chunks[-1]
        return ".".join(chunks)

    return path


def _parse_paths(path, new_path):
    root, _ = _split_path(path)
    new_root, new_field_name = _split_path(new_path)
    same_root = root == new_root
    return same_root, new_field_name


def _split_path(path):
    chunks = path.rsplit(".", 1)
    if len(chunks) == 1:
        return None, path

    return chunks[0], chunks[1]


def _add_field_doc(field_docs, field_or_doc):
    # This is intentionally implemented to modify ``field_docs`` in place
    if isinstance(field_or_doc, fof.Field):
        new_field_doc = SampleFieldDocument.from_field(field_or_doc)
    else:
        new_field_doc = field_or_doc

    for i, field_doc in enumerate(field_docs):
        if field_doc.name == new_field_doc.name:
            field_docs[i] = new_field_doc
            return

    field_docs.append(new_field_doc)


def _update_field_doc(field_docs, field_name, field):
    for field_doc in field_docs:
        if field_doc.name == field_name:
            field_doc.name = field.name
            field_doc.db_field = field.db_field


def _delete_field_doc(field_docs, field_name):
    # This is intentionally implemented to modify ``field_docs`` in place
    for i, field_doc in enumerate(field_docs):
        if field_doc.name == field_name:
            del field_docs[i]
            break
