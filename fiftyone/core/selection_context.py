"""Selection service extension points.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

_actor_provider = lambda: None
_access_checker = lambda dataset, action: None


def register_selection_context(actor_provider, access_checker):
    """Registers request identity and write-access checks for selection APIs.

    The access checker receives a dataset and either ``"edit"`` or ``"tag"``.
    It must raise before a denied operation. The actor provider is evaluated
    in the caller's context, including background workers. Without a provider,
    selection operations use the local SDK's unrestricted access.

    Returns:
        a function that restores the previous registration
    """
    global _actor_provider, _access_checker
    previous = (_actor_provider, _access_checker)
    _actor_provider, _access_checker = actor_provider, access_checker

    def unregister():
        global _actor_provider, _access_checker
        if (_actor_provider, _access_checker) == (
            actor_provider,
            access_checker,
        ):
            _actor_provider, _access_checker = previous

    return unregister


def get_actor():
    """Returns the current actor, or None for local SDK operations."""
    return _actor_provider()


def check_access(dataset, action):
    """Raises if the registered policy denies a selection write."""
    _access_checker(dataset, action)
