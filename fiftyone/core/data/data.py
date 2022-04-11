import copy
import inspect
import sys
import typing as t


from .exceptions import FiftyOneDataError
from .field import fields, Field, FIELDS, MISSING

__all__ = ["asdict", "is_data", "sample"]


_PATH = "__fiftyone_path__"
_SCHEMA = "__fiftyone_schema__"

_POST_INIT_NAME = "__post_init__"


class _HAS_DEFAULT_FACTORY_CLASS:
    def __repr__(self) -> str:
        return "<factory>"


_HAS_DEFAULT_FACTORY = _HAS_DEFAULT_FACTORY_CLASS()


@t.overload
def sample(cls: None) -> t.Callable[[t.Type], t.Type]:
    ...


@t.overload
def sample(cls: t.Type) -> t.Type:
    ...


def sample(cls: t.Optional[t.Type] = None) -> t.Union[t.Callable, t.Type]:
    def wrap(cls: t.Type) -> t.Type:
        return _decorate(cls)

    # @sample()
    if cls is None:
        return wrap

    # @sample
    return wrap(cls)


def _decorate(cls: t.Type) -> t.Type:
    fields: t.Dict[str, Field] = {}

    if cls.__module__ in sys.modules:
        globals = sys.modules[cls.__module__].__dict__
    else:
        globals = {}

    for b in cls.__mro__[-1:0:-1]:
        base_fields = getattr(b, FIELDS, None)
        if base_fields:
            for field in base_fields.values():
                fields[field.name] = field

    cls_annotations = cls.__dict__.get("__annotations__", {})
    cls_fields = [
        _get_field(cls, name, type) for name, type in cls_annotations.items()
    ]
    for field in cls_fields:
        fields[field.name] = field
        delattr(cls, field.name)

    for name in cls.__dict__:
        if name in cls_annotations:
            continue

        raise FiftyOneDataError(
            f"{name!r} is a field but has no type annotation"
        )

    setattr(cls, FIELDS, fields)
    has_post_init = hasattr(cls, _POST_INIT_NAME)

    _set_new_attribute(
        cls,
        "__init__",
        _init_fn(
            list(fields.values()),
            has_post_init,
            "__fiftyone_self__" if "self" in fields else "self",
            globals,
        ),
    )

    if not getattr(cls, "__doc__"):
        cls.__doc__ = cls.__name__ + str(inspect.signature(cls)).replace(
            " -> None", ""
        )

    return cls


def _get_field(cls: t.Type, a_name: str, a_type: t.Type) -> Field:
    default = getattr(cls, a_name, MISSING)

    field: Field
    if isinstance(default, Field):
        field = default
    else:
        field = Field(default=default)

    field.name = a_name
    field.type = a_type

    if isinstance(field.default, (list, dict, set)):
        raise FiftyOneDataError(
            f"mutable default {type(field.default)} for field "
            f"{field.name} is not allowed: use default_factory"
        )

    return field


def _field_assign(name: str, value: str, self_name: str) -> str:
    return f"{self_name}.{name}={value}"


def _field_init(field: Field, globals: dict, self_name: str) -> str:
    default_name = f"_dflt_{field.name}"
    if field.default_factory is not MISSING:
        globals[default_name] = field.default_factory
        value = (
            f"{default_name}() "
            f"if {field.name} is _HAS_DEFAULT_FACTORY "
            f"else {field.name}"
        )
    else:
        if field.default is MISSING:
            value = field.name
        elif field.default is not MISSING:
            globals[default_name] = field.default
            value = field.name

    return _field_assign(field.name, value, self_name)


def _init_param(field: Field) -> str:
    if field.default is MISSING and field.default_factory is MISSING:
        default = "=None"
    elif field.default is not MISSING:
        default = f"=_dflt_{field.name}"
    elif field.default_factory is not MISSING:
        default = "=_HAS_DEFAULT_FACTORY"
    return f"{field.name}:_type_{field.name}{default}"


def _init_fn(
    fields: t.List[Field], has_post_init: bool, self_name: str, globals: dict
) -> t.Callable:
    locals: t.Dict[str, t.Any] = {f"_type_{f.name}": f.type for f in fields}
    locals.update(
        {
            "MISSING": MISSING,
            "_HAS_DEFAULT_FACTORY": _HAS_DEFAULT_FACTORY,
        }
    )

    body_lines = []
    for field in fields:
        line = _field_init(field, locals, self_name)
        if line:
            body_lines.append(line)

    if has_post_init:
        params_str = ",".join(f.name for f in fields)
        body_lines.append(f"{self_name}.{_POST_INIT_NAME}({params_str})")

    if not body_lines:
        body_lines = ["pass"]

    return _create_fn(
        "__init__",
        [self_name] + [_init_param(f) for f in fields],
        body_lines,
        locals=locals,
        globals=globals,
        return_type=None,
    )


def _set_new_attribute(cls: t.Type, name: str, value: t.Any) -> None:
    if name in cls.__dict__:
        raise FiftyOneDataError(f"Attribute {name} already exists")

    setattr(cls, name, value)


def _create_fn(
    name: str,
    args_list: t.List[str],
    body_list: t.List[str],
    *,
    globals: dict = None,
    locals: dict = None,
    return_type: str = None,
) -> t.Callable:
    if locals is None:
        locals = {}

    return_annotation = "->_return_type"
    locals["_return_type"] = return_type

    args = ",".join(args_list)
    body = "\n".join(f"  {b}" for b in body_list)

    txt = f" def {name}({args}){return_annotation}:\n{body}"

    local_vars = ", ".join(locals.keys())
    txt = f"def __create_fn__({local_vars}):\n{txt}\n return {name}"
    print(txt)

    ns: t.Dict[str, t.Callable] = {}
    exec(txt, globals, ns)
    return ns["__create_fn__"](**locals)


def _is_data_instance(obj: t.Any) -> bool:
    return hasattr(type(obj), FIELDS)


def is_data(obj: t.Any) -> bool:
    cls = obj if isinstance(obj, type) else type(obj)
    return hasattr(cls, FIELDS)


def asdict(obj: t.Any, *, dict_factory: t.Type = dict) -> dict:
    if not _is_data_instance(obj):
        raise TypeError("asdict() should be called on dataclass instances")
    return _asdict_inner(obj, dict_factory)


def _asdict_inner(obj: t.Any, dict_factory: t.Callable) -> t.Any:
    if _is_data_instance(obj):
        result = []
        for f in fields(obj):
            value = _asdict_inner(getattr(obj, f.name), dict_factory)
            result.append((f.name, value))
        return dict_factory(result)
    elif isinstance(obj, tuple) and hasattr(obj, "_fields"):
        return type(obj)(*[_asdict_inner(v, dict_factory) for v in obj])
    elif isinstance(obj, (list, tuple)):
        return type(obj)(_asdict_inner(v, dict_factory) for v in obj)
    elif isinstance(obj, dict):
        return type(obj)(
            (_asdict_inner(k, dict_factory), _asdict_inner(v, dict_factory))
            for k, v in obj.items()
        )
    else:
        return copy.deepcopy(obj)
