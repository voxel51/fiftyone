"""
Defines the shared state between the FiftyOne App and SDK.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import logging

from bson import json_util

import eta.core.serial as etas

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.stages as fos
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


class StateDescription(etas.Serializable):
    """Class that describes the shared state between the FiftyOne App and
    a corresponding :class:`fiftyone.core.session.Session`.

    Attributes:
        dataset: the current :class:`fiftyone.core.session.Session`
        selected: the list of currently selected samples
        view: the current :class:`fiftyone.core.view.DatasetView`

    Args:
        close (False): whether to close the app
        connected (False): whether the session is connected to an app
        dataset (None): the current :class:`fiftyone.core.dataset.Dataset`
        selected (None): the list of currently selected samples
        view (None): the current :class:`fiftyone.core.view.DatasetView`
    """

    def __init__(
        self,
        close=False,
        connected=False,
        dataset=None,
        selected=None,
        view=None,
    ):
        self.close = close
        self.connect = connected
        self.dataset = dataset
        self.view = view
        self.selected = selected or []
        self.count = (
            len(view)
            if view is not None
            else len(dataset)
            if dataset is not None
            else 0
        )
        super().__init__()

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a :class:`StateDescription` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            :class:`StateDescription`
        """
        close = d.get("close", False)
        connected = d.get("connected", False)

        dataset = d.get("dataset", None)
        if dataset is not None:
            dataset = fod.load_dataset(dataset.get("name"))

        view_ = d.get("view", None)
        view = None
        if dataset is not None:
            view = fov.DatasetView(dataset)
            if view_ is not None:
                view._stages = [
                    fos.ViewStage._from_dict(s)
                    for s in json_util.loads(view_["view"])
                ]

        selected = d.get("selected", [])

        return cls(
            close=close,
            connected=connected,
            dataset=dataset,
            selected=selected,
            view=view,
            **kwargs
        )


class StateDescriptionWithDerivables(StateDescription):
    """This class extends :class:`StateDescription` to include information that
    does not define the state but needs to be fetched/computed and passed to
    the frontend application, such as derived statistics (number of sample
    occurrences with a given tag, etc.)

    The python process should only ever see instances of
    :class:`StateDescription` and the app should only ever see instances of
    :class:`StateDescriptionWithDerivables` with the server acting as the
    broker.
    """

    def __init__(self, derivables=None, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if derivables is not None:
            self.derivables = derivables
        else:
            self.derivables = self.get_derivables()

    def get_derivables(self):
        """Computes all "derivable" data that needs to be passed to the app,
        but does not define the state.

        Returns:
            a dictionary with key, value pairs for each piece of derivable
                information.
        """
        return {
            "view_stats": self._get_view_stats(),
            "field_schema": self._get_field_schema(),
            **self._get_label_info(),
        }

    @classmethod
    def from_dict(cls, d, **kwargs):
        kwargs["derivables"] = d.get("derivables", None)
        return super().from_dict(d, **kwargs)

    def _get_view_stats(self):
        if self.view is not None:
            return get_view_stats(self.view)

        if self.dataset is None:
            return {}

        return get_view_stats(self.dataset)

    def _get_field_schema(self):
        if self.dataset is None:
            return {}

        return {
            name: str(field)
            for name, field in self.dataset.get_field_schema().items()
        }

    def _get_label_info(self):
        if self.view is not None:
            view = self.view
        elif self.dataset is not None:
            view = self.dataset.view()
        else:
            return {}

        return {
            "labels": self._get_label_fields(view),
            "tags": list(sorted(view.get_tags())),
        }

    @staticmethod
    def _get_label_fields(view):
        label_fields = []

        # @todo is this necessary?
        label_fields.append({"_id": {"field": "_id"}})

        # @todo can we remove the "_id" nesting?
        for k, v in view.get_field_schema().items():
            d = {"field": k}
            if isinstance(v, fof.EmbeddedDocumentField):
                d["cls"] = v.document_type.__name__

            label_fields.append({"_id": d})

        return sorted(label_fields, key=lambda field: field["_id"]["field"])


def get_view_stats(dataset_or_view):
    """Counts instances of each tag and each field within the samples of a
    view.

    Args:
        dataset_or_view: a :class:`fiftyone.core.view.DatasetView` or
            :class:`fiftyone.core.dataset.Dataset` instance

    Returns:
        a dictionary with structure:

            {
                'tags': {
                    '<TAG 1>': <COUNT>,
                    '<TAG 2>': <COUNT>,
                    ...
                },
                'custom_fields': {
                    '<FIELD 1>': <COUNT>,
                    '<FIELD 2>': <COUNT>,
                    ...
                }
            }
    """
    if isinstance(dataset_or_view, fod.Dataset):
        view = dataset_or_view.view()
    else:
        view = dataset_or_view

    _sample_doc_cls = type(view.dataset_name, (foo.DatasetSampleDocument,), {})
    num_default_fields = len(_sample_doc_cls.get_field_schema())

    field_schema = view.get_field_schema()
    custom_fields_schema = OrderedDict(
        {
            k: field_schema[k]
            for k in list(field_schema.keys())[num_default_fields:]
        }
    )

    return {
        "tags": {tag: len(view.match_tag(tag)) for tag in view.get_tags()},
        "custom_fields": {
            field_name: _get_field_count(view, field_name, field)
            for field_name, field in custom_fields_schema.items()
        },
    }


def _get_field_count(view, field_name, field):
    if isinstance(field, fof.EmbeddedDocumentField):
        if issubclass(field.document_type, fol.Classifications):
            array_field = "$%s.classifications" % field_name
        elif issubclass(field.document_type, fol.Detections):
            array_field = "$%s.detections" % field_name
        else:
            array_field = None

        if array_field:
            # sum of lengths of arrays for each document
            pipeline = [
                {
                    "$group": {
                        "_id": None,
                        "totalCount": {
                            "$sum": {
                                "$cond": {
                                    "if": {"$isArray": array_field},
                                    "then": {"$size": array_field},
                                    "else": 0,
                                }
                            }
                        },
                    }
                }
            ]

            return next(view.aggregate(pipeline))["totalCount"]

    return len(view.exists(field_name))
