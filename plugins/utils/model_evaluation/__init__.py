"""
FiftyOne builtin plugins.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.operators.store import ExecutionStore
from bson import ObjectId


STORE_NAME = "model_evaluation_panel_builtin"


def get_subsets_from_custom_code(ctx, custom_code):
    try:
        local_vars = {}
        exec(custom_code, {"ctx": ctx}, local_vars)
        data = local_vars.get("subsets", {})
        if len(data) == 0:
            return None, "No subsets found in the custom code."
        return data, None
    except Exception as e:
        return None, str(e)


def get_dataset_id(ctx, serialize=True):
    return str(ctx.dataset._doc.id) if serialize else ctx.dataset._doc.id


def get_store(ctx):
    """
    Get the execution store from the context.
    """
    return ctx.store(STORE_NAME)


def get_scenarios_store(ctx):
    """
    Get the scenarios store from the context.
    """
    dataset_id = get_dataset_id(ctx)

    dataset_oid = ObjectId(dataset_id)

    return ExecutionStore.create(STORE_NAME, dataset_oid)


def get_scenarios(ctx):
    store = get_scenarios_store(ctx)
    return (store.get("scenarios") or {}).copy()


def set_scenarios(ctx, scenarios):
    store = get_scenarios_store(ctx)
    store.set("scenarios", scenarios.copy())
