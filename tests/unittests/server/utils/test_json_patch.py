"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import dataclasses
from typing import Any, Literal, Type
from unittest import mock

import pytest


from fiftyone.server.utils import json_patch


@dataclasses.dataclass
class Name:
    given: str
    family: int


@dataclasses.dataclass
class Pet:
    name: str
    type: Literal["cat", "dog", "fish"]
    meta: dict[str, Any] = dataclasses.field(default_factory=lambda: {})


@dataclasses.dataclass
class Person:
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

    return Person(
        name=Name(given="Alice", family="Smith"),
        age=30,
        pets=[
            Pet(name="Fluffy", type="cat", meta={"color": "white"}),
            Pet(name="Spot", type="dog"),
        ],
    )


class TestDelValue:
    @staticmethod
    def test_attribute_err(person: Person):
        with pytest.raises(AttributeError):
            #####
            json_patch.delvalue(person, "random")
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        with pytest.raises(ValueError):
            #####
            json_patch.delvalue(person.pets, key)
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        with pytest.raises(IndexError):
            #####
            json_patch.delvalue(person.pets, str(idx))
            #####

    @staticmethod
    def test_delattr(person: Person):
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
        src = person.pets
        length = len(src)
        value = src[idx]

        #####
        json_patch.delvalue(src, str(idx))
        #####

        assert len(src) == length - 1
        assert value not in src


class TestGetValue:
    @staticmethod
    def test_attribute_err(person: Person):
        with pytest.raises(AttributeError):
            #####
            json_patch.getvalue(person, "random")
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        with pytest.raises(ValueError):
            #####
            json_patch.getvalue(person.pets, key)
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        with pytest.raises(IndexError):
            #####
            json_patch.getvalue(person.pets, str(idx))
            #####

    @staticmethod
    def test_getattr(person: Person):
        src = person.pets[0]

        #####
        res = json_patch.getvalue(src, "name")
        #####

        assert res == src.name

    @staticmethod
    def test_getitem(person: Person):
        src = person.pets[0].meta
        key = "color"

        #####
        res = json_patch.getvalue(src, key)
        #####

        assert res == src[key]

    @staticmethod
    @pytest.mark.parametrize("idx", [0, 1])
    def test_list_getitem(idx: int, person: Person):
        src = person.pets

        #####
        res = json_patch.getvalue(src, str(idx))
        #####

        assert res == src[idx]


