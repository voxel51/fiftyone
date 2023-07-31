"""
Base classes for documents that back dataset contents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import json

from bson import json_util, ObjectId
import mongoengine
from pymongo import InsertOne, UpdateOne

import eta.core.serial as etas

import fiftyone.core.utils as fou

from .utils import serialize_value, deserialize_value


class SerializableDocument(object):
    """Mixin for documents that can be serialized in BSON or JSON format."""

    def __str__(self):
        return self.__repr__()

    def __repr__(self):
        return self.fancy_repr()

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        return self.to_dict() == other.to_dict()

    @property
    def field_names(self):
        """An ordered tuple of the public fields of this document."""
        raise NotImplementedError("Subclass must implement field_names")

    def fancy_repr(
        self,
        class_name=None,
        select_fields=None,
        exclude_fields=None,
        **kwargs,
    ):
        """Generates a customizable string representation of the document.

        Args:
            class_name (None): optional class name to use
            select_fields (None): iterable of field names to restrict to
            exclude_fields (None): iterable of field names to exclude
            **kwargs: additional key-value pairs to include in the string
                representation

        Returns:
            a string representation of the document
        """
        d = {}
        for f in self._get_repr_fields():
            if (select_fields is not None and f not in select_fields) or (
                exclude_fields is not None and f in exclude_fields
            ):
                continue

            if not f.startswith("_"):
                value = getattr(self, f)
                if isinstance(value, ObjectId):
                    d[f] = str(value)
                else:
                    d[f] = value

        d.update(kwargs)

        doc_name = class_name or self.__class__.__name__
        doc_str = fou.pformat(d)
        return "<%s: %s>" % (doc_name, doc_str)

    def has_field(self, field_name):
        """Determines whether the document has a field of the given name.

        Args:
            field_name: the field name

        Returns:
            True/False
        """
        raise NotImplementedError("Subclass must implement has_field()")

    def get_field(self, field_name):
        """Gets the field of the document.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement get_field()")

    def set_field(self, field_name, value, create=True):
        """Sets the value of a field of the document.

        Args:
            field_name: the field name
            value: the field value
            create (True): whether to create the field if it does not exist

        Raises:
            ValueError: if ``field_name`` is not an allowed field name or does
                not exist and ``create == False``
        """
        raise NotImplementedError("Subclass must implement set_field()")

    def clear_field(self, field_name):
        """Clears the field from the document.

        Args:
            field_name: the field name

        Raises:
            ValueError: if the field does not exist
        """
        raise NotImplementedError("Subclass must implement clear_field()")

    def iter_fields(self):
        """Returns an iterator over the ``(name, value)`` pairs of the
        public fields of the document.

        Returns:
            an iterator that emits ``(name, value)`` tuples
        """
        for field_name in self.field_names:
            yield field_name, self.get_field(field_name)

    def _get_field_names(self, include_private=False, use_db_fields=False):
        """Returns an ordered tuple of field names of this document.

        Args:
            include_private (False): whether to include private fields
            use_db_fields (False): whether to return database fields

        Returns:
            a tuple of field names
        """
        raise NotImplementedError("Subclass must implement _get_field_names()")

    def _get_repr_fields(self):
        """Returns an ordered tuple of field names that should be included in
        the ``repr`` of the document.

        Returns:
            a tuple of field names
        """
        raise NotImplementedError("Subclass must implement _get_repr_fields()")

    def copy(self):
        """Returns a deep copy of the document.

        Returns:
            a :class:`SerializableDocument`
        """
        return deepcopy(self)

    def merge(self, doc, merge_lists=True, merge_dicts=True, overwrite=True):
        """Merges the contents of the given document into this document.

        Args:
            doc: a :class:`SerializableDocument` of same type as this document
            merge_lists (True): whether to merge the elements of top-level list
                fields rather than treating the list as a single value
            merge_dicts (True): whether to recursively merge the contents of
                top-level dict fields rather than treating the dict as a single
                value
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields
        """
        if not isinstance(doc, type(self)):
            raise ValueError(
                "Cannot merge %s into %s" % (type(doc), type(self))
            )

        if not overwrite:
            existing_field_names = set(self.field_names)

        for field, value in doc.iter_fields():
            try:
                curr_value = self.get_field(field)
            except AttributeError:
                curr_value = None

            if (
                merge_lists
                and isinstance(curr_value, list)
                and isinstance(value, list)
            ):
                _merge_lists(curr_value, value, overwrite=overwrite)
                continue

            if (
                merge_dicts
                and isinstance(curr_value, dict)
                and isinstance(value, dict)
            ):
                _merge_dicts(curr_value, value, overwrite=overwrite)
                continue

            if (
                not overwrite
                and field in existing_field_names
                and curr_value is not None
            ):
                continue

            self.set_field(field, value)

    def to_dict(self, extended=False):
        """Serializes this document to a BSON/JSON dictionary.

        Args:
            extended (False): whether to serialize extended JSON constructs
                such as ObjectIDs, Binary, etc. into JSON format

        Returns:
            a dict
        """
        raise NotImplementedError("Subclass must implement to_dict()")

    @classmethod
    def from_dict(cls, d, extended=False):
        """Loads the document from a BSON/JSON dictionary.

        Args:
            d: a dictionary
            extended (False): whether the input dictionary may contain
                serialized extended JSON constructs

        Returns:
            a :class:`SerializableDocument`
        """
        raise NotImplementedError("Subclass must implement from_dict()")

    def to_json(self, pretty_print=False):
        """Serializes the document to a JSON string.

        Args:
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        if not pretty_print:
            return json_util.dumps(self.to_dict())

        d = self.to_dict(extended=True)
        return etas.json_to_str(d, pretty_print=pretty_print)

    @classmethod
    def from_json(cls, s):
        """Loads the document from a JSON string.

        Returns:
            a :class:`SerializableDocument`
        """
        d = json_util.loads(s)
        return cls.from_dict(d, extended=False)


class MongoEngineBaseDocument(SerializableDocument):
    """Mixin for all :class:`mongoengine:mongoengine.base.BaseDocument`
    subclasses that implements the :class:`SerializableDocument` interface.
    """

    def __delattr__(self, name):
        self.clear_field(name)

    def __delitem__(self, name):
        self.clear_field(name)

    def __deepcopy__(self, memo):
        # pylint: disable=no-member, unsubscriptable-object
        kwargs = {
            f: deepcopy(self.get_field(f), memo)
            for f in self._fields_ordered
            if f not in ("_cls", "_id", "id")
        }
        return self.__class__(**kwargs)

    @property
    def field_names(self):
        return self._get_field_names(include_private=False)

    def has_field(self, field_name):
        try:
            _ = self._get_field(field_name)
            return True
        except (KeyError, AttributeError):
            return False

    def get_field(self, field_name):
        chunks = field_name.split(".", 1)
        if len(chunks) > 1:
            value = getattr(self, chunks[0])
            if value is not None:
                return value.get_field(chunks[1])

            if self.has_field(field_name):
                return None

            raise AttributeError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

        return getattr(self, field_name)

    def _get_field(self, field_name):
        # pylint: disable=no-member
        chunks = field_name.split(".", 1)
        if len(chunks) > 1:
            field = self._fields.get(chunks[0], None)
            if field is not None:
                field = field.get_field(chunks[1])
        else:
            field = self._fields.get(field_name, None)

        if field is None:
            raise AttributeError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

        return field

    def set_field(self, field_name, value, create=True):
        chunks = field_name.split(".", 1)
        if len(chunks) > 1:
            doc = self.get_field(chunks[0])
            return doc.set_field(chunks[1], value, create=create)

        if not create and not self.has_field(field_name):
            raise ValueError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

        setattr(self, field_name, value)

    def clear_field(self, field_name):
        chunks = field_name.split(".", 1)
        if len(chunks) > 1:
            value = self.get_field(chunks[0])
            if value is not None:
                return value.clear_field(chunks[1])

            if self.has_field(field_name):
                return

            raise AttributeError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

        super().__delattr__(field_name)

        # pylint: disable=no-member,attribute-defined-outside-init
        if field_name not in self.__class__._fields_ordered:
            self._fields_ordered = tuple(
                f for f in self._fields_ordered if f != field_name
            )

    def field_to_mongo(self, field_name):
        value = self.get_field(field_name)
        return self._get_field(field_name).to_mongo(value)

    def field_to_python(self, field_name, value):
        return self._get_field(field_name).to_python(value)

    def _get_field_names(self, include_private=False, use_db_fields=False):
        field_names = self._fields_ordered

        if not include_private:
            field_names = tuple(
                f for f in field_names if not f.startswith("_")
            )

        if use_db_fields:
            field_names = self._to_db_fields(field_names)

        return field_names

    def _to_db_fields(self, field_names):
        db_fields = []

        # pylint: disable=no-member
        for field_name in field_names:
            if field_name == "id":
                db_fields.append("_id")
            else:
                field = self._fields.get(field_name, None)
                if field is None:
                    value = self.get_field(field_name)
                    if isinstance(
                        value, ObjectId
                    ) and not field_name.startswith("_"):
                        db_fields.append("_" + field_name)
                    else:
                        db_fields.append(field_name)
                else:
                    db_fields.append(field.db_field or field_name)

        return tuple(db_fields)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered

    def to_dict(self, extended=False):
        # pylint: disable=no-member
        d = self.to_mongo(use_db_field=True)

        if not extended:
            return d

        # @todo can we optimize this?
        return json.loads(json_util.dumps(d))

    @classmethod
    def from_dict(cls, d, extended=False):
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form

                # pylint: disable=no-member
                return cls._from_son(d)
            except Exception:
                pass

        # Construct any necessary extended JSON components like ObjectIds
        # @todo can we optimize this?
        d = json_util.loads(json_util.dumps(d))

        # pylint: disable=no-member
        return cls._from_son(d)


class DynamicMixin(object):
    """Mixin for :class:`MongoEngineBaseDocument` classes that can have
    arbitrary dynamic fields added to them.
    """

    def to_mongo(self, *args, **kwargs):
        # pylint: disable=no-member
        d = super().to_mongo(*args, **kwargs)

        #
        # We must manually serialize dynamic fields because MongoEngine doesn't
        # have a `Field` instance to serialize them for us
        #

        rename = {}

        for k, v in d.items():
            # pylint: disable=no-member
            if k not in self._fields:
                # We store ObjectIds in private fields in the DB
                if (
                    isinstance(v, ObjectId)
                    and k != "id"
                    and not k.startswith("_")
                ):
                    rename[k] = "_" + k

                d[k] = serialize_value(v)

        for old, new in rename.items():
            d[new] = d.pop(old)

        return d

    @classmethod
    def _from_son(cls, d, *args, **kwargs):
        #
        # We must manually deserialize dynamic fields because MongoEngine
        # doesn't have a `Field` instance to deserialize them for us
        #

        rename = {}

        for k, v in d.items():
            # pylint: disable=no-member
            if k not in cls._fields:
                v = deserialize_value(v)
                d[k] = v

                # We store ObjectIds in private fields in the DB
                if (
                    isinstance(v, ObjectId)
                    and k != "_id"
                    and k.startswith("_")
                ):
                    rename[k] = k[1:]

        for old, new in rename.items():
            d[new] = d.pop(old)

        # pylint: disable=no-member
        return super()._from_son(d, *args, **kwargs)


class BaseDocument(MongoEngineBaseDocument):
    """Base class for documents that are written to the database in their own
    collections.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    def __eq__(self, other):
        # pylint: disable=no-member
        if self.id != other.id:
            return False

        return super().__eq__(other)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered

    @property
    def in_db(self):
        """Whether the document has been inserted into the database."""
        # pylint: disable=no-member
        return self.id is not None


