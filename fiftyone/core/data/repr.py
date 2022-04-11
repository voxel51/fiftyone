import fiftyone.core.utils as fou

from .primitives import Primitive


def repr(self, data) -> str:
    d = {}
    for k, f in data.items():
        if k.startswith("_"):
            continue

        value = self.__dict__.get(k, None)
        if value is None:
            continue

        if isinstance(f, Primitive):
            value = str(Primitive.dump(value))

        d[f] = value

    return "<%s: %s>" % (self.__class__.__name__, fou.pformat(d))
