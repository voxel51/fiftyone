"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock


import pytest

from fiftyone.server.utils.json.jsonpatch import methods, patch


@pytest.mark.parametrize(
    "patch_instance",
    [
        pytest.param(instance, id=instance.__class__.__name__)
        for instance in (
            patch.Add(path="/a/b/c/", value=mock.Mock()),
            patch.Copy(path="/a/b/c/", from_="/d/e/f"),
            patch.Move(path="/a/b/c/", from_="/d/e/f"),
            patch.Remove(path="/a/b/c/"),
            patch.Replace(path="/a/b/c/", value=mock.Mock()),
            patch.Test(path="/a/b/c/", value=mock.Mock()),
        )
    ],
)
def test_helper_classes(patch_instance: patch.Patch):
    """Tests that Add helper class works as expected."""
    with mock.patch.object(
        methods, patch_instance.__class__.__name__.lower()
    ) as m:
        #####
        res = patch_instance.apply(src := mock.Mock())
        #####

        # pylint: disable-next=protected-access
        args = [src, patch_instance._pointer]

        if hasattr(patch_instance, "value"):
            args.append(patch_instance.value)

        if hasattr(patch_instance, "from_"):
            # pylint: disable-next=protected-access
            args.append(patch_instance._from_pointer)

        m.assert_called_once_with(*args)
        assert res == m.return_value
