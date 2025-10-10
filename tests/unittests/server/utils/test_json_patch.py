"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

class TestParse:

    @staticmethod
    def test_one():

        #####
        res = json_patch.parse(
            {"op": "replace", "path": "/x/y/0", "value": 42}
        )
        #####

        assert isinstance(res, json_patch.Patch)

    @staticmethod
    def test_many():

        #####
        res = json_patch.parse(
            {"op": "replace", "path": "/x/y/0", "value": 42},
            {"op": "add", "path": "/x/y", "value": 100},
            {"op": "remove", "path": "/x/y/0"},
        )
        #####

        assert isinstance(res, list)
        assert len(res) == 3

        for p in res:
            assert isinstance(p, json_patch.Patch)

"""

import dataclasses
from typing import Any, Literal, Type
from unittest import mock

import pytest

from fiftyone.server.utils import json_patch


@dataclasses.dataclass
class Name:
    """A person's name."""

    given: str
    family: int


@dataclasses.dataclass
class Pet:
    """A pet's information."""

    name: str
    type: Literal["cat", "dog", "fish"]
    meta: dict[str, Any] = dataclasses.field(default_factory=lambda: {})


@dataclasses.dataclass
class Person:
    """A person's information."""

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
    """An example person."""

    return Person(
        name=Name(given="Alice", family="Smith"),
        age=30,
        pets=[
            Pet(name="Fluffy", type="cat", meta={"color": "white"}),
            Pet(name="Spot", type="dog"),
        ],
    )


# class TestCommon:
#     """Tests common functionality."""

#     @staticmethod
#     @pytest.mark.parametrize(
#         "patch",
#         (
#             json_patch.Add(
#                 path="/person/private/social_security_number",
#                 value="000-00-0000",
#             ),
#             json_patch.Replace(
#                 path="/person/private/social_security_number",
#                 value="000-00-0000",
#             ),
#             json_patch.Remove(path="/person/private/social_security_number"),
#         ),
#     )
#     def test_no_path_resolution(patch: json_patch.Patch, person: Person):
#         """Tests when path does not resolve."""

#         with pytest.raises(AttributeError):
#             ####
#             patch.apply(person)
#             ####

#     @pytest.mark.parametrize("patch_cls", (json_patch.Add, json_patch.Replace))
#     class TestAddAndReplace:
#         """Tests JSON patch add and replace."""

#         class TestLists:
#             """Tests adding to lists."""

#             @staticmethod
#             def test_bad_idx_value(
#                 patch_cls: Type[json_patch.Patch], person: Person
#             ):
#                 """Tests adding with a non-integer index."""
#                 patch = patch_cls(
#                     path="/person/pets/not_an_index",
#                     value=Pet(name="Goldie", type="fish"),
#                 )

#                 with pytest.raises(AttributeError):
#                     #####
#                     patch.apply(person)
#                     #####

#             @staticmethod
#             @pytest.mark.parametrize("idx", [-1, 3])
#             def test_idx_out_of_bounds(
#                 idx: int, patch_cls: Type[json_patch.Patch], person: Person
#             ):
#                 """Tests adding with an out-of-bounds index."""
#                 patch = patch_cls(
#                     path=f"/pets/{idx}",
#                     value=Pet(name="Goldie", type="fish"),
#                 )

#                 with pytest.raises(AttributeError):
#                     #####
#                     patch.apply(person)
#                     #####

#             @staticmethod
#             @pytest.mark.parametrize("idx", [0, 1])
#             def test_upsert(
#                 idx: int, patch_cls: Type[json_patch.Patch], person: Person
#             ):
#                 """Tests adding with a valid index to insert."""
#                 value = Pet(name="Goldie", type="fish")

#                 patch = patch_cls(path=f"/pets/{idx}", value=value)

#                 expected_len = len(person.pets)
#                 if patch_cls is json_patch.Add:
#                     expected_len += 1

#                 print(person.pets)

#                 #####
#                 res = patch.apply(person)
#                 #####

#                 assert res == person
#                 assert len(res.pets) == expected_len
#                 assert res.pets[idx] == value

#         class TestDict:
#             """Tests adding to dicts."""

#             @staticmethod
#             def test_replace_value(
#                 patch_cls: Type[json_patch.Patch], person: Person
#             ):
#                 """Tests replace a key in a dict."""

#                 value = "white with spots"
#                 patch = patch_cls(path="/pets/0/meta/color", value=value)

#                 assert person.pets[0].meta["color"] != value

#                 #####
#                 res = patch.apply(person)
#                 #####

#                 assert res == person
#                 assert person.pets[0].meta["color"] == value

#         class TestObject:
#             """Tests adding to objects."""

#             @staticmethod
#             def test_replace_value(
#                 patch_cls: Type[json_patch.Patch], person: Person
#             ):
#                 """Tests replace a key in a dict."""

#                 value = "dog"
#                 patch = patch_cls(path="/pets/0/type", value=value)

#                 assert person.pets[0].type != value

#                 #####
#                 res = patch.apply(person)
#                 #####

#                 assert res == person
#                 assert person.pets[0].type == value


