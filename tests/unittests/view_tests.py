"""
FiftyOne view-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import date, datetime, timedelta
import math

import unittest
import numpy as np

import fiftyone as fo
from fiftyone import ViewField as F, VALUE
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg

from decorators import drop_datasets


class SetValuesTests(unittest.TestCase):
    @staticmethod
    def make_dataset():
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="test1.png", int_field=1),
                fo.Sample(filepath="test2.png", int_field=2),
                fo.Sample(filepath="test3.png", int_field=3),
                fo.Sample(filepath="test4.png", int_field=4),
            ]
        )
        return dataset

    @drop_datasets
    def test_set_values_dataset(self):
        dataset = self.make_dataset()
        n = len(dataset)

        int_values = [int(i) for i in range(n)]
        float_values = [float(i) for i in range(n)]
        str_values = [str(i) for i in range(n)]
        classification_values = [
            fo.Classification(label=str(i), custom=float(i)) for i in range(n)
        ]
        classifications_values = [
            fo.Classifications(
                classifications=[
                    fo.Classification(
                        label=str(j),
                        logits=np.random.randn(5),
                        custom=float(j),
                    )
                    for j in range(i)
                ]
            )
            for i in range(n)
        ]
        detections_values = [
            fo.Detections(
                detections=[
                    fo.Detection(
                        label=str(j),
                        bounding_box=list(np.random.rand(4)),
                        custom=float(j),
                    )
                    for j in range(i)
                ]
            )
            for i in range(n)
        ]

        # Set existing field
        dataset.set_values("int_field", int_values)
        _int_values = dataset.values("int_field")
        self.assertListEqual(_int_values, int_values)

        # Test no schema expanding
        with self.assertRaises(ValueError):
            dataset.set_values(
                "float_field", float_values, expand_schema=False
            )

        # Set new primitive field
        dataset.set_values("str_field", str_values)
        schema = dataset.get_field_schema()
        self.assertIn("str_field", schema)
        _str_values = dataset.values("str_field")
        self.assertListEqual(_str_values, str_values)

        # Set new Classification field

        dataset.set_values("classification_field", classification_values)

        schema = dataset.get_field_schema()
        self.assertIn("classification_field", schema)

        _classification_values = dataset.values("classification_field")
        self.assertListEqual(_classification_values, classification_values)

        _label_values = dataset.values("classification_field.label")
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), str)

        _custom_values = dataset.values("classification_field.custom")
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), float)

        # Set new Classifications field

        dataset.set_values("classifications_field", classifications_values)

        schema = dataset.get_field_schema()
        self.assertIn("classifications_field", schema)

        _classifications_values = dataset.values("classifications_field")
        print(_classifications_values[0], classifications_values[0])
        self.assertListEqual(_classifications_values, classifications_values)

        _label_list_values = dataset.values(
            "classifications_field.classifications"
        )
        self.assertEqual(type(_label_list_values), list)
        self.assertEqual(type(_label_list_values[-1]), list)
        self.assertEqual(type(_label_list_values[-1][0]), fo.Classification)

        _label_values = dataset.values(
            "classifications_field.classifications.label"
        )
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), list)
        self.assertEqual(type(_label_values[-1][0]), str)

        _logits_values = dataset.values(
            "classifications_field.classifications.logits"
        )
        self.assertEqual(type(_logits_values), list)
        self.assertEqual(type(_logits_values[-1]), list)
        self.assertEqual(type(_logits_values[-1][0]), np.ndarray)

        _custom_values = dataset.values(
            "classifications_field.classifications.custom"
        )
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), list)
        self.assertEqual(type(_custom_values[-1][0]), float)

        # Set new Detections field

        dataset.set_values("detections_field", detections_values)

        schema = dataset.get_field_schema()
        self.assertIn("detections_field", schema)

        import fiftyone.constants as foc

        print("BEFORE")
        foc.DEV_INSTALL = "GO"
        _detections_values = dataset.values("detections_field")
        print(fo.Detections._fields["detections"].field.fields)
        foc.DEV_INSTALL = True
        print("AFTER")
        self.assertListEqual(_detections_values, detections_values)

        _label_list_values = dataset.values("detections_field.detections")
        self.assertEqual(type(_label_list_values), list)
        self.assertEqual(type(_label_list_values[-1]), list)
        self.assertEqual(type(_label_list_values[-1][0]), fo.Detection)

        _label_values = dataset.values("detections_field.detections.label")
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), list)
        self.assertEqual(type(_label_values[-1][0]), str)

        _bbox_values = dataset.values(
            "detections_field.detections.bounding_box"
        )
        self.assertEqual(type(_bbox_values), list)
        self.assertEqual(type(_bbox_values[-1]), list)
        self.assertEqual(type(_bbox_values[-1][0]), list)

        _custom_values = dataset.values("detections_field.detections.custom")
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), list)
        self.assertEqual(type(_custom_values[-1][0]), float)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