class TestSetValue:
    @staticmethod
    def test_attribute_err(person: Person):
        with pytest.raises(AttributeError):
            #####
            json_patch.setvalue(person, "random", mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("key", ["not_an_index"])
    def test_value_err(key: str, person: Person):
        with pytest.raises(ValueError):
            #####
            json_patch.setvalue(person.pets, key, mock.Mock())
            #####

    @staticmethod
    @pytest.mark.parametrize("idx", [-1, 10])
    def test_index_err(idx: int, person: Person):
        with pytest.raises(IndexError):
            #####
            json_patch.setvalue(person.pets, str(idx), mock.Mock())
            #####

    @staticmethod
    def test_setattr_new(person: Person):
        src = person.pets[0]
        name = "random"

        assert not hasattr(src, name)

        #####
        json_patch.setvalue(src, name, value := mock.Mock())
        #####

        assert hasattr(src, name)
        assert getattr(src, name) == value

    @staticmethod
    def test_setitem_new(person: Person):
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
    def test_setitem_existing(person: Person):
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
        src = person.pets
        length = len(src)

        #####
        json_patch.setvalue(src, str(idx), value := mock.Mock())
        #####

        assert len(src) == length + 1
        assert src[idx] == value


class TestOperations:

    @staticmethod
    @pytest.fixture(name="delvalue")
    def fixture_delvalue():

        with mock.patch.object(json_patch, "delvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="getvalue")
    def fixture_getvalue():

        with mock.patch.object(json_patch, "getvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="setvalue")
    def fixture_setvalue():

        with mock.patch.object(json_patch, "setvalue") as m:
            yield m

    @staticmethod
    @pytest.fixture(name="src")
    def fixture_src():
        return mock.Mock()

    class TestAdd:

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Add(path="/a/b/c", value=mock.Mock())

            @staticmethod
            def test_path_is_root(patch, src):
                patch.path = "/"

                ####
                res = patch.apply(src)
                ####

                assert res == patch.value

            @staticmethod
            def test_path_err(getvalue, setvalue, patch, src):

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
            def test_value_err(getvalue, setvalue, patch, src):

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

                #####
                res = patch.apply(src)
                #####

                assert getvalue.call_count == len(patch.path_parts) - 1
                setvalue.assert_called_once_with(
                    getvalue.return_value, patch.path_parts[-1], patch.value
                )

                assert res == src

    class TesCopy:

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Copy(path="/a/b/c", from_="/d/e/f")

            @pytest.fixture(name="getvalue_calls")
            def getvalue_calls(self, patch):

                return [mock.Mock() for _ in range(len(patch.from_parts))] + [
                    mock.Mock() for _ in range(len(patch.path_parts) - 1)
                ]

            @staticmethod
            def test_path_is_root(patch, src):
                patch.path = "/"

                with pytest.raises(ValueError):
                    ####
                    patch.apply(src)
                    ####

            @staticmethod
            def test_from_path_err(
                getvalue, getvalue_calls, setvalue, patch, src
            ):

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

                #####
                res = patch.apply(src)
                #####

                assert getvalue.call_count == len(patch.path_parts) - 1
                setvalue.assert_called_once_with(
                    getvalue.return_value, patch.path_parts[-1], patch.value
                )

                assert res == src

    class TestMove:

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Move(path="/d/e/f", from_="/a/b/c")

            @staticmethod
            def test_path_is_root(patch, src):
                patch.path = "/"

                with pytest.raises(ValueError):
                    ####
                    patch.apply(src)
                    ####

            @staticmethod
            def test_from_path_err(getvalue, delvalue, setvalue, patch, src):

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
            def test_value_err_delvalue(
                getvalue, delvalue, setvalue, patch, src
            ):
                from_calls = [
                    mock.Mock() for _ in range(len(patch.from_parts))
                ]
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
            def test_value_err_setvalue(
                getvalue, delvalue, setvalue, patch, src
            ):
                from_calls = [
                    mock.Mock() for _ in range(len(patch.from_parts))
                ]
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
                from_calls = [
                    mock.Mock() for _ in range(len(patch.from_parts))
                ]
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

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Remove(path="/a/b/c")

            @staticmethod
            def test_path_is_root(patch, src):
                patch.path = "/"

                with pytest.raises(ValueError):
                    ####
                    patch.apply(src)
                    ####

            @staticmethod
            def test_path_err(getvalue, delvalue, patch, src):

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

                #####
                res = patch.apply(src)
                #####

                assert getvalue.call_count == len(patch.path_parts)
                delvalue.assert_called_once_with(
                    getvalue.return_value, patch.path_parts[-1]
                )

                assert res == src

    class TestReplace:

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Replace(path="/a/b/c", value=mock.Mock())

            @staticmethod
            def test_path_is_root(patch, src):
                patch.path = "/"

                with pytest.raises(ValueError):
                    ####
                    patch.apply(src)
                    ####

            @staticmethod
            def test_path_err(getvalue, delvalue, setvalue, patch, src):

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
            def test_value_err_delvalue(
                getvalue, delvalue, setvalue, patch, src
            ):

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
            def test_value_err_setvalue(
                getvalue, delvalue, setvalue, patch, src
            ):

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

        class TestApply:

            @staticmethod
            @pytest.fixture(name="patch")
            def fixture_patch():
                return json_patch.Test(path="/a/b/c", value=mock.Mock())

            @staticmethod
            def test_path_is_root_err(patch, src):
                patch.path = "/"

                with pytest.raises(ValueError):
                    #####
                    patch.apply(src)
                    #####

            @staticmethod
            def test_path_is_root_ok(patch, src):
                patch.path = "/"
                patch.value = src

                ####
                res = patch.apply(src)
                ####

                assert res == patch.value

            @staticmethod
            def test_path_err(getvalue, setvalue, patch, src):

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

                with pytest.raises(ValueError):
                    #####
                    patch.apply(src)
                    #####

                assert getvalue.call_count == len(patch.path_parts)

            @staticmethod
            def test_ok(getvalue, patch, src):

                getvalue.return_value = patch.value

                #####
                res = patch.apply(src)
                #####

                assert getvalue.call_count == len(patch.path_parts)

                assert res == src


patches = [
    {"op": "add", "path": "/a/b/c", "value": mock.Mock()},
    {"op": "copy", "path": "/d/e/f", "from": "/a/b/c"},
    {"op": "move", "path": "/d/e/f", "from": "/a/b/c"},
    {"op": "remove", "path": "/x/y/0"},
    {"op": "replace", "path": "/x/y/0", "value": mock.Mock()},
    {"op": "test", "path": "/x/y/0", "value": mock.Mock()},
]


class TestParse:
    @staticmethod
    def test_unsupported():
        invalid_patch = patches[0].copy()
        invalid_patch["op"] = "invalid"

        with pytest.raises(TypeError):
            #####
            json_patch.parse(invalid_patch)
            #####

    @staticmethod
    @pytest.mark.parametrize("patch", patches)
    def test_one(patch):
        #####
        res = json_patch.parse(patch)
        #####

        assert isinstance(res, json_patch.Patch)

    @staticmethod
    def test_many():
        #####
        res = json_patch.parse(*patches)
        #####

        assert isinstance(res, list)
        assert len(res) == len(patches)

        for p in res:
            assert isinstance(p, json_patch.Patch)
