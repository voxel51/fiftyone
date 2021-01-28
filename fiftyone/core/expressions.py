"""
Expressions for :class:`fiftyone.core.stages.ViewStage` definitions.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import re
import warnings

import bson

import eta.core.utils as etau

import fiftyone.core.utils as fou


class ViewExpression(object):
    """An expression involving one or more fields of an object in a
    :class:`fiftyone.core.stages.ViewStage`.

    See `MongoDB expressions <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    for more details.

    Typically, :class:`ViewExpression` instances are built by applying
    builtin operators to :class:`ViewField` instances.

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
        return self.__class__(deepcopy(self._expr, memo))

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

    def exists(self):
        """Determines whether this expression, which must resolve to a field,
        exists and is not None.

        Examples::

            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add a new field to one sample
            sample = dataset.first()
            sample["new_field"] = ["hello", "there"]
            sample.save()

            # Get samples that have a value for `new_field`
            view = dataset.match(F("new_field").exists())

            print(len(view))

        Returns:
            a :class:`ViewExpression`
        """
        # https://stackoverflow.com/a/25515046
        return ViewExpression({"$gt": [self, None]})

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
        """Computes the absolute value of this numeric expression.

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
        """Adds the given value to this numeric expression, ``self + other``.

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
        """Computes the ceiling of this numeric expression.

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
        """Computes the floor of this numeric expression.

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
        """Rounds this numeric expression at the given decimal place.

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
        """Computes the modulus of this numeric expression, ``self % other``.

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
        """Computes the product of the given value and this numeric expression,
        ``self * other``.

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
        """Raises this numeric expression to the given power,
        ``self ** power``.

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
                "predictions", center_dist < 0.02, only_matches=True
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
        """Subtracts the given value from this numeric expression,
        ``self - other``.

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
                .filter_labels("predictions", rectangleness <= 1, only_matches=True)
            )

            session = fo.launch_app(view=view)

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        """Divides this numeric expression by the given value,
        ``self / other``.

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
                .filter_labels("predictions", aspect_ratio > 2, only_matches=True)
            )

            session = fo.launch_app(view=view)

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$divide": [self, other]})

    def abs(self):
        """Computes the absolute value of the numeric expression.

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
        """Computes the floor of this numeric expression.

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
        """Computes the ceiling of this numeric expression.

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
        """Rounds this numeric expression at the given decimal place.

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
        """Truncates this numeric expression at the specified decimal place.

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
        """Raises Euler's number to this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$exp": self})

    def ln(self):
        """Computes the natural logarithm of this numeric expression.

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
        """Computes logarithm base ``base`` of this numeric expression.

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
        """Computes logarithm base 10 of this numeric expression.

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
        """Raises this numeric expression to the given power,
        ``self ** power``.

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
                "predictions", center_dist < 0.02, only_matches=True
            )

            session = fo.launch_app(view=view)

        Args:
            power: the power

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$pow": [self, power]})

    def sqrt(self):
        """Computes the square root of this numeric expression.

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
                "predictions", center_dist < 0.02, only_matches=True
            )

            session = fo.launch_app(view=view)

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sqrt": self})

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

            print(cases_view.count_values("uniqueness"))

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

            dataset = foz.load_zoo_dataset("quickstart")

            ANIMALS = [
                "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
                "horse", "sheep", "zebra"
            ]

            #
            # Replace the `label` of all animal objects in the `predictions`
            # field with "animal"
            #
            view = dataset.set_field(
                "predictions.detections",
                F("detections").map(
                    F().set_field(
                        "label",
                        F("label").map_values({a: "animal" for a in ANIMALS}),
                    )
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

    def set_field(self, field, value_or_expr):
        """Sets the specified field or embedded field of this expression, which
        must evaluate to a document, to the given value or expression.

        The provided expression is computed by applying it to this expression
        via ``self.apply(value_or_expr)``.

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

        Returns:
            a :class:`ViewExpression`
        """
        if (
            isinstance(value_or_expr, ViewExpression)
            and not value_or_expr.is_frozen
        ):
            value = self.apply(value_or_expr)
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
            a :class:`ViewExpression
        """
        if isinstance(self, (ViewField, ObjectId)):
            return expr

        return self._let_in(expr)

    def _let_in(self, expr, var="expr"):
        self_expr = ViewField("$$" + var)
        in_expr = _do_apply_memo(expr, self, self_expr)
        return ViewExpression({"$let": {"vars": {var: self}, "in": in_expr}})

    def min(self, value=None):
        """Returns the minimum value of either this array expression, or the
        minimum of this expression and the given value.

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
        """Returns the maximum value of either this array expression, or the
        maximum of this expression and the given value.

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
        """Returns the element or slice of this array expression.

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

        if s.start is not None:
            if s.stop is None:
                n = s.start
                return ViewExpression({"$slice": [self, n]})

            position = s.start
            n = s.stop - position
            if n < 0:
                return ViewExpression({"$literal": []})

            if position < 0:
                position += self.length()
                expr = ViewExpression({"$slice": [self, position, n]})
                return self.let_in(expr)

            return ViewExpression({"$slice": [self, position, n]})

        if s.stop is None:
            return self

        if s.stop < 0:
            n = self.length() + s.stop
            expr = ViewExpression({"$slice": [self, n]})
            return self.let_in(expr)

        n = s.stop
        return ViewExpression({"$slice": [self, n]})

    def __len__(self):
        # Annoyingly, Python enforces deep in its depths that __len__ must
        # return an int. So, we cannot return our length expression here...
        raise TypeError(
            "Computing the length of an expression via `len()` is not "
            "allowed; use `expression.length()` instead"
        )

    def length(self):
        """Computes the length of this array expression.

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

    def contains(self, value):
        """Checks whether the given value is in this array expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Only contains samples with a "cat" prediction
            view = dataset.match(
                F("predictions.detections").map(F("label")).contains("cat")
            )

            print(dataset.count())
            print(view.count())

        Args:
            value: a value

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$in": [value, self]})

    def reverse(self):
        """Reverses the order of the elements in the array expression.

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

    def sort(self, reverse=False):
        """Sorts this expression, which must resolve an array whose BSON
        representation can be sorted by JavaScript's ``.sort()`` method.

        Examples::

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

        Args:
            field: the field to sort by
            reverse (False): whether to sort in descending order

        Args:
            reverse (False): whether to sort in descending order

        Returns:
            a :class:`ViewExpression`
        """
        rev = ".reverse()" if reverse else ""
        sort_fcn = """
        function(array) {{
            array.sort(){rev};
            return array;
        }}
        """.format(
            rev=rev
        )

        return ViewExpression(
            {"$function": {"body": sort_fcn, "args": [self], "lang": "js"}}
        )

    def sort_by(self, field, reverse=False):
        """Sorts this expression, which must resolve to a document array, by
        the given field or embedded field.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Sort the predictions in each sample by `confidence`
            view = dataset.set_field(
                "predictions.detections",
                F("detections").sort_by("confidence", reverse=True)
            )

            sample = view.first()
            print(sample.predictions.detections[0].confidence)
            print(sample.predictions.detections[-1].confidence)

        Args:
            field: the field to sort by
            reverse (False): whether to sort in descending order

        Returns:
            a :class:`ViewExpression`
        """
        rev = ".reverse()" if reverse else ""
        sort_fcn = """
        function(array) {{
            array.sort((a, b) => a.{field} - b.{field}){rev};
            return array;
        }}
        """.format(
            field=field, rev=rev
        )

        return ViewExpression(
            {"$function": {"body": sort_fcn, "args": [self], "lang": "js"}}
        )

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
        return ViewExpression({"$filter": {"input": self, "cond": expr}})

    def map(self, expr):
        """Applies the given expression to the elements of this expression,
        which must be an array.

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

    def extend(self, *args, before=False):
        """Concatenates the given array(s) or array expression(s) to this array
        expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds the "good" and "ready" tags to each sample
            view = dataset.set_field(
                "tags", F("tags").extend(["good", "ready"])
            )

            print(view.first().tags)

        Args:
            *args: one or more arrays or :class:`ViewExpression` instances that
                resolve to array expressions
            before (False): whether to position ``args`` before this array in
                the output array

        Returns:
            a :class:`ViewExpression`
        """
        if before:
            return ViewExpression({"$concatArrays": list(args) + [self]})

        return ViewExpression({"$concatArrays": [self] + list(args)})

    def sum(self):
        """Returns the sum of the values in this expression, which must be a
        numeric array.

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
                "predictions.avg_conf",
                F("detections").map(F("confidence")).mean()
            )

            print(view.bounds("predictions.avg_conf"))

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$avg": self})

    def reduce(self, expr, init_val=0):
        """Applies the given reduction to this expression, which be an array,
        and returns the single value computed by

        The provided ``expr`` must include the :constant:`VALUE` expression to
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
                to apply. Must contain the :var:`VALUE` expression
            init_val (0): an initial value for the reduction

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression(
            {"$reduce": {"input": self, "initialValue": init_val, "in": expr}}
        )

    def join(self, delimiter):
        """Joins the element of this expression, which must be a string array,
        by the given delimiter.

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
        """Extracts the specified substring from this string expression.

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
        """Computes the length of this string expression.

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
        """Converts the string expression to lowercase.

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
        """Converts the string expression to uppercase.

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

    def concat(self, *args, before=False):
        """Concatenates the given string(s) to this string expression.

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
        if before:
            return ViewExpression({"$concat": list(args) + [self]})

        return ViewExpression({"$concat": [self] + list(args)})

    def strip(self, chars=None):
        """Removes whitespace characters from the beginning and end of the
        string expression. Or, if ``chars`` is provided, remove those
        characters instead.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds and then strips whitespace from each tag
            transform_tag = F().concat(" ", before=True).concat(" ").rstrip()
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
        """Removes whitespace characters from the beginning of the string
        expression. Or, if ``chars`` is provided, remove those characters
        instead.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Adds and then strips whitespace from the beginning of each tag
            transform_tag = F().concat(" ", before=True).lstrip()
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
        """Removes whitespace characters from the end of the string expression.
        Or, if ``chars`` is provided, remove those characters instead.

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
        """Replaces all occurances of ``old`` with ``new`` in the string
        expression.

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
                for  details
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
        """Determines whether this string expression starts with the given
        string (or any of a list of strings).

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
        """Determines whether this string expression ends with the given string
        (or any of a list of strings).

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
        """Determines whether this string expression contains the given string
        (or any of a list of strings).

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
        """Determines whether this string expression exactly matches the given
        string (or any of a list of strings).

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

    def split(self, delimiter):
        """Splits the string expression by the given delimiter.

        The result is a string array that contains the chunks with the
        delimiter removed. If the delimiter is not found, this full string is
        returned as a single element array.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            # Add "-good" to the first tag and then split on "-" to create
            # multiple tags for each sample
            view = dataset.set_field(
                "tags", F("tags")[0].concat("-good").split("-")
            )

            print(view.distinct("tags"))

        Args:
            delimiter: the delimiter string or :class:`ViewExpression`
                resolving to a string expression

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$split": [self, delimiter]})


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

        return "$" + self._expr if self._expr else "$this"


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


def _do_to_mongo(val, prefix):
    def fcn(val):
        return val.to_mongo(prefix=prefix)

    return _do_recurse(val, fcn)


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


#: A :class:`ViewExpression` that refers to the current `$$value` in a MongoDB
# reduction expression. See :meth:`ViewExpression.reduce`.
VALUE = ViewField("$$value")

#: A :class:`ViewExpression` that generates a random float in ``[0, 1]`` each
# time it is called.
RAND = ViewExpression({"$rand": {}})


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


def _escape_regex_chars(str_or_strs):
    # Must escape `[`, `]`, `-`, and `\` because they have special meaning
    # inside the `[]` that will be used in the replacement regex
    regex_chars = r"\[\]{}()*+\-?.,\\^$|#"
    _escape = lambda s: re.sub(r"([%s])" % regex_chars, r"\\\1", s)

    if etau.is_str(str_or_strs):
        return _escape(str_or_strs)

    return [_escape(s) for s in str_or_strs]
