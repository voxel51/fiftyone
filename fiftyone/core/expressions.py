"""
Expressions for :class:`fiftyone.core.stages.ViewStage` definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import date, datetime, timedelta
import re
import warnings

import bson
import numpy as np

import eta.core.utils as etau

from fiftyone.core.odm.document import MongoEngineBaseDocument
import fiftyone.core.utils as fou


def to_mongo(expr, prefix=None):
    """Converts an expression to its MongoDB representation.

    Args:
        expr: a :class:`ViewExpression` or an already serialized
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
        prefix (None): an optional prefix to prepend to all :class:`ViewField`
            instances in the expression

    Returns:
        a MongoDB expression
    """
    if isinstance(expr, ViewExpression):
        return expr.to_mongo(prefix=prefix)

    if isinstance(expr, dict):
        return {
            to_mongo(k, prefix=prefix): to_mongo(v, prefix=prefix)
            for k, v in expr.items()
        }

    if isinstance(expr, (list, tuple)):
        return [to_mongo(e, prefix=prefix) for e in expr]

    return expr


def is_frames_expr(expr):
    """Determines whether the given expression involves a ``"frames"`` field.

    Args:
        expr: a :class:`ViewExpression` or an already serialized
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_

    Returns:
        True/False
    """
    if isinstance(expr, ViewExpression):
        expr = expr.to_mongo()

    if etau.is_str(expr):
        return (
            expr == "$frames"
            or expr.startswith("$frames.")
            or expr.startswith("$frames[].")
        )

    if isinstance(expr, dict):
        for k, v in expr.items():
            if is_frames_expr(k):
                return True

            if is_frames_expr(v):
                return True

    if etau.is_container(expr):
        for e in expr:
            if is_frames_expr(e):
                return True

    return False


def get_group_slices(expr):
    """Extracts the group slices from the given expression, if any.

    Args:
        expr: a :class:`ViewExpression` or an already serialized
            `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_

    Returns:
        a (possibly-empty) list of group slices
    """
    if isinstance(expr, ViewExpression):
        expr = expr.to_mongo()

    group_slices = set()
    _do_get_group_slices(expr, group_slices)

    return list(group_slices)


def _do_get_group_slices(expr, group_slices):
    if etau.is_str(expr):
        if expr.startswith("$groups."):
            group_slice = expr.split(".", 2)[1]
            group_slices.add(group_slice)

    if isinstance(expr, dict):
        for k, v in expr.items():
            _do_get_group_slices(k, group_slices)
            _do_get_group_slices(v, group_slices)

    if etau.is_container(expr):
        for e in expr:
            _do_get_group_slices(e, group_slices)


class ViewExpression(object):
    """An expression defining a possibly-complex manipulation of a document.

    View expressions enable you to specify manipulations of documents that can
    then be executed on your data in the context of a
    :class:`fiftyone.core.stages.ViewStage`.

    Typically, :class:`ViewExpression` instances are built by creating one or
    more :class:`ViewField` instances and then defining the desired operation
    by recursively invoking methods on these objects::

        from fiftyone import ViewField as F

        # An expression that tests whether the `confidence` field of a document
        # is greater than 0.9
        F("confidence") > 0.9

        # An expression that computes the area of a bounding box
        # Bboxes are in [top-left-x, top-left-y, width, height] format
        F("bounding_box")[2] * F("bounding_box")[3]

        #
        # A more complex expression that returns one of three strings based on
        # the number of high confidence predictions in the `detections` field
        # of a document with the label "cat" or "dog" after normalizing to
        # lowercase
        #
        F("detections").map(
            F().set_field("label", F("label").lower())
        ).filter(
            F("label").is_in(("cat", "dog")) & (F("confidence") > 0.9)
        ).length().switch(
            {
                (F() >= 10): "zoo",
                (F() > 2) & (F() < 10): "party",
                (F() <= 2): "home",
            }
        )

    There are a few cases where you may need to instantitate a
    :class:`ViewExpression` directly, typically when you need to write an
    expression that begins with a literal Python value::

        from fiftyone import ViewExpression as E
        from fiftyone import ViewField as F

        # Concatenates the "-animal" string to the `label` field of a document
        F("label").concat("-animal")

        # Prepends the "animal-" string to the `label` field
        E("animal-").concat(F("label"))

        # Appends the strings "test" and "validation" to the contents of the
        # `tags` field array
        # assumed to be an array
        F("tags").extend(["test", "validation"])

        # Prepends the "test" and "validation" strings to the `tags` field
        E(["test", "validation"]).extend(F("tags"))

    See
    `MongoDB expressions <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    for more details about the underlying expression language that this class
    encapsulates.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")

        # Bboxes are in [top-left-x, top-left-y, width, height] format
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        #
        # Create a view that only contains predictions whose bounding boxes
        # have area < 0.2 with confidence > 0.9, and only include samples with
        # at least 15 such objects
        #
        view = dataset.filter_labels(
            "predictions",
            (bbox_area < 0.2) & (F("confidence") > 0.9)
        ).match(
            F("predictions.detections").length() > 15
        )

        session = fo.launch_app(view=view)

    .. automethod:: __eq__
    .. automethod:: __ge__
    .. automethod:: __gt__
    .. automethod:: __le__
    .. automethod:: __lt__
    .. automethod:: __ne__
    .. automethod:: __and__
    .. automethod:: __invert__
    .. automethod:: __or__
    .. automethod:: __abs__
    .. automethod:: __add__
    .. automethod:: __ceil__
    .. automethod:: __floor__
    .. automethod:: __round__
    .. automethod:: __mod__
    .. automethod:: __mul__
    .. automethod:: __pow__
    .. automethod:: __sub__
    .. automethod:: __truediv__
    .. automethod:: __getitem__

    Args:
        expr: the MongoDB expression
    """

    def __init__(self, expr):
        self._expr = expr
        self._prefix = None

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return fou.pformat(self.to_mongo())

    def __hash__(self):
        # Must explicitly define this, since __eq__ is customized
        # https://docs.python.org/3.1/reference/datamodel.html#object.__hash__
        return super().__hash__()

    def __deepcopy__(self, memo):
        obj = self.__class__(deepcopy(self._expr, memo))
        obj._prefix = deepcopy(self._prefix, memo)
        return obj

    def _freeze_prefix(self, prefix):
        _do_freeze_prefix(self, prefix)

    @property
    def is_frozen(self):
        """Whether this expression's prefix is frozen."""
        return self._prefix is not None

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the expression.

        Args:
            prefix (None): an optional prefix to prepend to all
                :class:`ViewField` instances in the expression

        Returns:
            a MongoDB expression
        """
        if self.is_frozen:
            prefix = self._prefix

        return _do_to_mongo(self._expr, prefix)

    def __call__(self, field):
        """Retrieves the specified field or embedded field of this expression,
        which must resolve to a document.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Sort samples alphabetically by the label of their first ground
            # truth object
            view = dataset.sort_by(F("ground_truth.detections")[0]("label"))

            print(view.values(F("ground_truth.detections")[0]("label")))

        Args:
            field: a "field" or "embedded.field.name"

        Returns:
            a :class:`ViewExpression`
        """
        return self.apply(ViewField(field))

    # Comparison operators ####################################################

    def __eq__(self, other):
        """Determines whether this expression is equal to the given value or
        expression, ``self == other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset(
                "cifar10", split="test", max_samples=500, shuffle=True
            )

            # Get samples whose ground truth `label` is "airplane"
            view = dataset.match(F("ground_truth.label") == "airplane")

            print(view.distinct("ground_truth.label"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        if other is None:
            return ~self.exists()

        return ViewExpression({"$eq": [self, other]})

    def __ne__(self, other):
        """Determines whether this expression is not equal to the given value
        or expression, ``self != other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset(
                "cifar10", split="test", max_samples=500, shuffle=True
            )

            # Get samples whose ground truth `label` is NOT "airplane"
            view = dataset.match(F("ground_truth.label") != "airplane")

            print("airplane" in view.distinct("ground_truth.label"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        if other is None:
            return self.exists()

        return ViewExpression({"$ne": [self, other]})

    def __ge__(self, other):
        """Determines whether this expression is greater than or equal to the
        given value or expression, ``self >= other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5
            view = dataset.match(F("uniqueness") >= 0.5)

            print(view.bounds("uniqueness"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gte": [self, other]})

    def __gt__(self, other):
        """Determines whether this expression is greater than the given value
        or expression, ``self >= other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is > 0.5
            view = dataset.match(F("uniqueness") > 0.5)

            print(view.bounds("uniqueness"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gt": [self, other]})

    def __le__(self, other):
        """Determines whether this expression is less than or equal to the
        given value or expression, ``self <= other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is <= 0.5
            view = dataset.match(F("uniqueness") <= 0.5)

            print(view.bounds("uniqueness"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lte": [self, other]})

    def __lt__(self, other):
        """Determines whether this expression is less than the given value or
        expression, ``self <= other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is < 0.5
            view = dataset.match(F("uniqueness") < 0.5)

            print(view.bounds("uniqueness"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lt": [self, other]})

    def exists(self, bool=True):
        """Determines whether this expression, which must resolve to a field,
        exists and is not None.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset(
                "quickstart", dataset_name=fo.get_default_dataset_name()
            )

            # Add a new field to one sample
            sample = dataset.first()
            sample["new_field"] = ["hello", "there"]
            sample.save()

            # Get samples that have a value for `new_field`
            view = dataset.match(F("new_field").exists())

            print(len(view))

        Args:
            bool (True): whether to determine whether this expression exists
                (True) or is None or non-existent (False)

        Returns:
            a :class:`ViewExpression`
        """
        # https://stackoverflow.com/a/25515046
        expr = ViewExpression({"$gt": [self, None]})

        if not bool:
            expr = ~expr

        return expr

    # Logical operators #######################################################

    def __invert__(self):
        """Inverts this expression, ``~self``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add a new field to one sample
            sample = dataset.first()
            sample["new_field"] = ["hello", "there"]
            sample.save()

            # Get samples that do NOT have a value for `new_field`
            view = dataset.match(~F("new_field").exists())

            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$not": self})

    def __and__(self, other):
        """Computes the logical AND of this expression and the given value or
        expression, ``self & other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains predictions with label "cat" and confidence > 0.9
            view = dataset.filter_labels(
                "predictions",
                (F("label") == "cat") & (F("confidence") > 0.9)
            )

            print(view.count_values("predictions.detections.label"))
            print(view.bounds("predictions.detections.confidence"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$and": [self, other]})

    def __rand__(self, other):
        return ViewExpression({"$and": [other, self]})

    def __or__(self, other):
        """Computes the logical OR of this expression and the given value or
        expression, ``self | other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains predictions with label "cat" or confidence > 0.9
            view = dataset.filter_labels(
                "predictions",
                (F("label") == "cat") | (F("confidence") > 0.9)
            )

            print(view.count_values("predictions.detections.label"))
            print(view.bounds("predictions.detections.confidence"))

        Args:
            other: a literal value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$or": [self, other]})

    def __ror__(self, other):
        return ViewExpression({"$or": [other, self]})

    # Numeric expression operators ############################################

    def __abs__(self):
        """Computes the absolute value of this expression, which must resolve
        to a numeric value.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.25, 0.75]
            view = dataset.match(abs(F("uniqueness") - 0.5) < 0.25)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return self.abs()

    def __add__(self, other):
        """Adds the given value to this expression, which must resolve to a
        numeric value, ``self + other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            manhattan_dist = F("bounding_box")[0] + F("bounding_box")[1]

            # Only contains predictions whose bounding boxes' upper left corner
            # is a Manhattan distance of at least 1 from the origin
            dataset.filter_labels("predictions, manhattan_dist > 1)

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$add": [self, other]})

    def __ceil__(self):
        """Computes the ceiling of this expression, which must resolve to a
        numeric value.

        Examples::

            import math

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.5, 1]
            view = dataset.match(math.ceil(F("uniqueness") + 0.5) == 2)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return self.ceil()

    def __floor__(self):
        """Computes the floor of this expression, which must resolve to a
        numeric value.

        Examples::

            import math

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.5, 1]
            view = dataset.match(math.floor(F("uniqueness") + 0.5) == 1)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return self.floor()

    def __round__(self, place=0):
        """Rounds this expression, which must resolve to a numeric value, at
        the given decimal place.

        Positive values of ``place`` will round to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.57

        Negative values of ``place`` will round digits left of the decimal::

            place=-2: 1234.5678 --> 1200

        Args:
            place (0): the decimal place at which to round. Must be an
                integer in range ``(-20, 100)``

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.25, 0.75]
            view = dataset.match(round(2 * F("uniqueness")) == 1)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return self.round(place=place)

    def __mod__(self, other):
        """Computes the modulus of this expression, which must resolve to a
        numeric value, ``self % other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with an even number of predictions
            view = dataset.match(
                (F("predictions.detections").length() % 2) == 0
            )

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$mod": [self, other]})

    def __mul__(self, other):
        """Computes the product of the given value and this expression, which
        must resolve to a numeric value, ``self * other``.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Only contains predictions whose bounding box area is > 0.2
            view = dataset.filter_labels("predictions", bbox_area > 0.2)

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$multiply": [self, other]})

    # pylint: disable=unused-argument
    def __pow__(self, power, modulo=None):
        """Raises this expression, which must resolve to a numeric value, to
        the given power, ``self ** power``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            center_dist = (
                (F("bounding_box")[0] + 0.5 * F("bounding_box")[2] - 0.5) ** 2 +
                (F("bounding_box")[1] + 0.5 * F("bounding_box")[3] - 0.5) ** 2
            ).sqrt()

            # Only contains predictions whose bounding box center is a distance
            # of at most 0.02 from the center of the image
            view = dataset.select_fields("predictions").filter_labels(
                "predictions", center_dist < 0.02
            )

            session = fo.launch_app(view=view)

        Args:
            power: the power

        Returns:
            a :class:`ViewExpression`
        """
        if modulo is not None:
            warnings.warn("Ignoring unsupported `modulo` argument")

        return self.pow(power)

    def __radd__(self, other):
        return ViewExpression({"$add": [other, self]})

    def __rmod__(self, other):
        return ViewExpression({"$mod": [other, self]})

    def __rmul__(self, other):
        return ViewExpression({"$multiply": [other, self]})

    def __rsub__(self, other):
        return ViewExpression({"$subtract": [other, self]})

    def __rtruediv__(self, other):
        return ViewExpression({"$divide": [other, self]})

    def __sub__(self, other):
        """Subtracts the given value from this expression, which must resolve
        to a numeric value, ``self - other``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            dataset.compute_metadata()

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            rectangleness = abs(
                F("$metadata.width") * F("bounding_box")[2] -
                F("$metadata.height") * F("bounding_box")[3]
            )

            # Only contains predictions whose bounding boxes are within 1 pixel
            # of being square
            view = (
                dataset
                .select_fields("predictions")
                .filter_labels("predictions", rectangleness <= 1)
            )

            session = fo.launch_app(view=view)

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        """Divides this expression, which must resolve to a numeric value, by
        the given value, ``self / other``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            dataset.compute_metadata()

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            aspect_ratio = (
                (F("$metadata.width") * F("bounding_box")[2]) /
                (F("$metadata.height") * F("bounding_box")[3])
            )

            # Only contains predictions whose aspect ratio is > 2
            view = (
                dataset
                .select_fields("predictions")
                .filter_labels("predictions", aspect_ratio > 2)
            )

            session = fo.launch_app(view=view)

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$divide": [self, other]})

    def abs(self):
        """Computes the absolute value of this expression, which must resolve
        to a numeric value.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.25, 0.75]
            view = dataset.match((F("uniqueness") - 0.5).abs() < 0.25)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$abs": self})

    def floor(self):
        """Computes the floor of this expression, which must resolve to a
        numeric value.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.5, 1]
            view = dataset.match((F("uniqueness") + 0.5).floor() == 1)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$floor": self})

    def ceil(self):
        """Computes the ceiling of this expression, which must resolve to a
        numeric value.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.5, 1]
            view = dataset.match((F("uniqueness") + 0.5).ceil() == 2)

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ceil": self})

    def round(self, place=0):
        """Rounds this expression, which must resolve to a numeric value, at
        the given decimal place.

        Positive values of ``place`` will round to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.57

        Negative values of ``place`` will round ``place`` digits left of the
        decimal::

            place=-1: 1234.5678 --> 1230

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with `uniqueness` in [0.25, 0.75]
            view = dataset.match((2 * F("uniqueness")).round() == 1)

            print(view.bounds("uniqueness"))

        Args:
            place (0): the decimal place at which to round. Must be an
                integer in range ``(-20, 100)``

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$round": [self, place]})

    def trunc(self, place=0):
        """Truncates this expression, which must resolve to a numeric value, at
        the specified decimal place.

        Positive values of ``place`` will truncate to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.56

        Negative values of ``place`` will replace ``place`` digits left of the
        decimal with zero::

            place=-1: 1234.5678 --> 1230

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            dataset.compute_metadata()

            # Only contains samples whose height is in [500, 600) pixels
            view = dataset.match(F("metadata.height").trunc(-2) == 500)

            print(view.bounds("metadata.height"))

        Args:
            place (0): the decimal place at which to truncate

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$trunc": [self, place]})

    def exp(self):
        """Raises Euler's number to this expression, which must resolve to a
        numeric value.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$exp": self})

    def ln(self):
        """Computes the natural logarithm of this expression, which must
        resolve to a numeric value.

        Examples::

            import math

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5
            view = dataset.match(F("uniqueness").ln() >= math.log(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ln": self})

    def log(self, base):
        """Computes the logarithm base ``base`` of this expression, which must
        resolve to a numeric value.

        Examples::

            import math

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5
            view = dataset.match(F("uniqueness").log(2) >= math.log2(0.5))

            print(view.bounds("uniqueness"))

        Args:
            base: the logarithm base

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log": [self, base]})

    def log10(self):
        """Computes the logarithm base 10 of this expression, which must
        resolve to a numeric value.

        Examples::

            import math

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5
            view = dataset.match(F("uniqueness").log10() >= math.log10(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log10": self})

    def pow(self, power):
        """Raises this expression, which must resolve to a numeric value, to
        the given power, ``self ** power``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            center_dist = (
                (F("bounding_box")[0] + 0.5 * F("bounding_box")[2] - 0.5).pow(2) +
                (F("bounding_box")[1] + 0.5 * F("bounding_box")[3] - 0.5).pow(2)
            ).sqrt()

            # Only contains predictions whose bounding box center is a distance
            # of at most 0.02 from the center of the image
            view = dataset.select_fields("predictions").filter_labels(
                "predictions", center_dist < 0.02
            )

            session = fo.launch_app(view=view)

        Args:
            power: the power

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$pow": [self, power]})

    def sqrt(self):
        """Computes the square root of this expression, which must resolve to a
        numeric value.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            center_dist = (
                (F("bounding_box")[0] + 0.5 * F("bounding_box")[2] - 0.5) ** 2 +
                (F("bounding_box")[1] + 0.5 * F("bounding_box")[3] - 0.5) ** 2
            ).sqrt()

            # Only contains predictions whose bounding box center is a distance
            # of at most 0.02 from the center of the image
            view = dataset.select_fields("predictions").filter_labels(
                "predictions", center_dist < 0.02
            )

            session = fo.launch_app(view=view)

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sqrt": self})

    # Trigonometric operators #################################################

    def cos(self):
        """Computes the cosine of this expression, which must resolve to a
        numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `cos()`
            view = dataset.match(F("uniqueness").cos() <= np.cos(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$cos": self})

    def cosh(self):
        """Computes the hyperbolic cosine of this expression, which must
        resolve to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `cosh()`
            view = dataset.match(F("uniqueness").cosh() >= np.cosh(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$cosh": self})

    def sin(self):
        """Computes the sine of this expression, which must resolve to a
        numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `sin()`
            view = dataset.match(F("uniqueness").sin() >= np.sin(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sin": self})

    def sinh(self):
        """Computes the hyperbolic sine of this expression, which must resolve
        to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `sinh()`
            view = dataset.match(F("uniqueness").sinh() >= np.sinh(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sinh": self})

    def tan(self):
        """Computes the tangent of this expression, which must resolve to a
        numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `tan()`
            view = dataset.match(F("uniqueness").tan() >= np.tan(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$tan": self})

    def tanh(self):
        """Computes the hyperbolic tangent of this expression, which must
        resolve to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `tanh()`
            view = dataset.match(F("uniqueness").tanh() >= np.tanh(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$tanh": self})

    def arccos(self):
        """Computes the inverse cosine of this expression, which must resolve
        to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arccos()`
            view = dataset.match(F("uniqueness").arccos() <= np.arccos(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$acos": self})

    def arccosh(self):
        """Computes the inverse hyperbolic cosine of this expression, which
        must resolve to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arccosh()`
            view = dataset.match((1 + F("uniqueness")).arccosh() >= np.arccosh(1.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$acosh": self})

    def arcsin(self):
        """Computes the inverse sine of this expression, which must resolve to
        a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arcsin()`
            view = dataset.match(F("uniqueness").arcsin() >= np.arcsin(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$asin": self})

    def arcsinh(self):
        """Computes the inverse hyperbolic sine of this expression, which must
        resolve to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arcsinh()`
            view = dataset.match(F("uniqueness").arcsinh() >= np.arcsinh(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$asinh": self})

    def arctan(self):
        """Computes the inverse tangent of this expression, which must resolve
        to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arctan()`
            view = dataset.match(F("uniqueness").arctan() >= np.arctan(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$atan": self})

    def arctanh(self):
        """Computes the inverse hyperbolic tangent of this expression, which
        must resolve to a numeric value, in radians.

        Examples::

            import numpy as np

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose `uniqueness` value is >= 0.5 using `arctanh()`
            view = dataset.match(F("uniqueness").arctanh() >= np.arctanh(0.5))

            print(view.bounds("uniqueness"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$atanh": self})

    # Generic field operators #################################################

    def type(self):
        """Returns the type string of this expression.

        See `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/type>`_
        for more details.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Set `uniqueness` values below 0.75 to None
            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") > 0.75).if_else(F("uniqueness"), None)
            )

            # Create a view that only contains samples with non-None uniqueness
            unique_only_view = view.match(F("uniqueness").type() != "null")

            print(len(unique_only_view))

        Returns:
             a :class:`ViewExpression`
        """
        return ViewExpression({"$type": self})

    def is_null(self):
        """Determines whether this expression is null.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Set `uniqueness` values below 0.25 to None
            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") >= 0.25).if_else(F("uniqueness"), None)
            )

            # Create view that only contains samples with uniqueness = None
            not_unique_view = view.match(F("uniqueness").is_null())

            print(len(not_unique_view))

        Returns:
            :class:`ViewExpression`
        """
        return self == None

    def is_number(self):
        """Determines whether this expression is a number.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Set `uniqueness` values below 0.25 to None
            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") >= 0.25).if_else(F("uniqueness"), None)
            )

            # Create view that only contains samples with uniqueness values
            has_unique_view = view.match(F("uniqueness").is_number())

            print(len(has_unique_view))

        Returns:
            :class:`ViewExpression`
        """
        return ViewExpression({"$isNumber": self})

    def is_string(self):
        """Determines whether this expression is a string.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Verify that filepaths are strings
            view = dataset.match(F("filepath").is_string())

            print(len(view))

        Returns:
            :class:`ViewExpression`
        """
        return self.type() == "string"

    def is_array(self):
        """Determines whether this expression is an array.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Verify that tags are arrays
            view = dataset.match(F("tags").is_array())

            print(len(view))

        Returns:
            :class:`ViewExpression`
        """
        return ViewExpression({"$isArray": self})

    def is_missing(self):
        """Determines whether this expression refers to a missing field.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Verify that `foobar` is a non-existent field on all samples
            view = dataset.match(F("foobar").is_missing())

            print(len(view) == len(dataset))

        Returns:
            :class:`ViewExpression`
        """
        return self.type() == "missing"

    def is_in(self, values):
        """Creates an expression that returns a boolean indicating whether
        ``self in values``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            ANIMALS = [
                "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
                "horse", "sheep", "zebra"
            ]

            dataset = foz.load_zoo_dataset("quickstart")

            # Create a view that only contains animal predictions
            view = dataset.filter_labels(
                "predictions", F("label").is_in(ANIMALS)
            )

            print(view.count_values("predictions.detections.label"))

        Args:
            values: a value or iterable of values

        Returns:
            a :class:`ViewExpression`
        """
        if etau.is_str(values):
            values = [values]

        return ViewExpression({"$in": [self, list(values)]})

    def to_bool(self):
        """Converts the expression to a boolean value.

        See
        `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/toBool>`__
        for conversion rules.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart").clone()

            # Adds a `uniqueness_bool` field that is False when
            # `uniqueness < 0.5` and True when `uniqueness >= 0.5`
            dataset.add_sample_field("uniqueness_bool", fo.BooleanField)
            view = dataset.set_field(
                "uniqueness_bool", (2.0 * F("uniqueness")).floor().to_bool()
            )

            print(view.count_values("uniqueness_bool"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toBool": self})

    def to_int(self):
        """Converts the expression to an integer value.

        See
        `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/toInt>`__
        for conversion rules.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart").clone()

            # Adds a `uniqueness_int` field that contains the value of the
            # first decimal point of the `uniqueness` field
            dataset.add_sample_field("uniqueness_int", fo.IntField)
            view = dataset.set_field(
                "uniqueness_int", (10.0 * F("uniqueness")).floor().to_int()
            )

            print(view.count_values("uniqueness_int"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toInt": self})

    def to_double(self):
        """Converts the expression to a double precision value.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart").clone()

            # Adds a `uniqueness_float` field that is 0.0 when
            # `uniqueness < 0.5` and 1.0 when `uniqueness >= 0.5`
            dataset.add_sample_field("uniqueness_float", fo.FloatField)
            view = dataset.set_field(
                "uniqueness_float", (F("uniqueness") >= 0.5).to_double()
            )

            print(view.count_values("uniqueness_float"))

        See
        `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/toDouble>`__
        for conversion rules.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toDouble": self})

    def to_string(self):
        """Converts the expression to a string value.

        See
        `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/toString>`__
        for conversion rules.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart").clone()

            # Adds a `uniqueness_str` field that is "true" when
            # `uniqueness >= 0.5` and "false" when `uniqueness < 0.5`
            dataset.add_sample_field("uniqueness_str", fo.StringField)
            view = dataset.set_field(
                "uniqueness_str", (F("uniqueness") >= 0.5).to_string()
            )

            print(view.count_values("uniqueness_str"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toString": self})

    def to_date(self):
        """Converts the expression to a date value.

        See
        `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/toDate>`__
        for conversion rules.

        Examples::

            from datetime import datetime
            import pytz

            import fiftyone as fo
            from fiftyone import ViewField as F

            now = datetime.utcnow().replace(tzinfo=pytz.utc)

            sample = fo.Sample(
                filepath="image.png",
                date_ms=1000 * now.timestamp(),
                date_str=now.isoformat(),
            )

            dataset = fo.Dataset()
            dataset.add_sample(sample)

            # Convert string/millisecond representations into datetimes
            dataset.add_sample_field("date1", fo.DateTimeField)
            dataset.add_sample_field("date2", fo.DateTimeField)
            (
                dataset
                .set_field("date1", F("date_ms").to_date())
                .set_field("date2", F("date_str").to_date())
                .save()
            )

            print(dataset.first())

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toDate": self})

    def apply(self, expr):
        """Applies the given expression to this expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples with `uniqueness` in [0.25, 0.75]
            view = dataset.match(
                F("uniqueness").apply((F() > 0.25) & (F() < 0.75))
            )

            print(view.bounds("uniqueness"))

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$expr")
        return ViewExpression({"$let": {"vars": {"expr": self}, "in": expr}})

    def if_else(self, true_expr, false_expr):
        """Returns either ``true_expr`` or ``false_expr`` depending on the
        value of this expression, which must resolve to a boolean.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Set `uniqueness` values below 0.75 to None
            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") > 0.75).if_else(F("uniqueness"), None)
            )

            print(view.bounds("uniqueness"))

        Args:
            true_expr: a :class:`ViewExpression` or MongoDB expression dict
            false_expr: a :class:`ViewExpression` or MongoDB expression dict

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {"$cond": {"if": self, "then": true_expr, "else": false_expr}}
        )

    def cases(self, mapping, default=None):
        """Applies a case statement to this expression, which effectively
        computes the following pseudocode::

            for key, value in mapping.items():
                if self == key:
                    return value

            if default is not None:
                return default

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Set `uniqueness` values below 0.75 to None
            view = dataset.set_field(
                "uniqueness",
                (F("uniqueness") > 0.75).if_else(F("uniqueness"), None)
            )

            # Map numeric `uniqueness` values to 1 and null values to 0
            cases_view = view.set_field(
                "uniqueness",
                F("uniqueness").type().cases({"double": 1, "null": 0}),
            )

            print(cases_view.count_values("uniqueness"))

        Args:
            mapping: a dict mapping literals or :class:`ViewExpression` keys to
                literal or :class:`ViewExpression` values
            default (None): an optional literal or :class:`ViewExpression` to
                return if none of the switch branches are taken

        Returns:
            a :class:`ViewExpression`
        """
        mapping = {ViewField() == k: v for k, v in mapping.items()}
        return self.switch(mapping, default=default)

    def switch(self, mapping, default=None):
        """Applies a switch statement to this expression, which effectively
        computes the given pseudocode::

            for key, value in mapping.items():
                if self.apply(key):
                    return value

            if default is not None:
                return default

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Round `uniqueness` values to either 0.25 or 0.75
            view = dataset.set_field(
                "uniqueness",
                F("uniqueness").switch(
                    {
                        (0.0 < F()) & (F() <= 0.5): 0.25,
                        (0.5 < F()) & (F() <= 1.0): 0.75,
                    },
                )
            )

            print(view.count_values("uniqueness"))

        Args:
            mapping: a dict mapping boolean :class:`ViewExpression` keys to
                literal or :class:`ViewExpression` values
            default (None): an optional literal or :class:`ViewExpression` to
                return if none of the switch branches are taken

        Returns:
            a :class:`ViewExpression`
        """
        branches = []
        for key, value in mapping.items():
            key._freeze_prefix("$$expr")
            branches.append({"case": key, "then": value})

        switch = {"branches": branches}
        if default is not None:
            switch["default"] = default

        return ViewExpression(
            {"$let": {"vars": {"expr": self}, "in": {"$switch": switch}}}
        )

    def map_values(self, mapping):
        """Replaces this expression with the corresponding value in the
        provided mapping dict, if it is present as a key.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            ANIMALS = [
                "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
                "horse", "sheep", "zebra"
            ]

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Replace the `label` of all animal objects in the `predictions`
            # field with "animal"
            #
            mapping = {a: "animal" for a in ANIMALS}
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(
                    F().set_field("label", F("label").map_values(mapping))
                )
            )

            print(view.count_values("predictions.detections.label"))

        Args:
            mapping: a dict mapping keys to replacement values

        Returns:
            a :class:`ViewExpression`
        """
        keys, values = zip(*list(mapping.items()))
        return ViewExpression(
            {
                "$let": {
                    "vars": {"this": self, "keys": keys, "values": values},
                    "in": {
                        "$cond": [
                            {"$in": ["$$this", "$$keys"]},
                            {
                                "$arrayElemAt": [
                                    "$$values",
                                    {"$indexOfArray": ["$$keys", "$$this"]},
                                ],
                            },
                            "$$this",
                        ]
                    },
                }
            }
        )

    def set_field(self, field, value_or_expr, relative=True):
        """Sets the specified field or embedded field of this expression, which
        must resolve to a document, to the given value or expression.

        By default, the provided expression is computed by applying it to this
        expression via ``self.apply(value_or_expr)``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Replaces the `label` attritubes of the objects in the
            # `predictions` field according to the following rule:
            #
            #   If the `label` starts with `b`, replace it with `b`. Otherwise,
            #   replace it with "other"
            #
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(
                    F().set_field(
                        "label",
                        F("label").re_match("^b").if_else("b", "other"),
                    )
                )
            )

            print(view.count_values("predictions.detections.label"))

        Args:
            field: the "field" or "embedded.field.name" to set
            value_or_expr: a literal value or :class:`ViewExpression` defining
                the field to set
            relative (True): whether to compute ``value_or_expr`` by applying
                it to this expression (True), or to use it untouched (False)

        Returns:
            a :class:`ViewExpression`
        """
        if (
            isinstance(value_or_expr, ViewExpression)
            and relative
            and not value_or_expr.is_frozen
        ):
            value = self.apply(value_or_expr)
        elif isinstance(value_or_expr, MongoEngineBaseDocument):
            value = value_or_expr.to_dict()
            value.pop("_id", None)
        else:
            value = value_or_expr

        field = "$$expr." + field
        expr = value
        chunks = field.split(".")
        for idx, chunk in enumerate(reversed(chunks[1:]), 1):
            expr = {"$mergeObjects": [".".join(chunks[:-idx]), {chunk: expr}]}

        return self._let_in(ViewExpression(expr), var="expr")

    def let_in(self, expr):
        """Returns an equivalent expression where this expression is defined as
        a variable that is used wherever necessary in the given expression.

        This method is useful when ``expr`` contains multiple instances of this
        expression, since it avoids duplicate computation of this expression in
        the final pipeline.

        If ``expr`` is a simple expression such as a :class:`ViewField`, no
        variable is defined and ``expr`` is directly returned.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            good_bboxes = (bbox_area > 0.25) & (bbox_area < 0.75)

            # Optimize the expression
            good_bboxes_opt = bbox_area.let_in(good_bboxes)

            # Contains predictions whose bounding box areas are in [0.25, 0.75]
            view = dataset.filter_labels("predictions", good_bboxes_opt)

            print(good_bboxes)
            print(good_bboxes_opt)
            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(self, (ViewField, ObjectId)):
            return expr

        return self._let_in(expr)

    def _let_in(self, expr, var="expr"):
        self_expr = ViewField("$$" + var)
        in_expr = _do_apply_memo(expr, self, self_expr)
        return ViewExpression({"$let": {"vars": {var: self}, "in": in_expr}})

    def min(self, value=None):
        """Returns the minimum value of either this expression, which must
        resolve to an array, or the minimum of this expression and the given
        value.

        Missing or ``None`` values are ignored.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Adds a `min_area` property to the `predictions` field that
            # records the minimum prediction area in that sample
            view = dataset.set_field(
                "predictions.min_area",
                F("detections").map(bbox_area).min()
            )

            print(view.bounds("predictions.min_area"))

        Args:
            value (None): an optional value to compare to

        Returns:
            a :class:`ViewExpression`
        """
        if value is not None:
            return ViewExpression({"$min": [self, value]})

        return ViewExpression({"$min": self})

    def max(self, value=None):
        """Returns the maximum value of either this expression, which must
        resolve to an array, or the maximum of this expression and the given
        value.

        Missing or ``None`` values are ignored.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Adds a `max_area` property to the `predictions` field that
            # records the maximum prediction area in that sample
            view = dataset.set_field(
                "predictions.max_area",
                F("detections").map(bbox_area).max()
            )

            print(view.bounds("predictions.max_area"))

        Args:
            value (None): an optional value to compare to

        Returns:
            a :class:`ViewExpression`
        """
        if value is not None:
            return ViewExpression({"$max": [self, value]})

        return ViewExpression({"$max": self})

    # Array expression operators ##############################################

    def __getitem__(self, idx_or_slice):
        """Returns the element or slice of this expression, which must resolve
        to an array.

        All of the typical slicing operations are supported, except for
        specifying a non-unit step::

            expr[3]      # the fourth element
            expr[-1]     # the last element
            expr[:10]    # the first (up to) 10 elements
            expr[-3:]    # the last (up to) 3 elements
            expr[3:10]   # the fourth through tenth elements

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Only contains objects in the `predictions` field with area > 0.2
            view = dataset.filter_labels("predictions", bbox_area > 0.2)

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            idx_or_slice: the index or slice

        Returns:
            a :class:`ViewExpression`
        """
        if not isinstance(idx_or_slice, slice):
            return ViewExpression({"$arrayElemAt": [self, idx_or_slice]})

        s = idx_or_slice

        if s.step is not None and s.step != 1:
            raise ValueError(
                "Unsupported slice '%s'; step is not supported" % s
            )

        # @todo could optimize this slightly (~10% based on rough benchmarks)
        # if the `if_else()` calls were replaced by explicit logic when
        # start/stop are numbers, not expressions

        # @todo slices like `x[-a:b]` where sign(a) != sign(b) are not
        # currently working

        if s.start is not None:
            position = s.start
            if s.stop is None:
                n = self.length()
                expr = ViewExpression({"$slice": [self, position, n]})
                return self.let_in(expr)

            n = s.stop - position

            pos_start = ViewExpression({"$slice": [self, position, n]})
            neg_start = ViewExpression(
                {"$slice": [self, position + self.length(), n]}
            )
            expr = ViewExpression(n >= 0).if_else(
                ViewExpression(position >= 0).if_else(pos_start, neg_start),
                ViewExpression({"$literal": []}),
            )
            return self.let_in(expr)

        if s.stop is None:
            return self

        pos_stop = ViewExpression({"$slice": [self, s.stop]})
        neg_stop = ViewExpression({"$slice": [self, self.length() + s.stop]})
        expr = ViewExpression(s.stop >= 0).if_else(pos_stop, neg_stop)
        return self.let_in(expr)

    def __len__(self):
        # Annoyingly, Python enforces deep in its depths that __len__ must
        # return an int. So, we cannot return our length expression here...
        raise TypeError(
            "Computing the length of an expression via `len()` is not "
            "allowed; use `expression.length()` instead"
        )

    def length(self):
        """Computes the length of this expression, which must resolve to an
        array.

        If this expression's value is null or missing, zero is returned.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with at least 15 predicted objects
            view = dataset.match(F("predictions.detections").length() >= 15)

            print(dataset.count())
            print(view.count())

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$size": {"$ifNull": [self, []]}})

    def contains(self, values, all=False):
        """Checks whether this expression, which must resolve to an array,
        contains any of the given values.

        Pass ``all=True`` to require that this expression contains all of the
        given values.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            print(dataset.count())

            # Only contains samples with a "cat" prediction
            view = dataset.match(
                F("predictions.detections.label").contains("cat")
            )
            print(view.count())

            # Only contains samples with "cat" or "dog" predictions
            view = dataset.match(
                F("predictions.detections.label").contains(["cat", "dog"])
            )
            print(view.count())

            # Only contains samples with "cat" and "dog" predictions
            view = dataset.match(
                F("predictions.detections.label").contains(["cat", "dog"], all=True)
            )
            print(view.count())

        Args:
            values: a value, iterable of values, or :class:`ViewExpression`
                that resolves to an array of values
            all (False): whether this expression must contain all (True) or
                any (False) of the given values

        Returns:
            a :class:`ViewExpression`
        """
        if not isinstance(values, ViewExpression):
            if etau.is_container(values):
                values = list(values)
                if len(values) == 1:
                    values = values[0]

            if isinstance(values, ViewExpression) or not etau.is_container(
                values
            ):
                return ViewExpression({"$in": [values, self]})

        if not all:
            return self.intersection(values).length() > 0

        if not isinstance(values, ViewExpression):
            values = ViewExpression(values)

        return values.is_subset(self)

    def is_subset(self, values):
        """Checks whether this expression's contents, which must resolve to an
        array, are a subset of the given array or array expression's contents.

        The arrays are treated as sets, so duplicate values are ignored.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b", "a", "b"],
                        other_tags=["a", "b", "c"],
                    )
                ]
            )

            print(dataset.values(F("tags").is_subset(F("other_tags"))))
            # [True]

        Args:
            values: an iterable of values or a :class:`ViewExpression` that
                resolves to an array

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(values, ViewExpression):
            other = values
        else:
            other = list(values)

        return ViewExpression({"$setIsSubset": [self, other]})

    def set_equals(self, *args):
        """Checks whether this expression, which must resolve to an array,
        contains the same distinct values as each of the given array(s) or
        array expression(s).

        The arrays are treated as sets, so all duplicates are ignored.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b", "a", "b"],
                        other_tags=["a", "b", "b"],
                    )
                ]
            )

            print(dataset.values(F("tags").set_equals(F("other_tags"))))
            # [True]

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances that
                resolve to array expressions

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$setEquals": [self] + list(args)})

    def unique(self):
        """Returns an array containing the unique values in this expression,
        which must resolve to an array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b", "a", "b"],
                    )
                ]
            )

            print(dataset.values(F("tags").unique()))
            # [['a', 'b']]

        Returns:
            a :class:`ViewExpression`
        """
        return self.union()

    def union(self, *args):
        """Computes the set union of this expression, which must resolve to an
        array, and the given array(s) or array expression(s).

        The arrays are treated as sets, so all duplicates are removed.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b"],
                        other_tags=["a", "c"]
                    )
                ]
            )

            print(dataset.values(F("tags").union(F("other_tags"))))
            # [['a', 'b', 'c']]

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances that
                resolve to array expressions

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$setUnion": [self] + list(args)})

    def intersection(self, *args):
        """Computes the set intersection of this expression, which must resolve
        to an array, and the given array(s) or array expression(s).

        The arrays are treated as sets, so all duplicates are removed.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b"],
                        other_tags=["a", "c"]
                    )
                ]
            )

            print(dataset.values(F("tags").intersection(F("other_tags"))))
            # [['a']]

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances that
                resolve to array expressions

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$setIntersection": [self] + list(args)})

    def difference(self, values):
        """Computes the set difference of this expression, which must resolve
        to an array, and the given array or array expression.

        The arrays are treated as sets, so all duplicates are removed.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b"],
                        other_tags=["a", "c"]
                    )
                ]
            )

            print(dataset.values(F("tags").difference(F("other_tags"))))
            # [['b']]

        Args:
            values: an iterable of values or a :class:`ViewExpression` that
                resolves to an array

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(values, ViewExpression):
            other = values
        else:
            other = list(values)

        return ViewExpression({"$setDifference": [self, other]})

    def reverse(self):
        """Reverses the order of the elements in the expression, which must
        resolve to an array.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            first_obj = F("predictions.detections")[0]
            last_obj = F("predictions.detections").reverse()[0]

            # Only contains samples whose first and last prediction have the
            # same label
            view = dataset.match(
                first_obj.apply(F("label")) == last_obj.apply(F("label"))
            )

            print(dataset.count())
            print(view.count())

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$reverseArray": self})

    def sort(self, key=None, numeric=False, reverse=False):
        """Sorts this expression, which must resolve to an array.

        If no ``key`` is provided, this array must contain elements whose
        BSON representation can be sorted by JavaScript's ``.sort()`` method.

        If a ``key`` is provided, the array must contain documents, which are
        sorted by ``key``, which must be a field or embedded field.

        Examples::

            #
            # Sort the tags of each sample in a dataset
            #

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="im1.jpg", tags=["z", "f", "p", "a"]),
                    fo.Sample(filepath="im2.jpg", tags=["y", "q", "h", "d"]),
                    fo.Sample(filepath="im3.jpg", tags=["w", "c", "v", "l"]),
                ]
            )

            # Sort the `tags` of each sample
            view = dataset.set_field("tags", F("tags").sort())

            print(view.first().tags)

            #
            # Sort the predictions in each sample of a dataset by `confidence`
            #

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            view = dataset.set_field(
                "predictions.detections",
                F("detections").sort(key="confidence", numeric=True, reverse=True)
            )

            sample = view.first()
            print(sample.predictions.detections[0].confidence)
            print(sample.predictions.detections[-1].confidence)

        Args:
            key (None): an optional field or ``embedded.field.name`` to sort by
            numeric (False): whether the array contains numeric values. By
                default, the values will be sorted alphabetically by their
                string representations
            reverse (False): whether to sort in descending order

        Returns:
            a :class:`ViewExpression`
        """
        if key is not None:
            if numeric:
                comp = "(a, b) => a.{key} - b.{key}"
            else:
                comp = "(a, b) => ('' + a.{key}).localeCompare(b.{key})"

            comp = comp.format(key=key)
        elif numeric:
            comp = "(a, b) => a - b"
        else:
            comp = ""

        if reverse:
            rev = ".reverse()"
        else:
            rev = ""

        sort_fcn = """
        function(array) {{
            array.sort({comp}){rev};
            return array;
        }}
        """.format(
            comp=comp, rev=rev
        )

        return self._function(sort_fcn)

    def filter(self, expr):
        """Applies the given filter to the elements of this expression, which
        must resolve to an array.

        The output array will only contain elements of the input array for
        which ``expr`` returns ``True``.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only include predictions with `confidence` of at least 0.9
            view = dataset.set_field(
                "predictions.detections",
                F("detections").filter(F("confidence") > 0.9)
            )

            print(view.bounds("predictions.detections.confidence"))

        Args:
            expr: a :class:`ViewExpression` that returns a boolean

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression(
            {"$filter": {"input": self, "as": "this", "cond": expr}}
        )

    def map(self, expr):
        """Applies the given expression to the elements of this expression,
        which must resolve to an array.

        The output will be an array with the applied results.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Only include predictions with `confidence` of at least 0.9
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(F().set_field("area", bbox_area))
            )

            print(view.bounds("predictions.detections.area"))

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression(
            {"$map": {"input": self, "as": "this", "in": expr}}
        )

    def reduce(self, expr, init_val=0):
        """Applies the given reduction to this expression, which must resolve
        to an array, and returns the single value computed.

        The provided ``expr`` must include the :const:`VALUE` expression to
        properly define the reduction.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F
            from fiftyone.core.expressions import VALUE

            #
            # Compute the number of keypoints in each sample of a dataset
            #

            dataset = fo.Dataset()
            dataset.add_sample(
                fo.Sample(
                    filepath="image.jpg",
                    keypoints=fo.Keypoints(
                        keypoints=[
                            fo.Keypoint(points=[(0, 0), (1, 1)]),
                            fo.Keypoint(points=[(0, 0), (1, 0), (1, 1), (0, 1)]),
                        ]
                    )
                )
            )

            view = dataset.set_field(
                "keypoints.count",
                F("$keypoints.keypoints").reduce(VALUE + F("points").length()),
            )

            print(view.first().keypoints.count)

            #
            # Generate a `list,of,labels` for the `predictions` of each sample
            #

            dataset = foz.load_zoo_dataset("quickstart")

            join_labels = F("detections").reduce(
                VALUE.concat(",", F("label")), init_val=""
            ).lstrip(",")

            view = dataset.set_field("predictions.labels", join_labels)

            print(view.first().predictions.labels)

        Args:
            expr: a :class:`ViewExpression` defining the reduction expression
                to apply. Must contain the :const:`VALUE` expression
            init_val (0): an initial value for the reduction

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression(
            {"$reduce": {"input": self, "initialValue": init_val, "in": expr}}
        )

    def prepend(self, value):
        """Prepends the given value to this expression, which must resolve to
        an array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["b", "c"]),
                    fo.Sample(filepath="image2.jpg", tags=["b", "c"]),
                ]
            )

            # Adds the "a" tag to each sample
            view = dataset.set_field("tags", F("tags").prepend("a"))

            print(view.first().tags)

        Args:
            value: the value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression([value]).extend(self)

    def append(self, value):
        """Appends the given value to this expression, which must resolve to an
        array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["a", "b"]),
                    fo.Sample(filepath="image2.jpg", tags=["a", "b"]),
                ]
            )

            # Appends the "c" tag to each sample
            view = dataset.set_field("tags", F("tags").append("c"))

            print(view.first().tags)

        Args:
            value: the value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return self.extend([value])

    def insert(self, index, value):
        """Inserts the value before the given index in this expression, which
        must resolve to an array.

        If ``index <= 0``, the value is prepended to this array.
        If ``index >= self.length()``, the value is appended to this array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["a", "c"]),
                    fo.Sample(filepath="image2.jpg", tags=["a", "c"]),
                ]
            )

            # Adds the "ready" tag to each sample
            view = dataset.set_field("tags", F("tags").insert(1, "b"))

            print(view.first().tags)

        Args:
            index: the index at which to insert the value
            value: the value or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        expr = self[:index].extend([value], self[index:])
        return self.let_in(expr)

    def extend(self, *args):
        """Concatenates the given array(s) or array expression(s) to this
        expression, which must resolve to an array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["a", "b"]),
                    fo.Sample(filepath="image2.jpg", tags=["a", "b"]),
                ]
            )

            # Adds the "c" and "d" tags to each sample
            view = dataset.set_field("tags", F("tags").extend(["c", "d"]))

            print(view.first().tags)

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances that
                resolve to array expressions

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$concatArrays": [self] + list(args)})

    def sum(self):
        """Returns the sum of the values in this expression, which must resolve
        to a numeric array.

        Missing, non-numeric, or ``None``-valued elements are ignored.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add a field to each `predictions` object that records the total
            # confidence of the predictions
            view = dataset.set_field(
                "predictions.total_conf",
                F("detections").map(F("confidence")).sum()
            )

            print(view.bounds("predictions.total_conf"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sum": self})

    def mean(self):
        """Returns the average value in this expression, which must resolve to
        a numeric array.

        Missing or ``None``-valued elements are ignored.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add a field to each `predictions` object that records the average
            # confidence of the predictions
            view = dataset.set_field(
                "predictions.conf_mean",
                F("detections").map(F("confidence")).mean()
            )

            print(view.bounds("predictions.conf_mean"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$avg": self})

    def std(self, sample=False):
        """Returns the standard deviation of the values in this expression,
        which must resolve to a numeric array.

        Missing or ``None``-valued elements are ignored.

        By default, the population standard deviation is returned. If you wish
        to compute the sample standard deviation instead, set ``sample=True``.

        See https://en.wikipedia.org/wiki/Standard_deviation#Estimation for
        more information on population (biased) vs sample (unbiased) standard
        deviation.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add a field to each `predictions` object that records the
            # standard deviation of the confidences
            view = dataset.set_field(
                "predictions.conf_std",
                F("detections").map(F("confidence")).std()
            )

            print(view.bounds("predictions.conf_std"))

        Args:
            sample (False): whether to compute the sample standard deviation
                rather than the population standard deviation

        Returns:
            a :class:`ViewExpression`
        """
        if sample:
            return ViewExpression({"$stdDevSamp": self})

        return ViewExpression({"$stdDevPop": self})

    def join(self, delimiter):
        """Joins the elements of this expression, which must resolve to a
        string array, by the given delimiter.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Generate a `list,of,labels` for the `predictions` of each sample
            view = dataset.set_field(
                "predictions.labels",
                F("detections").map(F("label")).join(",")
            )

            print(view.first().predictions.labels)

        Args:
            delimiter: the delimiter string

        Returns:
            a :class:`ViewExpression`
        """
        return self.reduce(
            VALUE.concat(delimiter, ViewField()), init_val=""
        ).substr(start=len(delimiter))

    # String expression operators #############################################

    def substr(self, start=None, end=None, count=None):
        """Extracts the specified substring from this expression, which must
        resolve to a string.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Truncate the `label` of each prediction to 3 characters
            truncate_label = F().set_field("label", F("label").substr(count=3))
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(truncate_label),
            )

            print(view.distinct("predictions.detections.label"))

        Args:
            start (None): the starting index of the substring. If negative,
                specifies an offset from the end of the string
            end (None): the ending index of the substring. If negative,
                specifies an offset from the end of the string
            count (None): the substring length to extract. If ``None``, the
                rest of the string is returned

        Returns:
            a :class:`ViewExpression`
        """
        if start is None and end is None and count is None:
            return self

        if start is None:
            start = 0

        if start < 0 and end is not None and end < 0:
            count = end - start
            end = None

        if start < 0:
            start += self.strlen()

        if end is not None:
            if end < 0:
                end += self.strlen()

            count = end - start
        elif count is None:
            count = -1

        expr = ViewExpression({"$substrBytes": [self, start, count]})
        return self.let_in(expr)

    def strlen(self):
        """Computes the length of this expression, which must resolve to a
        string.

        If this expression's value is null or missing, zero is returned.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Records the length of each predicted object's `label`
            label_len = F().set_field("label_len", F("label").strlen())
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(label_len),
            )

            print(view.bounds("predictions.detections.label_len"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$strLenBytes": {"$ifNull": [self, ""]}})

    def lower(self):
        """Converts this expression, which must resolve to a string, to
        lowercase.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Converts all tags to lowercase
            transform_tag = F().lower()
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toLower": self})

    def upper(self):
        """Converts this expression, which must resolve to a string, to
        uppercase.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Converts all tags to uppercase
            transform_tag = F().upper()
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toUpper": self})

    def concat(self, *args):
        """Concatenates the given string(s) to this expression, which must
        resolve to a string.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Appends "-tag" to all tags
            transform_tag = F().concat("-tag")
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Args:
            *args: one or more strings or string :class:`ViewExpression`
                instances
            before (False): whether to position ``args`` before this string in
                the output string

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$concat": [self] + list(args)})

    def strip(self, chars=None):
        """Removes whitespace characters from the beginning and end of this
        expression, which must resolve to a string.

        If ``chars`` is provided, those characters are removed instead of
        whitespace.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewExpression as E
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds and then strips whitespace from each tag
            transform_tag = E(" ").concat(F(), " ").rstrip()
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        trim = {"input": self}
        if chars is not None:
            trim["chars"] = chars

        return ViewExpression({"$trim": trim})

    def lstrip(self, chars=None):
        """Removes whitespace characters from the beginning of this expression,
        which must resolve to a string.

        If ``chars`` is provided, those characters are removed instead of
        whitespace.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewExpression as E
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds and then strips whitespace from the beginning of each tag
            transform_tag = E(" ").concat(F()).lstrip()
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        ltrim = {"input": self}
        if chars is not None:
            ltrim["chars"] = chars

        return ViewExpression({"$ltrim": ltrim})

    def rstrip(self, chars=None):
        """Removes whitespace characters from the end of this expression, which
        must resolve to a string.

        If ``chars`` is provided, those characters are removed instead of
        whitespace.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds and then strips whitespace from the end of each tag
            transform_tag = F().concat(" ").rstrip()
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        rtrim = {"input": self}
        if chars is not None:
            rtrim["chars"] = chars

        return ViewExpression({"$rtrim": rtrim})

    def replace(self, old, new):
        """Replaces all occurances of ``old`` with ``new`` in this expression,
        which must resolve to a string.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Replaces "val" with "VAL" in each tag
            transform_tag = F().replace("val", "VAL")
            view = dataset.set_field("tags", F("tags").map(transform_tag))

            print(dataset.distinct("tags"))
            print(view.distinct("tags"))

        Args:
            old: a string or :class:`ViewExpression` resolving to a string
                expression specifying the substring to replace
            new: a string or :class:`ViewExpression` resolving to a string
                expression specifying the replacement value

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {"$replaceAll": {"input": self, "find": old, "replacement": new}}
        )

    def re_match(self, regex, options=None):
        """Performs a regular expression pattern match on this expression,
        which must resolve to a string.

        The output of the expression will be ``True`` if the pattern matches
        and ``False`` otherwise.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Get samples whose images are JPEGs
            #

            view = dataset.match(F("filepath").re_match("\\.jpg$"))

            print(view.count())
            print(view.first().filepath)

            #
            # Get samples whose images are in the "/Users" directory
            #

            view = dataset.match(F("filepath").re_match("^/Users/"))

            print(view.count())
            print(view.first().filepath)

        Args:
            regex: the regular expression to apply. Must be a Perl Compatible
                Regular Expression (PCRE). See
                `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/regexMatch/#regexmatch-regex>`__
                for details
            options (None): an optional string of regex options to apply. See
                `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/regexMatch/#regexmatch-options>`__
                for the available options

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {
                "$regexMatch": {
                    "input": self,
                    "regex": regex,
                    "options": options,
                }
            }
        )

    def starts_with(self, str_or_strs, case_sensitive=True):
        """Determines whether this expression, which must resolve to a string,
        starts with the given string or string(s).

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose images are in "/Users" or "/home" directories
            view = dataset.match(F("filepath").starts_with(("/Users", "/home"))

            print(view.count())
            print(view.first().filepath)

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = "^" + str_or_strs
        else:
            regex = "^(%s)" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def ends_with(self, str_or_strs, case_sensitive=True):
        """Determines whether this expression, which must resolve to a string,
        ends with the given string or string(s).

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Get samples whose images are JPEGs or PNGs
            view = dataset.match(F("filepath").ends_with((".jpg", ".png")))

            print(view.count())
            print(view.first().filepath)

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = str_or_strs + "$"
        else:
            regex = "(%s)$" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def contains_str(self, str_or_strs, case_sensitive=True):
        """Determines whether this expression, which must resolve to a string,
        contains the given string or string(s).

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains predictions whose `label` contains "be"
            view = dataset.filter_labels(
                "predictions", F("label").contains_str("be")
            )

            print(view.distinct("predictions.detections.label"))

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = str_or_strs
        else:
            regex = "(%s)" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def matches_str(self, str_or_strs, case_sensitive=True):
        """Determines whether this expression, which must resolve to a string,
        exactly matches the given string or string(s).

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains predictions whose `label` is "cat" or "dog", case
            # insensitive
            view = dataset.map_labels(
                "predictions", {"cat": "CAT", "dog": "DOG"}
            ).filter_labels(
                "predictions",
                F("label").matches_str(("cat", "dog"), case_sensitive=False)
            )

            print(view.distinct("predictions.detections.label"))

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = "^" + str_or_strs + "$"
        else:
            regex = "^(%s)$" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def split(self, delimiter, maxsplit=None):
        """Splits this expression, which must resolve to a string, by the given
        delimiter.

        The result is a string array that contains the chunks with the
        delimiter removed. If the delimiter is not found, this full string is
        returned as a single element array.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add "-good" to the first tag and then split on "-" to create two
            # tags for each sample
            view = dataset.set_field(
                "tags", F("tags")[0].concat("-good").split("-")
            )

            print(view.first().tags)

        Args:
            delimiter: the delimiter string or :class:`ViewExpression`
                resolving to a string expression
            maxsplit (None): a maximum number of splits to perform, from the
                left

        Returns:
            a :class:`ViewExpression`
        """
        split_expr = ViewExpression({"$split": [self, delimiter]})

        if maxsplit is None:
            return split_expr

        if maxsplit <= 0:
            return ViewExpression([self])

        # pylint: disable=invalid-unary-operand-type
        maxsplit_expr = (split_expr.length() > maxsplit + 1).if_else(
            split_expr[:maxsplit].append(
                split_expr[maxsplit:].join(delimiter)
            ),
            split_expr,
        )
        return split_expr.let_in(maxsplit_expr)

    def rsplit(self, delimiter, maxsplit=None):
        """Splits this expression, which must resolve to a string, by the given
        delimiter.

        If the number of chunks exceeds ``maxsplit``, splits are only performed
        on the last ``maxsplit`` occurances of the delimiter.

        The result is a string array that contains the chunks with the
        delimiter removed. If the delimiter is not found, this full string is
        returned as a single element array.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add "-ok-go" to the first tag and then split once on "-" from the
            # right to create two tags for each sample
            view = dataset.set_field(
                "tags", F("tags")[0].concat("-ok-go").rsplit("-", 1)
            )

            print(view.first().tags)

        Args:
            delimiter: the delimiter string or :class:`ViewExpression`
                resolving to a string expression
            maxsplit (None): a maximum number of splits to perform, from the
                right

        Returns:
            a :class:`ViewExpression`
        """
        split_expr = ViewExpression({"$split": [self, delimiter]})

        if maxsplit is None:
            return split_expr

        if maxsplit <= 0:
            return ViewExpression([self])

        # pylint: disable=invalid-unary-operand-type
        maxsplit_expr = (split_expr.length() > maxsplit + 1).if_else(
            split_expr[-maxsplit:].prepend(
                split_expr[:-maxsplit].join(delimiter)
            ),
            split_expr,
        )
        return split_expr.let_in(maxsplit_expr)

    # Date expression operators ###############################################

    def millisecond(self):
        """Returns the millisecond portion of this date expression (in UTC) as
        an integer between 0 and 999.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 0, 1000),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 0, 2000),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 0, 3000),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 0, 4000),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the millisecond portion of the dates in the dataset
            print(dataset.values(F("created_at").millisecond()))

            # Samples with even milliseconds
            view = dataset.match(F("created_at").millisecond() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$millisecond": self})

    def second(self):
        """Returns the second portion of this date expression (in UTC) as a
        number between 0 and 59.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 2),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 3),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 0, 4),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the second portion of the dates in the dataset
            print(dataset.values(F("created_at").second()))

            # Samples with even seconds
            view = dataset.match(F("created_at").second() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$second": self})

    def minute(self):
        """Returns the minute portion of this date expression (in UTC) as a
        number between 0 and 59.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 2),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 3),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 0, 4),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the minute portion of the dates in the dataset
            print(dataset.values(F("created_at").minute()))

            # Samples with even minutes
            view = dataset.match(F("created_at").minute() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$minute": self})

    def hour(self):
        """Returns the hour portion of this date expression (in UTC) as a
        number between 0 and 23.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 2),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 3),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1, 4),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the hour portion of the dates in the dataset
            print(dataset.values(F("created_at").hour()))

            # Samples with even hours
            view = dataset.match(F("created_at").hour() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$hour": self})

    def day_of_week(self):
        """Returns the day of the week of this date expression (in UTC) as a
        number between 1 (Sunday) and 7 (Saturday).

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 4),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 5),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 6),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 7),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the days of the week for the dataset
            print(dataset.values(F("created_at").day_of_week()))

            # Samples with even days of the week
            view = dataset.match(F("created_at").day_of_week() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$dayOfWeek": self})

    def day_of_month(self):
        """Returns the day of the month of this date expression (in UTC) as a
        number between 1 and 31.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 2),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 3),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 4),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the days of the month for the dataset
            print(dataset.values(F("created_at").day_of_month()))

            # Samples with even days of the month
            view = dataset.match(F("created_at").day_of_month() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$dayOfMonth": self})

    def day_of_year(self):
        """Returns the day of the year of this date expression (in UTC) as a
        number between 1 and 366.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 2),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 3),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 4),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the days of the year for the dataset
            print(dataset.values(F("created_at").day_of_year()))

            # Samples with even days of the year
            view = dataset.match(F("created_at").day_of_year() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$dayOfYear": self})

    def week(self):
        """Returns the week of the year of this date expression (in UTC) as a
        number between 0 and 53.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 2, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 3, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 4, 1),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the weeks of the year for the dataset
            print(dataset.values(F("created_at").week()))

            # Samples with even months of the week
            view = dataset.match(F("created_at").week() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$week": self})

    def month(self):
        """Returns the month of this date expression (in UTC) as a number
        between 1 and 12.

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 2, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 3, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 4, 1),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the months of the year for the dataset
            print(dataset.values(F("created_at").month()))

            # Samples from even months of the year
            view = dataset.match(F("created_at").month() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$month": self})

    def year(self):
        """Returns the year of this date expression (in UTC).

        Examples::

            from datetime import datetime

            import fiftyone as fo
            from fiftyone import ViewField as F

            samples = [
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1970, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1971, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1972, 1, 1),
                ),
                fo.Sample(
                    filepath="image1.jpg",
                    created_at=datetime(1973, 1, 1),
                ),
            ]

            dataset = fo.Dataset()
            dataset.add_samples(samples)

            # Get the years for the dataset
            print(dataset.values(F("created_at").year()))

            # Samples from even years
            view = dataset.match(F("created_at").year() % 2 == 0)
            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$year": self})

    # Static expressions ######################################################

    @staticmethod
    def literal(value):
        """Returns an expression representing the given value without parsing.

        See `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/literal>`_
        for more information on when this method is reqiured.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add the "$money" tag to each sample
            # The "$" character ordinarily has special meaning, so we must wrap
            # it in `literal()` in order to add it via this method
            view = dataset.set_field(
                "tags", F("tags").append(F.literal("$money"))
            )

            print(view.first().tags)

        Args:
            value: a value

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$literal": value})

    @staticmethod
    def rand():
        """Returns an expression that generates a uniform random float in
        ``[0, 1]`` each time it is called.

        .. warning::

            This expression will generate new values each time it is used, so
            you likely do not want to use it to construct dataset views, since
            such views would produce different outputs each time they are used.

            A typical usage for this expression is in conjunction with
            :meth:`fiftyone.core.view.DatasetView.set_field` and
            :meth:`fiftyone.core.view.DatasetView.save` to populate a
            randomized field on a dataset.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewExpression as E

            dataset = foz.load_zoo_dataset("quickstart").clone()

            #
            # Populate a new `rand` field with random numbers
            #

            dataset.add_sample_field("rand", fo.FloatField)
            dataset.set_field("rand", E.rand()).save("rand")

            print(dataset.bounds("rand"))

            #
            # Create a view that contains a different 10%% of the dataset each
            # time it is used
            #

            view = dataset.match(E.rand() < 0.1)

            print(view.first().id)
            print(view.first().id)  # probably different!

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$rand": {}})

    @staticmethod
    def randn():
        """Returns an expression that generates a sample from the standard
        Gaussian distribution each time it is called.

        .. warning::

            This expression will generate new values each time it is used, so
            you likely do not want to use it to construct dataset views, since
            such views would produce different outputs each time they are used.

            A typical usage for this expression is in conjunction with
            :meth:`fiftyone.core.view.DatasetView.set_field` and
            :meth:`fiftyone.core.view.DatasetView.save` to populate a
            randomized field on a dataset.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewExpression as E

            dataset = foz.load_zoo_dataset("quickstart").clone()

            #
            # Populate a new `randn` field with random numbers
            #

            dataset.add_sample_field("randn", fo.FloatField)
            dataset.set_field("randn", E.randn()).save("randn")

            print(dataset.bounds("randn"))

            #
            # Create a view that contains a different 50%% of the dataset each
            # time it is used
            #

            view = dataset.match(E.randn() < 0)

            print(view.first().id)
            print(view.first().id)  # probably different!

        Returns:
            a :class:`ViewExpression`
        """
        # Box-Muller transform
        # https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
        alpha = (-2.0 * (ViewExpression.rand().ln())).sqrt()
        beta = (2.0 * np.pi * ViewExpression.rand()).cos()
        return alpha * beta

    @staticmethod
    def any(exprs):
        """Checks whether any of the given expressions evaluate to True.

        If no expressions are provided, returns False.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Create a view that only contains predictions that are "cat" or
            # highly confident
            is_cat = F("label") == "cat"
            is_confident = F("confidence") > 0.95
            view = dataset.filter_labels(
                "predictions", F.any([is_cat, is_confident])
            )

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            exprs: a :class:`ViewExpression` or iterable of
                :class:`ViewExpression` instances

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(exprs, ViewExpression) or not etau.is_container(exprs):
            exprs = [exprs]
        else:
            exprs = list(exprs)

        num_exprs = len(exprs)

        if num_exprs == 0:
            return ViewExpression(False)

        if num_exprs == 1:
            return exprs[0]

        return ViewExpression({"$or": exprs})

    @staticmethod
    def all(exprs):
        """Checks whether all of the given expressions evaluate to True.

        If no expressions are provided, returns True.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Create a view that only contains predictions that are "cat" and
            # highly confident
            is_cat = F("label") == "cat"
            is_confident = F("confidence") > 0.95
            view = dataset.filter_labels(
                "predictions", F.all([is_cat, is_confident])
            )

            print(dataset.count("predictions.detections"))
            print(view.count("predictions.detections"))

        Args:
            exprs: a :class:`ViewExpression` or iterable of
                :class:`ViewExpression` instances

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(exprs, ViewExpression) or not etau.is_container(exprs):
            exprs = [exprs]
        else:
            exprs = list(exprs)

        num_exprs = len(exprs)

        if num_exprs == 0:
            return ViewExpression(True)

        if num_exprs == 1:
            return exprs[0]

        return ViewExpression({"$and": exprs})

    @staticmethod
    def range(start, stop=None):
        """Returns an array expression containing the sequence of integers from
        the specified start (inclusive) to stop (exclusive).

        If ``stop`` is provided, returns ``[start, start + 1, ..., stop - 1]``.

        If no ``stop`` is provided, returns ``[0, 1, ..., start - 1]``.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["a", "b", "c"]),
                    fo.Sample(filepath="image2.jpg", tags=["y", "z"]),
                ]
            )

            # Populates an `ints` field based on the number of `tags`
            dataset.add_sample_field("ints", fo.ListField)
            view = dataset.set_field("ints", F.range(F("tags").length()))

            print(view.first())

        Args:
            start: the starting value, or stopping value if no ``stop`` is
                provided
            stop (None): the stopping value, if both input arguments are
                provided

        Returns:
            a :class:`ViewExpression`
        """
        if stop is None:
            stop = start
            start = 0

        return ViewExpression({"$range": [start, stop]})

    @staticmethod
    def enumerate(array, start=0):
        """Returns an array of ``[index, element]`` pairs enumerating the
        elements of the given expression, which must resolve to an array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(filepath="image1.jpg", tags=["a", "b", "c"]),
                    fo.Sample(filepath="image2.jpg", tags=["y", "z"]),
                ]
            )

            # Populates an `enumerated_tags` field with the enumerated `tag`
            dataset.add_sample_field("enumerated_tags", fo.ListField)
            view = dataset.set_field("enumerated_tags", F.enumerate(F("tags")))

            print(view.first())

        Args:
            array: a :class:`ViewExpression` that resolves to an array
            start (0): the starting enumeration index to use

        Returns:
            a :class:`ViewExpression`
        """
        expr = ViewExpression.zip(
            ViewExpression.range(start, stop=start + array.length()),
            array,
        )
        return array.let_in(expr)

    @staticmethod
    def zip(*args, use_longest=False, defaults=None):
        """Zips the given expressions, which must resolve to arrays, into an
        array whose ith element is an array containing the ith element from
        each input array.

        Examples::

            import fiftyone as fo
            from fiftyone import ViewField as F

            dataset = fo.Dataset()
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="image1.jpg",
                        tags=["a", "b", "c"],
                        ints=[1, 2, 3, 4, 5],
                    ),
                    fo.Sample(
                        filepath="image2.jpg",
                        tags=["y", "z"],
                        ints=[25, 26, 27, 28],
                    ),
                ]
            )

            dataset.add_sample_field("tags_ints", fo.ListField)

            # Populates an `tags_ints` field with the zipped `tags` and `ints`
            view = dataset.set_field("tags_ints", F.zip(F("tags"), F("ints")))

            print(view.first())

            # Same as above but use the longest array to determine output size
            view = dataset.set_field(
                "tags_ints",
                F.zip(F("tags"), F("ints"), use_longest=True, defaults=("", 0))
            )

            print(view.first())

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances
                resolving to arrays
            use_longest (False): whether to use the longest array to determine
                the number of elements in the output array. By default, the
                length of the shortest array is used
            defaults (None): an optional array of default values of same length
                as ``*args`` to use when ``use_longest == True`` and the input
                arrays are of different lengths. If no defaults are provided
                and ``use_longest == True``, then missing values are set to
                ``None``

        Returns:
            a :class:`ViewExpression`
        """
        if not use_longest:
            return ViewExpression({"$zip": {"inputs": list(args)}})

        zip_expr = {"inputs": list(args), "useLongestLength": True}
        if defaults is not None:
            zip_expr["defaults"] = defaults

        return ViewExpression({"$zip": zip_expr})

    # Experimental expressions ###############################################

    def _function(self, function):
        function = " ".join(function.split())
        return ViewExpression(
            {"$function": {"body": function, "args": [self], "lang": "js"}}
        )


class ViewField(ViewExpression):
    """A :class:`ViewExpression` that refers to a field or embedded field of a
    document.

    You can use
    `dot notation <https://docs.mongodb.com/manual/core/document/#dot-notation>`_
    to refer to subfields of embedded objects within fields.

    When you create a :class:`ViewField` using a string field like
    ``ViewField("embedded.field.name")``, the meaning of this field is
    interpreted relative to the context in which the :class:`ViewField` object
    is used. For example, when passed to the :meth:`ViewExpression.map` method,
    this object will refer to the ``embedded.field.name`` object of the array
    element being processed.

    In other cases, you may wish to create a :class:`ViewField` that always
    refers to the root document. You can do this by prepending ``"$"`` to the
    name of the field, as in ``ViewField("$embedded.field.name")``.

    Examples::

        from fiftyone import ViewField as F

        # Reference the root of the current context
        F()

        # Reference the `ground_truth` field in the current context
        F("ground_truth")

        # Reference the `label` field of the `ground_truth` object in the
        # current context
        F("ground_truth.label")

        # Reference the root document in any context
        F("$")

        # Reference the `label` field of the root document in any context
        F("$label")

        # Reference the `label` field of the `ground_truth` object in the root
        # document in any context
        F("$ground_truth.label")

    .. automethod:: __eq__
    .. automethod:: __ge__
    .. automethod:: __gt__
    .. automethod:: __le__
    .. automethod:: __lt__
    .. automethod:: __ne__
    .. automethod:: __and__
    .. automethod:: __invert__
    .. automethod:: __or__
    .. automethod:: __abs__
    .. automethod:: __add__
    .. automethod:: __ceil__
    .. automethod:: __floor__
    .. automethod:: __round__
    .. automethod:: __mod__
    .. automethod:: __mul__
    .. automethod:: __pow__
    .. automethod:: __sub__
    .. automethod:: __truediv__
    .. automethod:: __getitem__

    Args:
        name (None): the name of the field, with an optional "$" preprended if
            you wish to freeze this field to the root document
    """

    def __init__(self, name=None):
        if name is None:
            name = ""

        should_freeze = name.startswith("$")
        if should_freeze:
            name = name[1:]

        super().__init__(name)

        if should_freeze:
            self._freeze_prefix("")

    def __deepcopy__(self, memo):
        obj = self.__class__()
        obj._expr = deepcopy(self._expr, memo)
        obj._prefix = deepcopy(self._prefix, memo)
        return obj

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the field.

        Args:
            prefix (None): an optional prefix to prepend to the field name

        Returns:
            a string
        """
        if self.is_frozen:
            prefix = self._prefix

        if prefix:
            return prefix + "." + self._expr if self._expr else prefix

        if self._expr:
            return "$" + self._expr

        if self.is_frozen:
            return "$$ROOT"

        return "$$CURRENT"


class ObjectId(ViewExpression):
    """A :class:`ViewExpression` that refers to an
    `ObjectId <https://docs.mongodb.com/manual/reference/method/ObjectId>`_ of
    a document.

    The typical use case for this class is writing an expression that involves
    checking if the ID of a document matches a particular known ID.

    Example::

        from fiftyone import ViewField as F
        from fiftyone.core.expressions import ObjectId

        # Check if the ID of the document matches the given ID
        expr = F("_id") == ObjectId("5f452489ef00e6374aad384a")

    Args:
        oid: the object ID string
    """

    def __init__(self, oid):
        _ = bson.ObjectId(oid)  # validates that `oid` is valid value
        super().__init__(oid)

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the ObjectId.

        Args:
            prefix (None): unused

        Returns:
            a MongoDB expression
        """
        return {"$toObjectId": self._expr}


def _do_to_mongo(val, prefix):
    if isinstance(val, ViewExpression):
        return val.to_mongo(prefix=prefix)

    if isinstance(val, dict):
        return {
            _do_to_mongo(k, prefix): _do_to_mongo(v, prefix)
            for k, v in val.items()
        }

    if isinstance(val, list):
        return [_do_to_mongo(v, prefix) for v in val]

    if isinstance(val, (date, datetime)):
        # The arg needs must be float (not int) to avoid errors near the epoch
        return {"$toDate": fou.datetime_to_timestamp(val)}

    if isinstance(val, timedelta):
        return fou.timedelta_to_ms(val)

    return val


def _do_freeze_prefix(val, prefix):
    def fcn(val):
        if not val.is_frozen:
            val._prefix = prefix

    return _do_recurse(val, fcn)


def _do_apply_memo(val, old, new):
    def fcn(val):
        if val is old:
            return new

        val._expr = _do_apply_memo(val._expr, old, new)
        return val

    return _do_recurse(val, fcn)


def _do_recurse(val, fcn):
    if isinstance(val, ViewExpression):
        return fcn(val)

    if isinstance(val, dict):
        return {
            _do_recurse(k, fcn): _do_recurse(v, fcn) for k, v in val.items()
        }

    if isinstance(val, list):
        return [_do_recurse(v, fcn) for v in val]

    return val


VALUE = ViewField("$$value")
"""A :class:`ViewExpression` that refers to the current ``$$value`` in a
MongoDB reduction expression.

See :meth:`ViewExpression.reduce` for more information.
"""


def _escape_regex_chars(str_or_strs):
    # Must escape `[`, `]`, `-`, and `\` because they have special meaning
    # inside the `[]` that will be used in the replacement regex
    regex_chars = r"\[\]{}()*+\-?.,\\^$|#"
    _escape = lambda s: re.sub(r"([%s])" % regex_chars, r"\\\1", s)

    if etau.is_str(str_or_strs):
        return _escape(str_or_strs)

    return [_escape(s) for s in str_or_strs]
