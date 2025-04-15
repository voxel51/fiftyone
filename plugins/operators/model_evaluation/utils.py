from textwrap import dedent
import fiftyone.core.fields as fof
from enum import Enum

# NOTE: copied from NativeModelEval
KEY_COLOR = "#ff6d04"
COMPARE_KEY_COLOR = "#03a9f4"

MAX_CATEGORIES = 12  # This was discussed thoroughly.
ALLOWED_BY_TYPES = (
    fof.StringField,
    fof.BooleanField,
    fof.IntField,
    fof.FloatField,
)


class CustomCodeViewReason(str, Enum):
    TOO_MANY_CATEGORIES = "TOO_MANY_CATEGORIES"
    TOO_MANY_INT_CATEGORIES = "TOO_MANY_INT_CATEGORIES"
    FLOAT_TYPE = "FLOAT_TYPE"
    SLOW = "SLOW"


class ShowOptionsMethod(str, Enum):
    CODE = "CODE"
    CHECKBOX = "CHECKBOX"
    EMPTY = "EMPTY"
    AUTOCOMPLETE = "AUTO-COMPLETE"


class ScenarioType(str, Enum):
    VIEW = "view"
    CUSTOM_CODE = "custom_code"
    LABEL_ATTRIBUTE = "label_attribute"
    SAMPLE_FIELD = "sample_field"


SCENARIO_BUILDING_CHOICES = [
    {
        "type": ScenarioType.SAMPLE_FIELD,
        "label": "Select sample fields",
        "icon": "task_outlined",
    },
    {
        "type": ScenarioType.LABEL_ATTRIBUTE,
        "label": "Select label attributes",
        "icon": "task_outlined",
    },
    {
        "type": ScenarioType.VIEW,
        "label": "Select saved views",
        "icon": "folder_special_rounded",
    },
    {
        "type": ScenarioType.CUSTOM_CODE,
        "label": "Custom code",
        "icon": "code_rounded",
    },
]


def get_scenario_example(reason=ScenarioType.CUSTOM_CODE):
    examples = {
        ScenarioType.CUSTOM_CODE: dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "Unique Objects": [
                    dict(type="field", expr=F("uniqueness") > 0.75),
                ],
                "Common Objects": [
                    dict(type="field", expr=F("uniqueness") < 0.16),
                ]
            }
        """
        ).strip(),
        CustomCodeViewReason.FLOAT_TYPE: dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "Unique Objects": [
                    dict(type="field", expr=F("uniqueness") > 0.75),
                ],
                "Common Objects": [
                    dict(type="field", expr=F("uniqueness") < 0.165),
                ]
            }
            """
        ).strip(),
        CustomCodeViewReason.TOO_MANY_CATEGORIES: dedent(
            """
            from fiftyone import ViewField as F
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
            subsets = {
                "Small objects": dict(type="attribute", expr=bbox_area <= 0.05),
                "Medium objects": dict(type="attribute", expr=(0.05 <= bbox_area) & (bbox_area <= 0.5)),
                "Large objects": dict(type="attribute", expr=bbox_area > 0.5),
            }
            """
        ).strip(),
        CustomCodeViewReason.TOO_MANY_INT_CATEGORIES: dedent(
            """
            from fiftyone import ViewField as F
            subsets = {
                "few ints": dict(type="field", expr=F("int_field") > 100),
                "many ints": dict(type="field", expr=F("int_field") <= 100),
            }
            """
        ).strip(),
    }
    return examples.get(reason, "")
