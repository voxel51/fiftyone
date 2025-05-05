import unittest

from fiftyone.utils.torch import GetItem


class DummyGetItem(GetItem):
    def __init__(self, field_mapping=None, **kwargs):
        super().__init__(field_mapping, **kwargs)

    def __call__(self, d):
        return d["foo"] + d["bar"]

    @property
    def required_keys(self):
        return ["foo", "bar"]


class TestGetItem(unittest.TestCase):
    def test_call(self):
        gi = DummyGetItem()
        d = {"foo": 1, "bar": 2}
        self.assertEqual(gi(d), 3)

    def test_required_keys(self):
        gi = DummyGetItem()
        self.assertEqual(set(gi.required_keys), set(["foo", "bar"]))

    def test_default_required_keys(self):
        class DummyGetItem(GetItem):
            pass

        gi = DummyGetItem()
        self.assertEqual(set(gi.required_keys), set())

    def test_default_field_mapping(self):
        gi = DummyGetItem()
        self.assertEqual(gi.field_mapping, {"foo": "foo", "bar": "bar"})

    def test_field_mapping_setter_valid(self):
        gi = DummyGetItem()
        gi.field_mapping = {"foo": "oof", "bar": "rab"}
        self.assertEqual(gi.field_mapping, {"foo": "oof", "bar": "rab"})

    def test_field_mapping_setter_not_in_required_keys(self):
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


if __name__ == "__main__":
    unittest.main()
