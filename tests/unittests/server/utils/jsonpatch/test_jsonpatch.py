"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock


import pytest

from fiftyone.server.utils.json import jsonpatch


class TestParse:
    """Tests for jsonpatch .parse."""

    @pytest.fixture(name="patches")
    def fixture_patches(self):
        """Returns a list of example patch dicts."""
        return [
            {"op": "add", "path": "/a/b/c", "value": mock.Mock()},
            {"op": "copy", "path": "/d/e/f", "from": "/a/b/c"},
            {"op": "move", "path": "/d/e/f", "from": "/a/b/c"},
            {"op": "remove", "path": "/x/y/0"},
            {"op": "replace", "path": "/x/y/0", "value": mock.Mock()},
            {"op": "test", "path": "/x/y/0", "value": mock.Mock()},
        ]

    @staticmethod
    def test_missing_common_fields(patches):
        """Tests that 'op' and 'path' are required fields."""
        for key in ("op", "path"):
            patch = patches[0].copy()
            patch.pop(key)

            with pytest.raises(ValueError):
                #####
                jsonpatch.parse(patch)
                #####

    @staticmethod
    def test_unsupported(patches):
        """Tests that unsupported operations raise TypeError."""

        invalid_patch = patches[0].copy()
        invalid_patch["op"] = "invalid"

        with pytest.raises(TypeError):
            #####
            jsonpatch.parse(invalid_patch)
            #####

    @staticmethod
    def test_missing_required_values(patches):
        """Tests that invalid patches raise ValueError."""

        for patch in patches:
            if patch["op"] == "remove":
                continue

            if patch["op"] in ("add", "replace", "test"):
                patch.pop("value")

            if patch["op"] in ("copy", "move"):
                patch.pop("from")

            with pytest.raises(ValueError):
                #####
                jsonpatch.parse(patch)
                #####

    @staticmethod
    def test_invalid_path(patches):
        """Tests that invalid patches raise ValueError."""

        patch = patches[0]
        patch["path"] = patch["path"][1:]

        with pytest.raises(ValueError):
            #####
            jsonpatch.parse(patch)
            #####

    @staticmethod
    def test_bad_transform(patches):
        """Tests that exceptions in transform_fn raise ValueError."""

        transform_fn = mock.Mock()
        transform_fn.side_effect = Exception("Uh oh!")

        for patch in patches:
            if patch["op"] not in ("add", "replace", "test"):
                continue

            with pytest.raises(ValueError):
                #####
                jsonpatch.parse(patch, transform_fn=transform_fn)
                #####

            transform_fn.assert_called_with(patch["value"])

        assert transform_fn.call_count == 3

    @staticmethod
    @pytest.mark.parametrize(
        "transform_fn",
        (
            pytest.param(None, id=""),
            pytest.param(mock.Mock(), id="transform"),
        ),
    )
    def test_ok(transform_fn, patches):
        """Tests that valid patches are parsed correctly."""

        for patch in patches:
            #####
            res = jsonpatch.parse(patch, transform_fn=transform_fn)
            #####

            assert isinstance(res, jsonpatch.Patch)
            res: jsonpatch.Patch
            assert res.op == patch["op"]
            assert res.path == patch["path"]

            if patch["op"] in ("add", "replace", "test"):
                if transform_fn is None:
                    assert res.value == patch["value"]
                else:
                    transform_fn.assert_called_with(patch["value"])
                    assert res.value == transform_fn.return_value

            if patch["op"] in ("copy", "move"):
                assert res.from_ == patch["from"]

    @staticmethod
    @pytest.mark.parametrize(
        "transform_fn",
        (
            pytest.param(None, id=""),
            pytest.param(mock.Mock(), id="transform"),
        ),
    )
    def test_ok_multi(transform_fn, patches):
        """Tests that valid patches are parsed correctly."""

        #####
        res = jsonpatch.parse(patches, transform_fn=transform_fn)
        #####

        assert isinstance(res, list)

        for i, patch in enumerate(res):
            assert isinstance(patch, jsonpatch.Patch)

            assert patch.op == patches[i]["op"]
            assert patch.path == patches[i]["path"]

            if hasattr(patch, "value"):
                if transform_fn is None:
                    assert patch.value == patches[i]["value"]
                else:
                    assert patch.value == transform_fn.return_value

            if hasattr(patch, "from_"):
                assert patch.from_ == patches[i]["from"]

        if transform_fn is not None:
            transform_fn.assert_has_calls(
                [
                    mock.call(patch["value"])
                    for patch in patches
                    if "value" in patch
                ]
            )


class TestIsRootDelete:
    """Tests for jsonpatch.is_root_delete utility function."""

    @pytest.mark.parametrize(
        ("operations", "expected"),
        [
            # True case
            pytest.param(
                [{"op": "remove", "path": "/"}],
                True,
                id="single_remove_at_root",
            ),
            # False cases
            pytest.param(
                [{"op": "remove", "path": "/label"}],
                False,
                id="remove_at_non_root",
            ),
            pytest.param(
                [{"op": "replace", "path": "/", "value": {}}],
                False,
                id="non_remove_at_root",
            ),
            pytest.param(
                [
                    {"op": "remove", "path": "/"},
                    {"op": "add", "path": "/label", "value": "cat"},
                ],
                False,
                id="multiple_ops",
            ),
            pytest.param([], False, id="empty_list"),
            pytest.param([{"op": "remove"}], False, id="missing_path_key"),
            pytest.param(
                [{"op": "remove", "path": None}], False, id="none_path_value"
            ),
        ],
    )
    def test_with_raw_dicts(self, operations, expected):
        """Test is_root_delete with raw dictionary operations."""
        assert jsonpatch.is_root_delete(operations) is expected

    @pytest.mark.parametrize(
        ("operations", "expected"),
        [
            pytest.param(
                [{"op": "remove", "path": "/"}], True, id="remove_at_root"
            ),
            pytest.param(
                [{"op": "remove", "path": "/label"}],
                False,
                id="remove_at_non_root",
            ),
        ],
    )
    def test_with_parsed_patch(self, operations, expected):
        """Test is_root_delete with parsed Patch objects."""
        parsed = jsonpatch.parse(operations)
        assert jsonpatch.is_root_delete(parsed) is expected


class TestApplyRootDeleteError:
    """Tests for RootDeleteError raised by jsonpatch.apply."""

    def test_apply_raises_root_delete_error(self):
        """apply() raises RootDeleteError for root delete operations."""
        target = {"label": "cat"}
        operations = [{"op": "remove", "path": "/"}]

        with pytest.raises(jsonpatch.RootDeleteError):
            jsonpatch.apply(target, operations)

    def test_apply_does_not_raise_for_non_root_delete(self):
        """apply() does not raise RootDeleteError for non-root operations."""
        target = {"label": "cat", "confidence": 0.9}
        operations = [{"op": "remove", "path": "/confidence"}]

        result, errors = jsonpatch.apply(target, operations)
        assert errors == []
        assert "confidence" not in result
        assert "label" in result and result["label"] == "cat"

    def test_apply_does_not_raise_for_multiple_operations(self):
        """apply() does not raise RootDeleteError for multiple operations."""
        target = {"label": "cat"}
        operations = [
            {"op": "remove", "path": "/"},
            {"op": "add", "path": "/label", "value": "dog"},
        ]

        result, errors = jsonpatch.apply(target, operations)
        assert errors == []
        assert "label" in result and result["label"] == "dog"
