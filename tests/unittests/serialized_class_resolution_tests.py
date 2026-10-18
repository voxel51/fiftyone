"""
Tests for how serialized view stages and aggregations name their class: a
name may only ever select a class of that kind that this process defines.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import inspect
import sys

import pytest

import eta.core.utils as etau

import fiftyone.core.aggregations as foa
import fiftyone.core.stages as fosg
import fiftyone.core.utils as fou


def _defined_in(module, base_cls):
    return [
        pytest.param(cls, id=cls.__name__)
        for _, cls in inspect.getmembers(module, inspect.isclass)
        if issubclass(cls, base_cls) and cls.__module__ == module.__name__
    ]


#: Names that are not a class of the expected kind: a builtin, a FiftyOne
#: class of another kind, things in the stages module itself, and malformed
#: names
REFUSED_NAMES = [
    pytest.param("builtins.dict", id="builtin"),
    pytest.param("fiftyone.core.dataset.Dataset", id="fiftyone_class"),
    pytest.param("fiftyone.core.stages.ViewStageError", id="stages_error"),
    pytest.param("fiftyone.core.stages.etau", id="stages_module_attr"),
    pytest.param("fiftyone.core.stages.Match.validate", id="stage_method"),
    pytest.param("Match", id="bare_name"),
    pytest.param("", id="empty"),
]

#: How each kind is deserialized, and what it refuses with
KINDS = [
    pytest.param(fosg.ViewStage, "Unsupported view stage", id="view_stage"),
    pytest.param(foa.Aggregation, "Unsupported aggregation", id="aggregation"),
]


@pytest.mark.parametrize("stage_cls", _defined_in(fosg, fosg.ViewStage))
def test_every_view_stage_resolves_by_name(stage_cls):
    name = etau.get_class_name(stage_cls)

    assert fou.get_subclass(fosg.ViewStage, name) is stage_cls


@pytest.mark.parametrize("aggregation_cls", _defined_in(foa, foa.Aggregation))
def test_every_aggregation_resolves_by_name(aggregation_cls):
    name = etau.get_class_name(aggregation_cls)

    assert fou.get_subclass(foa.Aggregation, name) is aggregation_cls


def test_a_serialized_stage_round_trips():
    rebuilt = fosg.ViewStage._from_dict(fosg.Limit(3)._serialize())

    assert isinstance(rebuilt, fosg.Limit)
    assert rebuilt.limit == 3


def test_a_serialized_aggregation_round_trips():
    rebuilt = foa.Aggregation._from_dict(foa.Count("x")._serialize())

    assert isinstance(rebuilt, foa.Count)
    assert rebuilt.field_name == "x"


@pytest.mark.parametrize("base_cls,message", KINDS)
@pytest.mark.parametrize("name", REFUSED_NAMES)
def test_a_name_of_another_kind_is_refused(base_cls, message, name):
    with pytest.raises(ValueError, match=message):
        base_cls._from_dict({"_cls": name, "kwargs": []})


@pytest.mark.parametrize("base_cls,message", KINDS)
def test_a_view_stage_and_an_aggregation_do_not_stand_in_for_each_other(
    base_cls, message
):
    other = foa.Count if base_cls is fosg.ViewStage else fosg.Limit

    with pytest.raises(ValueError, match=message):
        base_cls._from_dict({"_cls": etau.get_class_name(other), "kwargs": []})


@pytest.mark.parametrize("base_cls,message", KINDS)
def test_an_unknown_module_is_never_imported(
    base_cls, message, tmp_path, monkeypatch
):
    module = "serialized_class_resolution_probe"
    (tmp_path / f"{module}.py").write_text("class Thing:\n    pass\n")
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.delitem(sys.modules, module, raising=False)

    with pytest.raises(ValueError, match=message):
        base_cls._from_dict({"_cls": f"{module}.Thing", "kwargs": []})

    assert module not in sys.modules


def test_a_subclass_defined_elsewhere_resolves():
    class ElsewhereStage(fosg.Limit):
        pass

    name = etau.get_class_name(ElsewhereStage)

    assert fou.get_subclass(fosg.ViewStage, name) is ElsewhereStage
