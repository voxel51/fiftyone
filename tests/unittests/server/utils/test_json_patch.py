"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import dataclasses
from typing import Any, Literal
from unittest import mock

import pytest


from fiftyone.server.utils import json_patch


@dataclasses.dataclass
class Name:
    """A person's name."""

    given: str
    family: str


@dataclasses.dataclass
class Pet:
    """A pet."""

    name: str
    type: Literal["cat", "dog", "fish"]
    meta: dict[str, Any] = dataclasses.field(default_factory=lambda: {})


@dataclasses.dataclass
class Person:
    """A person."""

    name: Name
    age: int
    pets: list[Pet]

    def __setattr__(self, name, value):
        if name not in [
            field.name for field in dataclasses.fields(self.__class__)
        ]:
            raise AttributeError(f"Cannot set attribute {name}")
        super().__setattr__(name, value)

    def __delattr__(self, name):
        raise AttributeError(f"Deletion of '{name}' is not allowed.")


@pytest.fixture(name="person")
def fixture_person():
    """Returns an example Person."""
    return Person(
        name=Name(given="Alice", family="Smith"),
        age=30,
        pets=[
            Pet(name="Fluffy", type="cat", meta={"color": "white"}),
            Pet(name="Spot", type="dog"),
        ],
    )


class TestDelValue:
    """Tests for json_patch.delvalue."""

    @staticmethod
    def test_attribute_err(person: Person):
        """Tests that AttributeError is raised for invalid attributes."""
        with pytest.raises(AttributeError):
            #####
            json_patch.delvalue(person, "random")
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        """Tests that ValueError is raised for invalid list indices."""

        with pytest.raises(ValueError):
            #####
            json_patch.delvalue(person.pets, key)
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        """Tests that IndexError is raised for out-of-bounds indices."""

        with pytest.raises(IndexError):
            #####
            json_patch.delvalue(person.pets, str(idx))
            #####

    @staticmethod
    def test_delattr(person: Person):
        """Tests that attributes is deleted."""
        src = person.pets[0]

        name = "type"

        assert src.type
        assert hasattr(src, name)

        #####
        json_patch.delvalue(src, name)
        #####

        assert not hasattr(src, name)

    @staticmethod
    def test_delitem(person: Person):
        """Tests that dict items are deleted."""

        src = person.pets[0].meta
        key = "color"

        assert key in src

        #####
        json_patch.delvalue(src, key)
        #####

        assert key not in src

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_delitem(idx: int, person: Person):
        """Tests that list items are deleted."""

        src = person.pets
        length = len(src)
        value = src[idx]

        #####
        json_patch.delvalue(src, str(idx))
        #####

        assert len(src) == length - 1
        assert value not in src


class TestGetValue:
    """Tests for json_patch.getvalue."""

    @staticmethod
    def test_attribute_err(person: Person):
        """Tests that AttributeError is raised for invalid attributes."""

        with pytest.raises(AttributeError):
            #####
            json_patch.getvalue(person, "random")
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        """Tests that ValueError is raised for invalid list indices."""

        with pytest.raises(ValueError):
            #####
            json_patch.getvalue(person.pets, key)
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        """Tests that IndexError is raised for out-of-bounds indices."""

        with pytest.raises(IndexError):
            #####
            json_patch.getvalue(person.pets, str(idx))
            #####

    @staticmethod
    def test_getattr(person: Person):
        """Tests that attributes are retrieved."""
        src = person.pets[0]

        #####
        res = json_patch.getvalue(src, "name")
        #####

        assert res == src.name

    @staticmethod
    def test_getitem(person: Person):
        """Tests that dict items are retrieved."""

        src = person.pets[0].meta
        key = "color"

        #####
        res = json_patch.getvalue(src, key)
        #####

        assert res == src[key]

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_getitem(idx: int, person: Person):
        """Tests that list items are retrieved."""

        src = person.pets

        #####
        res = json_patch.getvalue(src, str(idx))
        #####

        assert res == src[idx]


