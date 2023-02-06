"""
FiftyOne operator registry.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .operator import Operator

OPERATOR_DICT = {}


def list_operators(info=False):
    """Lists the available FiftyOne operators.

    Args:
        info (False): whether to return info dicts describing each operator
            rather than just their names

    Returns:
        a list of operator names or info dicts
    """
    if info:
        return _list_operator_info()

    return _list_operators()


def operator_exists(name):
    """Checks if the operator exists.

    Args:
        name: the name of the operator

    Returns:
        True/False
    """
    return OPERATOR_DICT.get(name, None) is not None


def _validate_operator_name(name):
    """Validates that the given operator name is available.

    Args:
        name: a operator name

    Returns:
        the slug

    Raises:
        ValueError: if the name is not available
    """
    slug = fou.to_slug(name)

    return slug


def load_operator(name):
    """Loads the FiftyOne operator with the given name.

    To create a new operator, use the :class:`Operator` constructor.

    Args:
        name: the name of the operator

    Returns:
        a :class:`Operator`
    """
    return OPERATOR_DICT[name]


def get_default_operator_dir(name):
    """Returns the default operator directory for the operator with the given
    name.

    Args:
        name: the operatro name

    Returns:
        the default directory for the operator
    """
    return os.path.join(fo.config.default_operator_dir, name)


def register_operator(operator):
    OPERATOR_DICT[operator.name] = operator


def get_operator(name):
    return OPERATOR_DICT[name]


def list_operator_info(self):
    return [
        {"name": name, "doc": operator.__doc__}
        for name, operator in OPERATOR_DICT.items()
    ]


def operator_exists(name):
    return name in OPERATOR_DICT


def get_operator_state(name):
    return OPERATOR_DICT[name].get_state()


def set_operator_state(name, state):
    OPERATOR_DICT[name].set_state(state)


def to_json(self):
    return json_util.dumps(OPERATOR_DICT)


def from_json(json_str):
    OPERATOR_DICT = json_util.loads(json_str)
