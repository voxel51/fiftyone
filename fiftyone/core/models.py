"""
FiftyOne models.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.learning as etal


class ModelConfig(etal.ModelConfig):
    """Base configuration class that encapsulates the name of a :class:`Model`
    and an instance of its associated Config class.

    Attributes:
        type: the fully-qualified class name of the :class:`Model` subclass
        config: an instance of the Config class associated with the model
    """

    pass


class Model(etal.Model):
    """Abstract base class for all models.

    This class declares the following two conventions:

        (a) `Model`s are `Configurable`. This means that their constructors
            must take a single `config` argument that is an instance of
            `<ModelClass>Config`

        (b) Models implement the context manager interface. This means that
            models can optionally use context to perform any necessary setup
            and teardown, and so any code that builds a model should use the
            `with` syntax
    """

    pass