class DynamicDocument(DynamicMixin, BaseDocument, mongoengine.DynamicDocument):
    """Base class for dynamic documents that are stored in a MongoDB
    collection.

    Dynamic documents can have arbitrary fields added to them.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    meta = {"abstract": True}


class Document(BaseDocument, mongoengine.Document):
    """Base class for documents that are stored in a MongoDB collection.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    meta = {"abstract": True}

    @classmethod
    def _doc_name(cls):
        return "Document"

    def reload(self, *fields, **kwargs):
        """Reloads the document from the database.

        Args:
            *fields: an optional args list of specific fields to reload
        """
        super().reload(*fields, **kwargs)

    def save(
        self,
        upsert=False,
        validate=True,
        clean=True,
        safe=False,
        **kwargs,
    ):
        """Saves the document to the database.

        If the document already exists, it will be updated, otherwise it will
        be created.

        Args:
            upsert (False): whether to insert the document if it has an ``id``
                populated but no document with that ID exists in the database
            validate (True): whether to validate the document
            clean (True): whether to call the document's ``clean()`` method.
                Only applicable when ``validate`` is True
            safe (False): whether to ``reload()`` the document before raising
                any errors

        Returns:
            self
        """
        try:
            self._save(
                deferred=False,
                upsert=upsert,
                validate=validate,
                clean=clean,
                **kwargs,
            )
        except:
            if safe:
                self.reload()

            raise

        return self

    def _save(
        self,
        deferred=False,
        upsert=False,
        validate=True,
        clean=True,
        **kwargs,
    ):
        # pylint: disable=no-member
        if self._meta.get("abstract"):
            raise mongoengine.InvalidDocumentError(
                "Cannot save an abstract document"
            )

        if self._meta.get("auto_create_index", True):
            self.ensure_indexes()

        if validate:
            self.validate(clean=clean)

        id_field = self._meta["id_field"]

        created = self._created
        if not created:
            created = "_id" not in self.to_mongo(fields=[id_field])

        doc = self.to_mongo()
        _id = doc.get("_id", None)

        ops = None

        if created:
            # Save new document
            if _id is None:
                _id = ObjectId()
                doc["_id"] = _id

            if deferred:
                ops = [InsertOne(doc)]
            else:
                self._get_collection().insert_one(doc)
        else:
            # Update existing document
            updates = {}
            sets, unsets = self._delta()

            if sets:
                updates["$set"] = sets

            if unsets:
                updates["$unset"] = unsets

            if updates:
                ops, updated_existing = self._update(
                    _id, updates, deferred=deferred, upsert=upsert, **kwargs
                )

                if not deferred and not upsert and not updated_existing:
                    raise ValueError(
                        "Failed to update %s with ID '%s'"
                        % (self._doc_name().lower(), str(_id))
                    )

        # Make sure we store the PK on this document now that it's saved
        if created or id_field not in self._meta.get("shard_key", []):
            self[id_field] = self._fields[id_field].to_python(_id)

        self._clear_changed_fields()
        self._created = False

        return ops

    def _update(self, _id, updates, deferred=False, upsert=False, **kwargs):
        """Updates an existing document."""
        if deferred:
            ops = self._deferred_updates(_id, updates, upsert)
            updated_existing = None
        else:
            ops = None
            updated_existing = self._do_updates(_id, updates, upsert)

        return ops, updated_existing

    def _do_updates(self, _id, updates, upsert):
        updated_existing = True

        result = (
            self._get_collection()
            .update_one({"_id": _id}, updates, upsert=upsert)
            .raw_result
        )

        if result is not None:
            updated_existing = result.get("updatedExisting", None)

        return updated_existing

    def _deferred_updates(self, _id, updates, upsert):
        op = UpdateOne({"_id": _id}, updates, upsert=upsert)
        return [op]


def _merge_lists(dst, src, overwrite=False):
    dst.extend(v for v in src if v not in dst)


def _merge_dicts(dst, src, overwrite=False):
    for k, v in src.items():
        if k not in dst:
            dst[k] = v
        else:
            c = dst[k]
            if isinstance(c, dict) and isinstance(v, dict):
                _merge_dicts(c, v, overwrite=overwrite)
            elif overwrite or dst.get(k, None) is None:
                dst[k] = v