class TestAdd:
    """Tests JSON patch add."""

    class TestApply:
        """Tests apply."""

        @staticmethod
        def test_full_replace(person: Person):
            """Tests adding at the root path."""

            value = mock.Mock()

            patch = json_patch.Add(path="/", value=value)

            ####
            res = patch.apply(person)
            ####

            assert res == value

        @staticmethod
        def test_list_append(person: Person):
            """Tests adding with the special '-' index to append."""
            value = Pet(name="Goldie", type="fish")

            patch = json_patch.Add(path="/pets/-", value=value)

            #####
            res = patch.apply(person)
            #####

            assert res == person
            assert len(res.pets) == 3
            assert res.pets[-1] == value

        @staticmethod
        def test_new_dict_value(person: Person):
            """Tests adding a new key to a dict."""

            value = "value"
            patch = json_patch.Add(path="/pets/0/meta/random", value=value)

            assert "random" not in person.pets[0].meta

            #####
            res = patch.apply(person)
            #####

            assert res == person
            assert person.pets[0].meta["random"] == value

        class TestObject:
            """Tests adding to objects."""

            @staticmethod
            def test_new_value(person: Person):
                """Tests adding a new attribute to an object."""

                value = "value"
                patch = json_patch.Add(path="/pets/0/random", value=value)

                assert not hasattr(person.pets[0], "random")

                #####
                res = patch.apply(person)
                #####

                assert res == person
                assert getattr(person.pets[0], "random") == value

            @staticmethod
            def test_new_value_set_forbidden(person: Person):
                """Tests adding a new attribute to an object forbidden."""

                value = "value"
                patch = json_patch.Add(path="/random", value=value)

                assert not hasattr(person, "random")

                with pytest.raises(ValueError):
                    #####
                    patch.apply(person)
                    #####


class TestRemove:
    """Tests JSON patch remove."""

    class TestApply:
        """Tests apply."""

        @staticmethod
        def test_no_parent(person: Person):
            """Tests the parent field does not exist."""

            patch = json_patch.Remove(
                path="/person/private/social_security_number"
            )

            with pytest.raises(AttributeError):
                ####
                patch.apply(person)
                ####

        class TestLists:
            """Tests adding to lists."""

            @staticmethod
            def test_bad_idx_value(person: Person):
                """Tests adding with a non-integer index."""
                patch = json_patch.Remove(path="/person/pets/not_an_index")

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(person)
                    #####

            @staticmethod
            @pytest.mark.parametrize("idx", [-1, 3])
            def test_idx_out_of_bounds(idx: int, person: Person):
                """Tests adding with an out-of-bounds index."""
                patch = json_patch.Remove(path=f"/pets/{idx}")

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(person)
                    #####

            @staticmethod
            @pytest.mark.parametrize("idx", [0, 1])
            def test_remove(idx: int, person: Person):
                """Tests adding with a valid index to insert."""

                patch = json_patch.Remove(path=f"/pets/{idx}")
                value = person.pets[idx]

                #####
                res = patch.apply(person)
                #####

                assert res == person
                assert len(person.pets) == 1
                assert value not in person.pets

        class TestDict:
            """Tests adding to dicts."""

            @staticmethod
            def test_remove(person: Person):
                """Tests remove a key in a dict."""

                patch = json_patch.Remove(path="/pets/0/meta/color")

                assert "color" in person.pets[0].meta

                #####
                res = patch.apply(person)
                #####

                assert res == person
                assert "color" not in person.pets[0].meta

            @staticmethod
            def test_remove_does_not_exist(person: Person):
                """Tests remove as no-op"""

                patch = json_patch.Remove(path="/pets/0/meta/random")

                assert "random" not in person.pets[0].meta

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(person)
                    #####

        class TestObject:
            """Tests adding to objects."""

            @staticmethod
            def test_remove(person: Person):
                """Tests remove an attribute."""

                patch = json_patch.Remove(path="/pets/0/type")

                assert hasattr(person.pets[0], "type")

                #####
                res = patch.apply(person)
                #####

                assert res == person
                assert not hasattr(person.pets[0], "type")

            @staticmethod
            def test_remove_does_not_exist(person: Person):
                """Tests remove an attribute no-op."""

                patch = json_patch.Remove(path="/pets/0/random")

                assert not hasattr(person.pets[0], "random")

                with pytest.raises(AttributeError):
                    #####
                    patch.apply(person)
                    #####

            @staticmethod
            def test_remove_forbidden(person: Person):
                """Tests remove an attribute when forbidden."""

                patch = json_patch.Remove(path="/name")

                assert hasattr(person, "name")

                with pytest.raises(ValueError):
                    #####
                    patch.apply(person)
                    #####


class TestReplace:
    """Tests JSON patch replace."""

    class TestApply:
        """Tests apply."""

        @staticmethod
        def test_list_append(person: Person):
            """Tests adding with the special '-' index to append."""
            value = Pet(name="Goldie", type="fish")

            patch = json_patch.Add(path="/pets/-", value=value)

            #####
            res = patch.apply(person)
            #####

            assert res == person
            assert len(res.pets) == 3
            assert res.pets[-1] == value

        @staticmethod
        def test_new_dict_value(person: Person):
            """Tests adding a new key to a dict."""

            value = "value"
            patch = json_patch.Add(path="/pets/0/meta/random", value=value)

            patch = json_patch.Add(path="/", value="Test")

            assert "random" not in person.pets[0].meta

            #####
            res = patch.apply(person)
            #####

            assert res == person
            assert person.pets[0].meta["random"] == value

        class TestObject:
            """Tests adding to objects."""

            @staticmethod
            def test_new_value(person: Person):
                """Tests adding a new attribute to an object."""

                value = "value"
                patch = json_patch.Add(path="/pets/0/random", value=value)

                assert not hasattr(person.pets[0], "random")

                #####
                res = patch.apply(person)
                #####

                assert res == person
                assert getattr(person.pets[0], "random") == value

            @staticmethod
            def test_new_value_set_forbidden(person: Person):
                """Tests adding a new attribute to an object forbidden."""

                value = "value"
                patch = json_patch.Add(path="/random", value=value)

                assert not hasattr(person, "random")

                with pytest.raises(ValueError):
                    #####
                    patch.apply(person)
                    #####
