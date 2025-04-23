import unittest
from collections import Counter

import fiftyone as fo

from fiftyone.utils.torch import GetItem


class DummyGetItem(GetItem):
    def __init__(self, field_mapping=None, **kwargs):
        super().__init__(field_mapping, **kwargs)
        self.add_required_fields(["foo", "bar"])

    def sample_dict_to_input(self, sample):
        return (
            sample[self.field_mapping["foo"]]
            + sample[self.field_mapping["bar"]]
        )


class TestGetItem(unittest.TestCase):
    def test_call(self):
        gi = DummyGetItem()
        sample = {"foo": 1, "bar": 2}
        self.assertEqual(gi(sample), 3)

    def test_required_fields(self):
        gi = DummyGetItem()
        self.assertEqual(set(gi.required_fields), set(["foo", "bar"]))

    def test_default_required_fields(self):
        class DummyGetItem(GetItem):
            pass

        gi = DummyGetItem()
        self.assertEqual(set(gi.required_fields), set())

    def test_add_required_fields(self):
        gi = DummyGetItem()
        self.assertEqual(set(gi.required_fields), set(["foo", "bar"]))
        gi.add_required_fields("baz")
        self.assertEqual(set(gi.required_fields), set(["foo", "bar", "baz"]))
        gi.add_required_fields("baz")

        gi.add_required_fields("baz")
        self.assertEqual(
            Counter(gi.required_fields), Counter(["foo", "bar", "baz"])
        )

    def test_default_field_mapping(self):
        gi = DummyGetItem()
        self.assertEqual(gi.field_mapping, {"foo": "foo", "bar": "bar"})

    def test_field_mapping_setter_valid(self):
        gi = DummyGetItem()
        gi.field_mapping = {"foo": "oof", "bar": "rab"}
        self.assertEqual(gi.field_mapping, {"foo": "oof", "bar": "rab"})

    def test_field_mapping_setter_not_in_required_fields(self):
        gi = DummyGetItem()
        self.assertRaises(
            ValueError, setattr, gi, "field_mapping", {"oof": "foo"}
        )

    def test_field_mapping_setter_not_dict(self):
        gi = DummyGetItem()
        self.assertRaises(ValueError, setattr, gi, "field_mapping", "foo")

    def test_field_mapping_setter_partial(self):
        gi = DummyGetItem()
        gi.field_mapping = {"foo": "bar"}
        self.assertEqual(gi.field_mapping, {"foo": "bar", "bar": "bar"})

    def test_update_field_mapping(self):
        gi = DummyGetItem()
        self.assertEqual(gi.field_mapping, {"foo": "foo", "bar": "bar"})
        gi.add_required_fields("baz")
        self.assertEqual(
            gi.field_mapping, {"foo": "foo", "bar": "bar", "baz": "baz"}
        )

    def test_validate_compatible_samples(self):
        gi = DummyGetItem()

        samples = [fo.Sample(filepath=f"sample.jpg")]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        self.assertRaises(ValueError, gi.validate_compatible_samples, dataset)

        samples[0]["foo"] = 1
        samples[0].save()
        self.assertRaises(ValueError, gi.validate_compatible_samples, dataset)

        samples[0]["bar"] = 2
        gi.validate_compatible_samples(dataset)

    def test_get_item_mixin(self):
        class DummyGetItemMixin:
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.add_required_fields("baz")

        class DummyGetItemWithMixin(DummyGetItem, DummyGetItemMixin):
            def __call__(self, sample):
                return (
                    sample[self.field_mapping["foo"]]
                    + sample[self.field_mapping["bar"]]
                    + sample[self.field_mapping["baz"]]
                )

        gi = DummyGetItemWithMixin()
        sample = {"foo": 1, "bar": 2, "baz": 3}
        self.assertEqual(gi(sample), 6)


if __name__ == "__main__":
    unittest.main()
