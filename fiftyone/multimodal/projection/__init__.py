"""
Multimodal projection compiler and sink infrastructure.

The compiler converts MCAP projection manifests (YAML) into a
:class:`~fiftyone.multimodal.projection.compiler.model.CompiledPlan` and
batched :class:`~fiftyone.multimodal.projection.compiler.model.ProjectionJob`
documents for MongoDB.

Quick start::

    from fiftyone.multimodal.projection import compiler

    plan = compiler.compile(yaml_source, dataset_id="<mongo-object-id>")
    jobs = compiler.dispatch(plan, episode_paths, base_path="gs://my-bucket")

    # Persist to MongoDB
    db["multimodal_manifest_plans"].insert_one(plan.to_mongo_doc())
    db["multimodal_projection_jobs"].insert_many(
        [job.to_mongo_doc() for job in jobs]
    )

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
