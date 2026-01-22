"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import dataclasses
from typing import Any, Literal, Union
from unittest import mock

import jsonpointer
import pytest

from fiftyone.server.utils.json.jsonpatch import RootDeleteError, methods
from fiftyone.server.utils.json.jsonpatch.methods import (
    get,
    add,
    remove,
    test as _test,  # avoid pytest auto adding 'test' as a case
    replace,
    copy,
    move,
)


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


class TestGet:
    """Tests for get."""

    @staticmethod
    def test_attribute_err(person: Person):
        """Tests error is raised for invalid attributes."""

        with pytest.raises(AttributeError):
            #####
            get(person, "/random")
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        """Tests error is raised for invalid list indices."""

        with pytest.raises(AttributeError):
            #####
            get(person, f"/pets/{key}")
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 2])
    def test_index_err(idx: int, person: Person):
        """Tests error is raised for out-of-bounds indices."""

        with pytest.raises(AttributeError):
            #####
            get(person, f"/pets/{str(idx)}")
            #####

    @staticmethod
    def test_getattr(person: Person):
        """Tests that attributes are retrieved."""
        #####
        res = get(person, "/pets/0/name")
        #####

        assert res == person.pets[0].name

    @staticmethod
    def test_getitem(person: Person):
        """Tests that dict items are retrieved."""

        #####
        res = get(person, "/pets/0/meta/color")
        #####

        assert res == person.pets[0].meta["color"]

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_getitem(idx: int, person: Person):
        """Tests that list items are retrieved."""

        #####
        res = get(person, f"/pets/{idx}")
        #####

        assert res == person.pets[idx]


class TestAdd:
    """Tests for add."""

    @staticmethod
    def test_path_is_root(person: Person):
        """Tests that adding at the root replaces the object."""

        ####
        res = add(person, "", value := mock.Mock)
        ####

        assert res == value

    @staticmethod
    def test_path_err(person: Person):
        """Tests that AttributeError is raised for invalid paths."""

        with pytest.raises(AttributeError):
            #####
            add(person, "/a/b/c", mock.Mock)
            #####

    @staticmethod
    def test_cannot_set_attribute(person: Person):
        """Tests error is raised for invalid attributes."""

        with pytest.raises(ValueError):
            #####
            add(person, "/random", mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_bad_index(key: str, person: Person):
        """Tests error is raised for invalid list indices."""

        with pytest.raises(ValueError):
            #####
            add(person, f"/pets/{key}", mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 3])
    def test_index_out_of_bounds(idx: int, person: Person):
        """Tests error is raised for out-of-bounds indices."""

        with pytest.raises(ValueError):
            #####
            add(person, f"/pets/{str(idx)}", mock.Mock())
            #####

    @staticmethod
    def test_set_attribute(person: Person):
        """Tests that new attributes are set."""

        assert not hasattr(person.pets[0], "random")

        #####
        res = add(person, "/pets/0/random", value := mock.Mock())
        #####

        assert person.pets[0].random == value
        assert res == person

    @staticmethod
    def test_set_item_existing(person: Person):
        """Tests that existing dict items are set."""
        original_value = person.pets[0].meta["color"]

        #####
        res = add(person, "/pets/0/meta/color", value := mock.Mock())
        #####

        assert person.pets[0].meta["color"] != original_value
        assert person.pets[0].meta["color"] == value
        assert res == person

    @staticmethod
    def test_set_item_new(person: Person):
        """Tests that new dict items are set."""
        assert "random" not in person.pets[0].meta

        #####
        res = add(person, "/pets/0/meta/random", value := mock.Mock())
        #####

        assert "random" in person.pets[0].meta
        assert person.pets[0].meta["random"] == value
        assert res == person

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_set_item(idx: int, person: Person):
        """Tests that list items are set."""
        length = len(person.pets)

        #####
        res = add(person, f"/pets/{str(idx)}", value := mock.Mock())
        #####

        assert len(person.pets) == length + 1
        assert person.pets[idx] == value
        assert res == person

    @staticmethod
    @pytest.mark.parametrize("idx", ["-", 2])
    def test_append_list_item(idx: Union[str, int], person: Person):
        """Tests that list items are appended when using "-" or the index"""

        #####
        res = add(person, f"/pets/{idx}", value := mock.Mock())
        #####

        assert len(person.pets) == 3
        assert person.pets[-1] == value
        assert res == person