class TestSetValue:
    """Tests for json_patch.setvalue."""

    @staticmethod
    def test_attribute_err(person: Person):
        """Tests that AttributeError is raised for invalid attributes."""

        with pytest.raises(AttributeError):
            #####
            json_patch.setvalue(person, "random", mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        """Tests that ValueError is raised for invalid list indices."""

        with pytest.raises(ValueError):
            #####
            json_patch.setvalue(person.pets, key, mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        """Tests that IndexError is raised for out-of-bounds indices."""

        with pytest.raises(IndexError):
            #####
            json_patch.setvalue(person.pets, str(idx), mock.Mock())
            #####

    @staticmethod
    def test_setattr_new(person: Person):
        """Tests that new attributes are set."""
        src = person.pets[0]
        name = "random"

        assert not hasattr(src, name)

        #####
        json_patch.setvalue(src, name, value := mock.Mock())
        #####

        assert hasattr(src, name)
        assert getattr(src, name) == value

    @staticmethod
    def test_setitem_existing(person: Person):
        """Tests that existing dict items are set."""
        src = person.pets[0].meta
        key = "color"

        assert key in src
        original_value = src[key]

        #####
        json_patch.setvalue(src, key, value := mock.Mock())
        #####

        assert key in src
        assert src[key] != original_value
        assert src[key] == value

    @staticmethod
    def test_setitem_new(person: Person):
        """Tests that new dict items are set."""
        src = person.pets[0].meta
        key = "random"

        assert key not in src

        #####
        json_patch.setvalue(src, key, value := mock.Mock())
        #####

        assert key in src
        assert src[key] == value

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1, 2])
    def test_list_setitem(idx: int, person: Person):
        """Tests that list items are set."""
        src = person.pets
        length = len(src)

        #####
        json_patch.setvalue(src, str(idx), value := mock.Mock())
        #####

        assert len(src) == length + 1
        assert src[idx] == value


