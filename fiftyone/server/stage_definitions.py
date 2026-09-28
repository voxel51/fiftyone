"""
FiftyOne Server stage definitions

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

A stage's parameters are declared in Python as a pipe-delimited string of type
alternatives plus a placeholder. This module parses that declaration once, on
the server, so the App receives the alternatives as a list, learns whether a
parameter may be omitted, and learns where its valid values come from.
"""

from enum import Enum
import inspect
import re
import typing as t

import strawberry as gql

from fiftyone.core.stages import _STAGES

# The alternative that makes a parameter nullable
_NONE_TOKEN = "NoneType"

# The alternatives that make a parameter a field path
_FIELD_TOKENS = frozenset({"field", "list<field>"})


@gql.enum
class StageParameterChoiceSource(Enum):
    """Where a stage parameter's valid values come from."""

    FIELDS = "fields"
    GROUP_SLICES = "group_slices"
    CONSTANTS = "constants"
    EVALUATION_KEYS = "evaluation_keys"
    SIMILARITY_KEYS = "similarity_keys"
    FREE_TEXT = "free_text"


@gql.enum
class StageParameterFieldLevel(Enum):
    """The schema a field constraint draws from."""

    ANY = "any"
    SAMPLE = "sample"
    FRAME = "frame"


@gql.enum
class StageParameterFieldExistence(Enum):
    """Whether a field constraint accepts a name that does not exist yet.

    ``EXISTING`` accepts only fields the collection already has.
    ``EXISTING_ROOT`` accepts a new embedded field whose root field exists, as
    a new root field would violate the dataset's schema. ``ANY`` accepts any
    legal field name, because the stage writes the field.
    """

    EXISTING = "existing"
    EXISTING_ROOT = "existing_root"
    ANY = "any"


@gql.type
class StageParameterFieldConstraint:
    """One way a field parameter can be satisfied.

    ``ftypes`` lists the permitted :class:`fiftyone.core.fields.Field` classes,
    matched against a field's type or, for a list field, its subfield type; it
    is empty when any type is permitted. ``labelTypes`` lists the
    :class:`fiftyone.core.labels.Label` classes a label field may hold; it is
    empty when the parameter is not restricted to label fields, so "any label
    field" is spelled as every concrete label class.
    """

    level: StageParameterFieldLevel
    existence: StageParameterFieldExistence
    ftypes: t.List[str]
    label_types: t.List[str]


@gql.type
class StageParameterChoices:
    """The source of a parameter's valid values.

    ``source`` discriminates: ``fields`` is populated only for ``FIELDS``,
    where each entry is an alternative the parameter accepts, and ``values``
    only for ``CONSTANTS``. ``GROUP_SLICES``, ``EVALUATION_KEYS``, and
    ``SIMILARITY_KEYS`` carry no payload because the App resolves them from
    the dataset, and neither does ``FREE_TEXT``.
    """

    source: StageParameterChoiceSource
    fields: t.List[StageParameterFieldConstraint]
    values: t.List[str]


@gql.type
class StageParameter:
    name: str
    type: str
    tokens: t.List[str]
    nullable: bool
    required: bool
    choices: StageParameterChoices
    default: t.Optional[str] = None
    placeholder: t.Optional[str] = None
    description: t.Optional[str] = None


@gql.type
class StageDefinition:
    """A view stage and its parameters.

    ``mediaTypes`` names the media types the stage applies to and is empty when
    it applies to any, so a caller offering stages to a user can leave out the
    ones that would only fail. A group dataset reports ``group``.
    """

    name: str
    description: t.Optional[str]
    media_types: t.List[str]
    params: t.List[StageParameter]


def _field_constraint(
    constraint: t.Dict[str, t.Any],
) -> StageParameterFieldConstraint:
    return StageParameterFieldConstraint(
        level=StageParameterFieldLevel(constraint["level"]),
        existence=StageParameterFieldExistence(constraint["existence"]),
        ftypes=constraint["ftypes"],
        label_types=constraint["label_types"],
    )


def _declared_choices(declared: t.Dict[str, t.Any]) -> StageParameterChoices:
    return StageParameterChoices(
        source=StageParameterChoiceSource(declared["source"]),
        fields=[
            _field_constraint(constraint)
            for constraint in declared.get("fields", [])
        ],
        values=declared.get("values", []),
    )


_ANY_FIELD = StageParameterChoices(
    source=StageParameterChoiceSource.FIELDS,
    fields=[
        StageParameterFieldConstraint(
            level=StageParameterFieldLevel.ANY,
            existence=StageParameterFieldExistence.EXISTING,
            ftypes=[],
            label_types=[],
        )
    ],
    values=[],
)
_FREE_TEXT = StageParameterChoices(
    source=StageParameterChoiceSource.FREE_TEXT, fields=[], values=[]
)


def _choices(
    param: t.Dict[str, t.Any], tokens: t.List[str]
) -> StageParameterChoices:
    declared = param.get("choices")
    if declared is not None:
        return _declared_choices(declared)

    if _FIELD_TOKENS.intersection(tokens):
        return _ANY_FIELD

    return _FREE_TEXT


def _stage_parameter(
    param: t.Dict[str, t.Any], descriptions: t.Dict[str, str]
) -> StageParameter:
    tokens = param["type"].split("|")
    nullable = _NONE_TOKEN in tokens
    default = param.get("default")

    return StageParameter(
        name=param["name"],
        type=param["type"],
        tokens=tokens,
        nullable=nullable,
        required=default is None and not nullable,
        choices=_choices(param, tokens),
        default=default,
        placeholder=param.get("placeholder"),
        description=descriptions.get(param["name"]),
    )


# `name: text` or `name (default): text`, at the Args block's indentation
_ARG_LINE = re.compile(r"^(\w+)(?: \([^)]*\))?: (.*)$")


def _arg_descriptions(stage: type) -> t.Dict[str, str]:
    """Each parameter's description from the docstring's ``Args:`` block.

    A parameter's entry is its first line plus the more-indented continuation
    lines beneath it; a blank line ends the block.
    """
    doc = inspect.getdoc(stage)
    if not doc:
        return {}

    lines = doc.split("\n")
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == "Args:")
    except StopIteration:
        return {}

    descriptions: t.Dict[str, str] = {}
    name = None
    for line in lines[start + 1 :]:
        if not line.strip():
            break

        indent = len(line) - len(line.lstrip())
        match = _ARG_LINE.match(line.strip())
        if match and indent <= 4:
            name = match.group(1)
            descriptions[name] = match.group(2).strip()
        elif name is not None:
            descriptions[name] += " " + line.strip()
        else:
            break

    return descriptions


def _summary(stage: type) -> t.Optional[str]:
    """The first sentence of the stage's docstring, which every stage opens
    with a one-line statement of what it does."""
    doc = inspect.getdoc(stage)
    if not doc:
        return None

    first = doc.split("\n\n", 1)[0].replace("\n", " ")
    sentence = first.split(". ", 1)[0].strip()
    return sentence if sentence.endswith(".") else sentence + "."


def stage_definitions() -> t.List[StageDefinition]:
    return [
        StageDefinition(
            name=stage.__name__,
            description=_summary(stage),
            media_types=list(stage._media_types() or []),
            params=[
                _stage_parameter(param, _arg_descriptions(stage))
                for param in stage._params()
            ],
        )
        for stage in _STAGES
    ]
