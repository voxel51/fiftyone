"""

"""
import json
import os
import six
import warnings

from bson import json_util

from mongoengine import *

from mongoengine.fields import BaseField


class ODMDocument(Document):
    meta = {"abstract": True}

    def __str__(self):
        return str(
            json.dumps(
                self.to_dict(extended=True),
                separators=(",", ": "),
                ensure_ascii=False,
                indent=4,
            )
        )

    @property
    def ID(self):
        """The ID of the document.

        Implementation details:

            - the ID of a document is automatically populated when it is added
              to the database

            - the ID is of a document is ``None`` if it has not been added to
              the database

            - the ID is a 12 byte value consisting of the concatentation of the
              following:

                - a 4 byte timestamp representing the document's commit time,
                  measured in seconds since epoch

                - a 5 byte random value

                - a 3 byte incrementing counter, initialized to a random value
        """
        # @todo(Tyler) This is just here for documentation ATM. Very
        #   frustrating that `id` is an attribute, not a property...
        return self.id

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self.id.generation_time if self._in_db else None

    def to_dict(self, extended=False):
        """Serializes this document to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        if extended:
            return json.loads(self.to_json())

        return json_util.loads(self.to_json())

    @classmethod
    def from_dict(cls, d, created=False, extended=False):
        """Loads the document from a JSON dictionary.

        Args:
            d: a JSON dictionary
            created (False): whether to consider the newly instantiated
                document as brand new or as persisted already. The following
                cases exist:

                    * If ``True``, consider the document as brand new, no
                      matter what data it is loaded with (i.e., even if an ID
                      is loaded)

                    * If ``False`` and an ID is NOT provided, consider the
                      document as brand new

                    * If ``False`` and an ID is provided, assume that the
                      object has already been persisted (this has an impact on
                      the subsequent call to ``.save()``)

            extended (False): if ``False``, ObjectIDs, Datetimes, etc. are
                expected to already be loaded

        Returns:
            a :class:`ODMDocument`
        """
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form
                return cls._from_son(d, created=created)
            except Exception:
                pass

        return cls.from_json(json_util.dumps(d), created=created)

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return self.id is not None


class ODMDataset(ODMDocument):
    """Abstract ODMDataset class that all
    :class:`fiftyone.core.dataset.Dataset._Doc` classes inherit from.
    Instances of the subclasses are samples. I.e.:

        sample = dataset._Doc(...)

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.
    """

    meta = {"abstract": True}

    # the path to the data on disk
    filepath = StringField()
    # the set of tags associated with the sample
    tags = ListField(StringField())
    # @todo(Tyler) metadata should be something structured
    metadata = DictField()

    @classmethod
    def get_sample_fields(cls, field_type=None):
        exclude_fields = ["_cls"]
        # exclude_fields = ["_cls", "dataset", "id"]

        try:
            if not issubclass(field_type, BaseField):
                field_type = BaseField
        except Exception:
            field_type = BaseField

        field_names = [
            fn
            for fn in dir(cls)
            if isinstance(getattr(cls, fn), field_type)
            and fn not in exclude_fields
        ]

        fields = {fn: type(getattr(cls, fn)) for fn in field_names}

        return fields

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        # @todo(Tyler) maybe get rid of this?
        raise NotImplementedError("TODO")

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            return super(ODMDataset, self).__setattr__(name, value)

        cls = type(self)
        if hasattr(cls, name):
            if value is not None:
                getattr(cls, name).validate(value)
            result = super(ODMDataset, self).__setattr__(name, value)
            if name not in ["_cls", "id"] and isinstance(
                getattr(cls, name), BaseField
            ):
                self.save()
            return result

        warnings.warn(
            "Pandas doesn't allow columns to be "
            "created via a new attribute name - see "
            "https://pandas.pydata.org/pandas-docs/"
            "stable/indexing.html#attribute-access",
            stacklevel=2,
        )
        result = super(ODMDataset, self).__setattr__(name, value)
        if name not in ["_cls", "id"] and isinstance(
            getattr(cls, name), BaseField
        ):
            self.save()
        return result

    def __getitem__(self, key):
        if hasattr(self, key):
            return self.__getattribute__(key)
        return super(ODMDataset, self).__getitem__(key)

    def __setitem__(self, key, value):
        if key.startswith("_"):
            raise KeyError("Invalid key: '%s'. Key canot start with '_'" % key)

        if not hasattr(self, key):
            if isinstance(value, BaseField):
                field = type(value)()
            elif isinstance(value, bool):
                field = BooleanField()
            elif isinstance(value, six.integer_types):
                field = IntField()
            elif isinstance(value, six.string_types):
                field = StringField()
            elif isinstance(value, list) or isinstance(value, tuple):
                field = ListField()
            elif isinstance(value, dict):
                field = DictField()
            else:
                raise TypeError(
                    "Invalid type: '%s' could not be cast to Field"
                    % type(value)
                )

            setattr(type(self), key, field)

        return self.__setattr__(key, value)