class TestOperations:
    """Tests for json_patch.Patch and subclasses."""

    @staticmethod
    @pytest.fixture(name="delvalue")
    def fixture_delvalue():
        """Fixtures for delvalue calls. This method is tested more thoroughly
        elsewhere."""

        with mock.patch.object(json_patch, "delvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="getvalue")
    def fixture_getvalue():
        """Fixtures for getvalue calls. This method is tested more thoroughly
        elsewhere."""

        with mock.patch.object(json_patch, "getvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="setvalue")
    def fixture_setvalue():
        """Fixtures for setvalue calls. This method is tested more thoroughly
        elsewhere."""

        with mock.patch.object(json_patch, "setvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="src")
    def fixture_src():
        """Returns a mock source object."""
        return mock.Mock()

    class TestAdd:
        """Tests for json_patch.Add."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Add patch."""
            return json_patch.Add(path="/a/b/c", value=mock.Mock())

        @staticmethod
        def test_path_is_root(patch, src):
            """Tests that adding at the root replaces the object."""
            patch.path = "/"

            ####
            res = patch.apply(src)
            ####

            assert res == patch.value

        @staticmethod
        def test_path_err(getvalue, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""

            for i in range(len(patch.path_parts) - 1):
                side_effect = [mock.Mock() for _ in range(i)] + [
                    Exception("Uh oh!")
                ]
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_append(getvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the operation fails."""

            patch.path = "/a/b/c/-"
            getvalue.return_value = [1, 2, 3]

            #####
            res = patch.apply(src)
            #####

            assert not setvalue.called
            assert len(getvalue.return_value) == 4
            assert getvalue.return_value[-1] == patch.value

            assert res == src

        @staticmethod
        def test_value_err(getvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the operation fails."""

            setvalue.side_effect = Exception("Uh oh!")

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            setvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1], patch.value
            )

        @staticmethod
        def test_ok(getvalue, setvalue, patch, src):
            """Tests that valid Add operations succeed."""

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(patch.path_parts) - 1
            setvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1], patch.value
            )

            assert res == src

    class TesCopy:
        """Tests for json_patch.Copy."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Copy patch."""
            return json_patch.Copy(path="/a/b/c", from_="/d/e/f")

        @pytest.fixture(name="getvalue_calls")
        def getvalue_calls(self, patch):
            """Returns a list of mock return values for getvalue calls."""
            return [mock.Mock() for _ in range(len(patch.from_parts))] + [
                mock.Mock() for _ in range(len(patch.path_parts) - 1)
            ]

        @staticmethod
        def test_path_is_root(patch, src):
            """Test that attempting to copy to the root raises ValueError."""

            patch.path = "/"

            with pytest.raises(ValueError):
                ####
                patch.apply(src)
                ####

        @staticmethod
        def test_from_path_err(getvalue, getvalue_calls, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid 'from' paths."""

            for i in range(len(patch.from_parts)):
                getvalue_calls[i] = Exception("Uh oh!")
                getvalue.side_effect = getvalue_calls

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_path_err(getvalue, getvalue_calls, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""

            from_part_length = len(patch.from_parts)

            for i in range(len(patch.path_parts)):
                getvalue_calls[from_part_length + i] = Exception("Uh oh!")
                getvalue.side_effect = getvalue_calls

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == from_part_length + i + 1
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_value_err(getvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the operation fails."""

            setvalue.side_effect = Exception("Uh oh!")

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            setvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1], patch.value
            )

        @staticmethod
        def test_ok(getvalue, setvalue, patch, src):
            """Tests that valid Copy operations succeed."""

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(patch.path_parts) - 1
            setvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1], patch.value
            )

            assert res == src

    class TestMove:
        """Tests for json_patch.Move."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Move patch."""
            return json_patch.Move(path="/d/e/f", from_="/a/b/c")

        @staticmethod
        def test_path_is_root(patch, src):
            """Test that attempting to move to the root raises ValueError."""
            patch.path = "/"

            with pytest.raises(ValueError):
                ####
                patch.apply(src)
                ####

        @staticmethod
        def test_from_path_err(getvalue, delvalue, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid 'from' paths."""
            for i in range(len(patch.from_parts)):
                side_effect = [mock.Mock() for _ in range(i)] + [
                    Exception("Uh oh!")
                ]
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not delvalue.called
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_path_err(getvalue, delvalue, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""

            from_part_length = len(patch.from_parts)

            for i in range(len(patch.path_parts) - 1):
                side_effect = (
                    [mock.Mock() for _ in range(len(patch.from_parts))]
                    + [mock.Mock() for _ in range(i)]
                    + [Exception("Uh oh!")]
                )
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == from_part_length + i + 1
                assert not delvalue.called
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_value_err_delvalue(getvalue, delvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the deleting part of
            the operation fails."""

            from_calls = [mock.Mock() for _ in range(len(patch.from_parts))]
            dest_calls = [
                mock.Mock() for _ in range(len(patch.path_parts) - 1)
            ]
            side_effect = from_calls + dest_calls
            getvalue.side_effect = side_effect

            delvalue.side_effect = Exception("Uh oh!")

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            delvalue.assert_called_once_with(
                from_calls[-2], patch.from_parts[-1]
            )
            assert not setvalue.called

        @staticmethod
        def test_value_err_setvalue(getvalue, delvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the set part of
            the operation fails and that the original value is restored."""

            from_calls = [mock.Mock() for _ in range(len(patch.from_parts))]
            dest_calls = [
                mock.Mock() for _ in range(len(patch.path_parts) - 1)
            ]
            side_effect = from_calls + dest_calls
            getvalue.side_effect = side_effect

            setvalue.side_effect = [Exception("Uh oh!"), mock.Mock()]

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            delvalue.assert_called_once_with(
                from_calls[-2], patch.from_parts[-1]
            )

            setvalue.assert_has_calls(
                [
                    mock.call(
                        dest_calls[-1],
                        patch.path_parts[-1],
                        from_calls[-1],
                    ),
                    mock.call(
                        from_calls[-2],
                        patch.path_parts[-1],
                        from_calls[-1],
                    ),
                ]
            )

        @staticmethod
        def test_ok(getvalue, delvalue, setvalue, patch, src):
            """Tests that valid Move operations succeed."""

            from_calls = [mock.Mock() for _ in range(len(patch.from_parts))]
            dest_calls = [
                mock.Mock() for _ in range(len(patch.path_parts) - 1)
            ]
            side_effect = from_calls + dest_calls
            getvalue.side_effect = side_effect

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(from_calls) + len(dest_calls)
            delvalue.assert_called_once_with(
                from_calls[-2], patch.from_parts[-1]
            )
            setvalue.assert_called_once_with(
                dest_calls[-1],
                patch.path_parts[-1],
                from_calls[-1],
            )
            assert res == src

    class TestRemove:
        """Tests for json_patch.Remove."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Remove patch."""
            return json_patch.Remove(path="/a/b/c")

        @staticmethod
        def test_path_is_root(patch, src):
            """Test that attempting to remove the root raises ValueError."""
            patch.path = "/"

            with pytest.raises(ValueError):
                ####
                patch.apply(src)
                ####

        @staticmethod
        def test_path_err(getvalue, delvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""
            for i in range(len(patch.path_parts)):
                side_effect = [mock.Mock() for _ in range(i)] + [
                    Exception("Uh oh!")
                ]
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not delvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_value_err(getvalue, delvalue, patch, src):
            """Tests that ValueError is raised for when the operation fails."""

            delvalue.side_effect = Exception("Uh oh!")

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            delvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1]
            )

        @staticmethod
        def test_ok(getvalue, delvalue, patch, src):
            """Tests that valid Remove operations succeed."""

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(patch.path_parts)
            delvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1]
            )

            assert res == src

    class TestReplace:
        """Tests for json_patch.Replace."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Replace patch."""
            return json_patch.Replace(path="/a/b/c", value=mock.Mock())

        @staticmethod
        def test_path_is_root(patch, src):
            """Test that attempting to replace the root raises ValueError."""
            patch.path = "/"

            with pytest.raises(ValueError):
                ####
                patch.apply(src)
                ####

        @staticmethod
        def test_path_err(getvalue, delvalue, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""

            for i in range(len(patch.path_parts)):
                side_effect = [mock.Mock() for _ in range(i)] + [
                    Exception("Uh oh!")
                ]
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not delvalue.called
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_value_err_delvalue(getvalue, delvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the deleting part of
            the patch fails."""

            delvalue.side_effect = Exception("Uh oh!")

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            delvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1]
            )
            assert not setvalue.called

        @staticmethod
        def test_value_err_setvalue(getvalue, delvalue, setvalue, patch, src):
            """Tests that ValueError is raised for when the set part of
            the patch fails. Also tests that the original value is restored."""

            setvalue.side_effect = [Exception("Uh oh!"), mock.Mock()]

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            delvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1]
            )

            setvalue.assert_has_calls(
                [
                    mock.call(
                        getvalue.return_value,
                        patch.path_parts[-1],
                        patch.value,
                    ),
                    mock.call(
                        getvalue.return_value,
                        patch.path_parts[-1],
                        getvalue.return_value,
                    ),
                ]
            )

        @staticmethod
        def test_ok(getvalue, delvalue, setvalue, patch, src):
            """Tests that valid Replace operations succeed."""

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(patch.path_parts)
            delvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1]
            )
            setvalue.assert_called_once_with(
                getvalue.return_value, patch.path_parts[-1], patch.value
            )
            assert res == src

    class TestTest:
        """Tests for json_patch.Test."""

        @staticmethod
        @pytest.fixture(name="patch")
        def fixture_patch():
            """Returns an example Test patch."""
            return json_patch.Test(path="/a/b/c", value=mock.Mock())

        @staticmethod
        def test_path_is_root_err(patch, src):
            """Tests that ValueError is raised when the test fails."""
            patch.path = "/"

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

        @staticmethod
        def test_path_is_root_ok(patch, src):
            """Tests no error when the test succeeds."""
            patch.path = "/"
            patch.value = src

            ####
            res = patch.apply(src)
            ####

            assert res == patch.value

        @staticmethod
        def test_path_err(getvalue, setvalue, patch, src):
            """Tests that AttributeError is raised for invalid paths."""

            for i in range(len(patch.path_parts)):
                side_effect = [mock.Mock() for _ in range(i)] + [
                    Exception("Uh oh!")
                ]
                getvalue.side_effect = side_effect

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == i + 1
                assert not setvalue.called
                getvalue.reset_mock()

        @staticmethod
        def test_err(getvalue, patch, src):
            """Tests that ValueError is raised when the test fails."""

            with pytest.raises(ValueError):
                #####
                patch.apply(src)
                #####

            assert getvalue.call_count == len(patch.path_parts)

        @staticmethod
        def test_ok(getvalue, patch, src):
            """Tests no error when the test succeeds."""

            getvalue.return_value = patch.value

            #####
            res = patch.apply(src)
            #####

            assert getvalue.call_count == len(patch.path_parts)

            assert res == src


class TestParse:
    """Tests for json_patch.parse."""

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
                json_patch.parse(patch)
                #####

    @staticmethod
    def test_unsupported(patches):
        """Tests that unsupported operations raise TypeError."""

        invalid_patch = patches[0].copy()
        invalid_patch["op"] = "invalid"

        with pytest.raises(TypeError):
            #####
            json_patch.parse(invalid_patch)
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
                json_patch.parse(patch)
                #####

    @staticmethod
    def test_invalid_path(patches):
        """Tests that invalid patches raise ValueError."""

        patch = patches[0]
        patch["path"] = patch["path"][1:]

        with pytest.raises(ValueError):
            #####
            json_patch.parse(patch)
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
                json_patch.parse(patch, transform_fn=transform_fn)
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
            res = json_patch.parse(patch, transform_fn=transform_fn)
            #####

            assert isinstance(res, json_patch.Patch)
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
        res = json_patch.parse(patches, transform_fn=transform_fn)
        #####

        assert isinstance(res, list)

        for i, patch in enumerate(res):
            assert isinstance(patch, json_patch.Patch)

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
