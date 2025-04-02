from textwrap import dedent
import fiftyone.core.fields as fof

# NOTE: copied from NativeModelEval
KEY_COLOR = "#ff6d04"
COMPARE_KEY_COLOR = "#03a9f4"

MAX_CATEGORIES = 10
ALLOWED_BY_TYPES = (
    fof.StringField,  # TODO: needs a dropdown - call distinct on the field - if too many, show code view
    fof.BooleanField,  # TODO: needs two checkboxes
    fof.IntField,
    fof.FloatField,
)

SCENARIO_BUILDING_CHOICES = [
    {
        "type": "sample_field",
        "label": "Select sample fields",
        "icon": "edit_attributes_outlined",
    },
    {
        "type": "label_attribute",
        "label": "Select label attributes",
        "icon": "edit_attributes_outlined",
    },
    {
        "type": "view",
        "label": "Select saved views",
        "icon": "folder_special_rounded",
    },
    {
        "type": "custom_code",
        "label": "Custom code",
        "icon": "code_rounded",
    },
]


def get_scenario_example(reason="float"):
    examples = {
        "CUSTOM_CODE": dedent(
            """
            from fiftyone import ViewField as F

            subsets = {
                "Sunny unique objects": [
                    dict(type="field", field="tags", value="test"),
                    dict(type="field", expr=F("brightness") > 0.75),
                ],
                "Rainy common objects": [
                    dict(type="field", field="tags", value="test"),
                    dict(type="field", expr=F("brightness") < 0.25),
                ]
            }
        """
        ).strip(),
        "FLOAT_TYPE": dedent(
            """
            from fiftyone import ViewField as F
            subsets = {
                "Bright objects": [
                    dict(type="field", expr=F("brightness") > 0.5),
                ],
                "Dark objects": [
                    dict(type="field", expr=F("brightness") < 0.5),
                ]
            }
            """
        ).strip(),
        "TOO_MANY_CATEGORIES": dedent(
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
        "TOO_MANY_INT_CATEGORIES": dedent(
            """
            from fiftyone import ViewField as F
            subsets = {
                "few ints": dict(type="field", expr=F("int_field") > 100),
                "many ints": dict(type="field", expr=F("int_field") <= 100),
            }
            """
        ).strip(),
        "OTHER": dedent(
            """
            from fiftyone import ViewField as F
            subsets = {
                "Sunny unique objects": [
                    dict(type="field", field="tags", value="sunny"),
                    dict(type="field", expr=F("uniqueness") > 0.75),
                ],
                "Rainy common objects": [
                    dict(type="field", field="tags", value="rainy"),
                    dict(type="field", expr=F("uniqueness") < 0.25),
                ]
            }
        """
        ).strip(),
    }
    return examples.get(reason, "")