class TestRemove:
    """Tests for remove."""

    @staticmethod
    def test_path_is_root(person: Person):
        """Test that attempting to remove the root raises ValueError."""

        with pytest.raises(RootDeleteError):
            ####
            remove(person, "")
            ####

    @staticmethod
    def test_path_err(person: Person):
        """Tests that AttributeError is raised for invalid paths."""

        with pytest.raises(AttributeError):
            #####
            remove(person, "/a/b/c")
            #####

    @staticmethod
    def test_delete_attribute_forbidden(person: Person):
        """Tests error is raised when deleting attribute is forbidden."""

        with pytest.raises(ValueError):
            #####
            remove(person, "/name")
            #####

    @staticmethod
    def test_delete_attribute(person: Person):
        """Tests that attribute is deleted."""

        assert hasattr(person.pets[0], "type")

        #####
        res = remove(person, "/pets/0/type")
        #####

        assert not hasattr(person.pets[0], "type")
        assert res == person

    @staticmethod
    def test_delete_item(person: Person):
        """Tests that dict items are deleted."""

        assert "color" in person.pets[0].meta

        #####
        res = remove(person, "/pets/0/meta/color")
        #####

        assert "color" not in person.pets[0].meta
        assert res == person

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_delitem(idx: int, person: Person):
        """Tests that list items are deleted."""

        length = len(person.pets)
        value = person.pets[idx]

        #####
        res = remove(person, f"/pets/{str(idx)}")
        #####

        assert len(person.pets) == length - 1
        assert value not in person.pets
        assert res == person


class TestTest:
    """Tests for test."""

    @staticmethod
    def test_err(person: Person):
        """Tests error is raised when the test fails."""

        for path in (
            "",
            "/name/family",
            "/age",
            "/pets",
            "/pets/0",
            "/pets/0/name",
        ):
            with pytest.raises(ValueError):
                #####
                _test(person, path, mock.Mock())
                #####

    @staticmethod
    def test_ok(person: Person):
        """Tests that valid Test operations succeed."""

        for path, value in (
            ("", person),
            ("/name/family", person.name.family),
            ("/age", person.age),
            ("/pets", person.pets),
            ("/pets/0", person.pets[0]),
            ("/pets/0/name", person.pets[0].name),
        ):
            #####
            res = _test(person, path, value)
            #####

            assert res == person


def test_copy():
    """Tests for copy."""

    src = mock.Mock()

    with (
        mock.patch.object(methods, "get") as mock_get,
        mock.patch.object(methods, "add") as mock_add,
    ):
        pointer = jsonpointer.JsonPointer("/a/b/c")
        from_pointer = jsonpointer.JsonPointer("/d/e/f")

        #####
        res = copy(src, pointer, from_pointer)
        #####

        mock_get.assert_called_once_with(src, from_pointer)
        mock_add.assert_called_once_with(src, pointer, mock_get.return_value)
        assert res == src


def test_move():
    """Tests for move."""

    src = mock.Mock()

    with (
        mock.patch.object(methods, "get") as mock_get,
        mock.patch.object(methods, "remove") as mock_remove,
        mock.patch.object(methods, "add") as mock_add,
    ):
        pointer = jsonpointer.JsonPointer("/a/b/c")
        from_pointer = jsonpointer.JsonPointer("/d/e/f")

        #####
        res = move(src, pointer, from_pointer)
        #####

        mock_get.assert_called_once_with(src, from_pointer)
        mock_remove.assert_called_once_with(src, from_pointer)
        mock_add.assert_called_once_with(src, pointer, mock_get.return_value)
        assert res == src


def test_replace():
    """Tests for replace."""

    src = mock.Mock()

    with (
        mock.patch.object(methods, "remove") as mock_remove,
        mock.patch.object(methods, "add") as mock_add,
    ):
        pointer = jsonpointer.JsonPointer("/a/b/c")

        #####
        res = replace(src, pointer, value := mock.Mock())
        #####

        mock_remove.assert_called_once_with(src, pointer)
        mock_add.assert_called_once_with(src, pointer, value)
        assert res == src
