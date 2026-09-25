.. _albumentations-integration:
.. _albumentationsx-integration:
.. _albumentations-plugin-overview:

AlbumentationsX
===============

Build augmentation pipelines directly in the FiftyOne App, inspect their effect
on labels, and create new image samples. Source samples, annotations, and media
remain unchanged. Generated outputs persist until you explicitly delete them.

This guide describes ``@albumentations/albumentationsx`` from
`Albumentations team <https://github.com/albumentations-team/voxel51-plugin>`__. The older
`community plugin <https://github.com/jacobmarks/fiftyone-albumentations-plugin>`__ uses a different workflow; see
:ref:`Migration <albumentationsx-migration>`.

.. _albumentations-plugin-functionality:
.. _albumentationsx-workflows:

Choose an action
----------------

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Action
      - Purpose
      - Writes data?
    * - **Augment images → Preview**
      - Inspect up to three selected sources with annotated before/after comparisons.
      - No
    * - **Augment images → Validate without creating samples**
      - Read the chosen sources and execute planned transformations in memory.
      - No
    * - **Augment images → Create augmented samples**
      - Generate persistent samples, files, and a run record.
      - Yes
    * - **Augment images → Save pipeline**
      - Save a reusable configuration without generating samples.
      - Configuration only
    * - **Saved pipelines**
      - Inspect, load, import/export, edit, duplicate, or delete configurations.
      - For management actions
    * - **Run history**
      - Inspect executions, open outputs, reuse a pipeline, or review deletion.
      - Only confirmed cleanup

The sample-grid toolbar uses the short labels **augment**, **pipelines**, and
**history**, with full names in tooltips. On narrow grids, look in **More
items**. Compatibility and transform search live inside the editor.

.. _albumentations-installation:
.. _albumentationsx-installation:

Installation and upgrade
------------------------

Use Python 3.10–3.14 with FiftyOne ``>=1.19,<2``. The runtime dependencies are
AlbumentationsX ``>=2.3.8,<3`` and albu-spec ``>=0.0.6,<1``. The release
lockfile pins AlbumentationsX 2.3.8 and albu-spec 0.0.6. Declared ranges and CI
targets are not a claim that every dependency combination has been manually
tested.

Run these commands in the environment that launches FiftyOne:

.. code:: bash

    python -m pip install "fiftyone>=1.19,<2"
    fiftyone plugins download albumentations-team/voxel51-plugin/<release-tag>
    fiftyone plugins requirements @albumentations/albumentationsx --install
    fiftyone plugins list --enabled --names-only

Choose an existing `release
tag <https://github.com/albumentations-team/voxel51-plugin/releases>`__. The
final command must list ``@albumentations/albumentationsx``. This page
describes the 0.1.2 workflow. Choose a published release that includes this
workflow; earlier versions can have different controls. AlbumentationsX
installs as ``albumentationsx`` and is imported in Python as
``albumentations``.

For an upgrade, stop the App, preserve your plugin storage, and download the
chosen release with the CLI’s ``--overwrite`` option. Reinstall its
requirements, restart the App, and validate a small saved pipeline before
creating outputs. If the plugin is disabled, enable it with
``fiftyone plugins enable @albumentations/albumentationsx``. See `ZIP
installation <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/release-artifacts.md#install-from-release-zip>`__
for an alternative to the GitHub download helper.

The wheel is the reusable Python package. The plugin ZIP also includes the
FiftyOne manifest and root registration entrypoint needed for App discovery.

.. _albumentationsx-quickstart:

Quickstart
----------

Open an image dataset in the FiftyOne App. If you do not have one, use the
:ref:`standalone sample dataset <albumentationsx-sample-dataset>` below.
Choose the label fields present in your dataset. COCO datasets may use
``detections`` and ``keypoints``; the standalone example uses ``ground_truth``.

.. _albumentations-applying-transformations:
.. _albumentations-visualizing-transformations:
.. _albumentations-saving-augmentations:

Preview and create
~~~~~~~~~~~~~~~~~~

**Preview one source**

1. Select one source image in the grid and open **AlbumentationsX · Augment
   images** (the **augment** toolbar action).
2. Set **Execution scope → Selected samples**, one pipeline stage, and one
   output per sample. Choose **HorizontalFlip** with **Probability = 1**.
3. Select the annotation fields to transform. For the COCO recording, these are
   ``detections`` and ``keypoints``; for the standalone example,
   ``ground_truth``.
4. Choose **Action → Preview** and submit. Compare the original and augmented
   image: objects, boxes, masks, and keypoints should flip together when
   selected.
5. Use **Back to editor** to change settings or **Preview again** for another
   result. The draft retains stages, parameters, labels, scope, and output
   count.

**Expected result:** a before/after comparison with aligned labels. Preview
does not save files, samples, manifests, or runs. It shows at most three
selected sources, even when the execution scope is larger.

.. figure:: /images/integrations/albumentationsx/preview.gif
    :alt: Select COCO sources and preview HorizontalFlip with their annotations.
    :width: 720px

    Preview example (12 seconds): two selected COCO sources with detections,
    instance masks, and keypoints. Select any recording to view it at full size.

**Create one persistent output**

1. From the preview, choose **Review and create samples**.
2. Confirm **Selected samples**, one source, one output per sample, and the
   annotation fields. Choose **Create augmented samples** and submit.
3. Inspect the generated-sample view, then use **View in history** to inspect
   the run’s settings and counters.

**Expected result:** one new sample and its output image, with source
provenance. The source sample, file, and labels remain unchanged. Creation uses
fresh randomness; a probabilistic pipeline can differ from its preview.

.. figure:: /images/integrations/albumentationsx/apply-pipeline.gif
    :alt: Apply an augmentation pipeline and inspect the generated COCO samples.
    :width: 720px

    Creation example (30 seconds): apply a two-stage pipeline and inspect the
    generated images. Review the scope and output count before submitting.

To remove the output after exploring, follow `Cleanup and data
safety <#cleanup-and-data-safety>`__. If an output-only view hides the
originals, remove its **Select** view stage.

.. _albumentationsx-editor:

Build and edit a pipeline
-------------------------

The editor supports up to **ten stage slots** and **one to three outputs per
source**. Search **Transform**, optionally filter by target, and choose
parameters. Each stage has **Enabled** and **Execution order** controls. Orders
must be unique; lower values execute first. Disabled stages preserve their
values and do not run.

Defaults and bounds come from catalog metadata, with image-aware crop defaults
where possible. **Probability** defaults to 1 for a predictable first run.
Optional complex parameters appear under **Advanced parameters** as JSON
inputs. Empty optional JSON values use library defaults; malformed JSON is
rejected.

Expand **Compatibility details** to review selected annotation fields, scope,
and the current transform/copy behavior. Checkboxes control which labels appear
on outputs. Unsupported or unchecked fields are omitted and explained.

Use **Load pipeline** to select a saved configuration or run, then explicitly
click **Replace draft with selected pipeline**. Selecting a source alone keeps
your edits. Loaded settings remain editable; **Reload and replace draft**
discards subsequent changes. See `pipeline
loading <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/pipeline-presets.md>`__.

The draft survives the continuation buttons and validation errors. Closing the
editor or result ends it; use **Save pipeline** for later reuse.

Example: flip, then rotate
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Set **Pipeline stages** to 2.
2. Choose **HorizontalFlip** for stage 1, with **Execution order = 1** and
   **Probability = 1**.
3. Choose **RandomRotate90** for stage 2, with **Execution order = 2** and
   **Probability = 1**. Leave the optional group settings at their defaults.
4. Select the annotation fields, preview, and compare the before/after images.
   The sampled rotation can differ between sources and previews, including a
   zero-degree rotation.

.. figure:: /images/integrations/albumentationsx/two-steps.gif
    :alt: Add RandomRotate90 after HorizontalFlip and preview the two-stage pipeline.
    :width: 720px

    Two-stage example (19 seconds): add the rotation, then check that the
    selected annotations follow the transformed objects.

Example: brighten before flipping
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Return to the editor and increase the stage count to two.
2. Keep **HorizontalFlip** in the first slot, set its **Execution order** to 2,
   and set **Probability = 0** so its configuration is retained without a flip.
3. Choose **RandomBrightnessContrast** in the second slot, set its order to 1,
   **Probability = 1**, brightness limits to ``[0.3, 0.3]``, and contrast
   limits to ``[0, 0]``. Equal limits make this brightness change predictable.
4. Preview the selected image. It should become brighter without changing
   orientation. Return with **Back to editor** and inspect the retained
   settings.
5. Set the flip probability to 1 and preview again to see both effects.

.. _albumentationsx-scope:

Scope, validation, and execution
--------------------------------

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Scope
      - Source collection
    * - **Selected samples**
      - Selected IDs within the active view
    * - **Current view**
      - All samples in the filtered view
    * - **Entire dataset**
      - The dataset, regardless of current filters

Previously generated samples are not automatically excluded from these scopes.
To augment only originals on a repeat run, select those sources explicitly or
filter out the ``albumentationsx-output`` tag and use **Current view**.
Choosing **Entire dataset** includes generated samples still present in the
dataset.

Preview uses selected samples only, with one result per source and a maximum of
three displayed results. It does not preview the entire current view.

**Validate without creating samples** reads source images and selected labels,
checks dimensions/compatibility, and applies every planned output in memory. It
can be expensive for large scopes. It does not check future write permissions,
guarantee identical random choices, or prevent source data changing afterward.
Saving a pipeline validates its configuration and annotation compatibility;
validate against actual source images separately.

Preparation validates the complete chosen scope before the first manifest or
output. A known invalid crop without padding or missing input can therefore
reject the whole run before creating anything. Failures during output execution
can produce partial results.

Run creation in the background
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Use immediate execution for small selections. For larger scopes in FiftyOne
Open Source, configure the environment that launches the App/SDK:

.. code:: bash

    export FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS=true

Restart an already running App after changing this setting. In a second
terminal, activate the same Python environment, use the same FiftyOne database
and plugin configuration, and start a worker that can access the source and
output paths:

.. code:: bash

    export FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS=true
    fiftyone delegated launch

In the editor, choose **Create augmented samples**, review the scope, then use
the execution button’s dropdown to choose **Schedule**. Preview, validation,
and saving a pipeline run immediately. In another terminal, inspect the queue:

.. code:: bash

    fiftyone delegated list \
      --operator @albumentations/albumentationsx/augment_with_albumentationsx
    # Replace OPERATION_ID with an ID from the list
    fiftyone delegated info OPERATION_ID

Use **Run history** to inspect persisted output results. A queued operation
does not yet have a plugin run record. Managed deployments can use their
configured orchestrator; see FiftyOne’s `delegated operations
guide <https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations>`__.

Delegated execution reports progress and retains results without switching the
active grid. Preparation happens before output checkpoints, so progress and
cancellation may not be immediate. Cancellation is best-effort; a hard process
kill may prevent a final checkpoint. Retained partial outputs can be inspected
and cleaned through history. Closing an App dialog is not a reliable way to stop
a background worker; confirm that execution has stopped before cleanup.

.. _albumentationsx-annotations:

Supported annotations
---------------------

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Label
      - Behavior and limits
    * - ``Classification``
      - Copied unchanged, with new label identity
    * - ``Detections``
      - Boxes transformed with the image
    * - Detection instance masks
      - In-memory or file-backed inputs; transformed masks stored in ``Detection.mask``
    * - ``Keypoints``
      - Geometry follows the image; missing/cropped joints retain their original slots
    * - ``Polylines``
      - Vertices transformed as keypoints; no full polygon clipping
    * - ``Heatmap``
      - Geometry synchronized through image-like targets; transformed maps stored in memory
    * - ``Segmentation``
      - Masks transformed; file-backed outputs saved as plugin-owned PNGs

Detection boxes remain axis-aligned rectangles after a rotation. Their position
and size change to enclose the transformed object; the rectangle edges do not
tilt. Masks and keypoint coordinates follow the image geometry.

.. figure:: /images/integrations/albumentationsx/annotation-preview.png
    :alt: Original and horizontally flipped COCO cyclist with aligned boxes, masks, and keypoints.
    :width: 720px

    A still from the preview recording: compare the cyclist, bicycle, instance
    masks, and keypoints on both sides without waiting for the animation.

A pure image-only color pipeline copies selected heatmaps unchanged. A mixed
geometric plus color/intensity pipeline is blocked when it would apply color
operations to a transformed heatmap. For example, ``RandomBrightnessContrast``
alone is allowed; ``HorizontalFlip + RandomBrightnessContrast`` with the
heatmap selected is blocked.

Selected supported label tags and JSON-safe attributes are preserved, except
known derived geometry values that require recomputation. Source sample tags
and custom sample fields are not copied. Generated samples contain source
provenance instead. Unsupported values and omitted fields are reported. Read
the `annotation and metadata
policy <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/annotation-aware-execution.md>`__
for missing keypoints, clipping, dynamic attributes, and file-backed masks.

To resolve the mixed flip/color conflict, uncheck the heatmap field to omit it
and preview the remaining annotations. To keep transforming the heatmap, remove
the color/intensity stage and use a geometry-only pipeline.

.. _albumentations-supported-transformations:
.. _albumentationsx-transforms:

Transform coverage and reference images
---------------------------------------

The locked catalog contains 134 transforms, of which **113** are executable: 72
supported directly and 41 with optional advanced parameters. Counts depend on
the plugin’s policy as well as library versions.

Use search and target filters in the editor. The full capability and dataset
compatibility reports remain available through the Python operator URIs listed
below; they are unlisted in the general App picker.

``FDA``, ``HistogramMatching``, and ``PixelDistributionAdaptation`` use other
images in the execution scope as references and require at least two sources.
The implementation loads the full reference pool and constructs per-source
reference lists/provenance. Those lists grow quadratically; use small
selections. `External-data
transforms <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/external-data-transforms.md>`__
explains this policy.

Video, 3D, tensor/unsafe image outputs, unsupported label classes, and
unresolved donor-object/mosaic/overlay/text inputs are outside the current
executable flow.

.. _albumentations-saving-transformations:
.. _albumentationsx-presets:

Save and share pipelines
------------------------

Choose **Action → Save pipeline**, enter a name, and choose:

- **Save as new pipeline**: creates a new ID even if a display name already
  exists.
- **Update existing pipeline**: select the target and confirm its replacement.

The load picker never selects a replacement target. Other actions do not
implicitly save a name retained in the draft.

.. figure:: /images/integrations/albumentationsx/create-pipeline.gif
    :alt: Save a named pipeline and inspect its importable JSON.
    :width: 720px

    Save and inspect (26 seconds): save a named configuration, then inspect
    that pipeline's settings and complete JSON in **Saved pipelines**.

Load and edit a saved pipeline
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Open **Saved pipelines → Inspect saved pipeline** and select a pipeline.
2. Choose **Edit a copy of this pipeline**. Review its annotation mapping and
   execution scope for the current dataset.
3. Change a parameter and preview. The saved original remains unchanged until
   you explicitly save an update. You can also rename, edit details, duplicate,
   or delete configurations in **Saved pipelines**.

Export and import
~~~~~~~~~~~~~~~~~

1. Open **Saved pipelines → Export saved pipeline**, select the pipeline, and
   submit. Copy the complete **Importable pipeline JSON** object.
2. In the receiving environment, open **Saved pipelines → Import saved
   pipeline**.
3. Choose **Paste full JSON** and paste that object, or choose **Local JSON
   file** and enter its absolute **Local JSON file path**. The file must be a
   regular UTF-8 JSON file on the machine running FiftyOne, up to 4 MiB. A
   browser-local path is not a remote server path.
4. Review the imported configuration, then load an editable copy, check the
   current dataset’s annotation fields, and validate before creating outputs.

Imported IDs are retained. Replacing an existing ID requires explicit
overwrite; equal names with different IDs remain separate. Presets store
configuration, annotation mapping, and dependency metadata, without source IDs,
generated paths, or sampled replay. See the `complete preset
contract <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/pipeline-presets.md>`__.

.. dropdown:: Watch export, import, and editing (72 seconds)

    .. figure:: /images/integrations/albumentationsx/export-import-editing-pipeline.gif
        :alt: Export a pipeline as JSON, import it, and open an editable copy.
        :width: 720px

        Copy the complete **Importable pipeline JSON** object, import it, then
        load an editable copy. Importing a saved configuration and creating
        augmented samples are separate actions.

.. _albumentations-last-transformation-info:
.. _albumentationsx-history:

Run history, outcomes, and provenance
-------------------------------------

**Run history** searches labels, dates, statuses, and transforms, newest first.
Select a run to inspect counters, scope, parameters, versions, errors, outputs,
and per-output replay. Open generated or failed source samples, or use **Use
pipeline from this run** to open an editable copy.

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Outcome
      - Meaning
    * - ``running``
      - Output processing is in progress; wait before cleanup
    * - ``completed``
      - Output attempts finished without errors
    * - ``partial``
      - Some samples were created and errors occurred
    * - ``failed``
      - Errors occurred without created samples
    * - ``cancelled``
      - Controlled cancellation; partial outputs may remain
    * - ``cleaned``
      - History retains the audit record after cleanup

Availability such as missing files/manifests is reported separately from the
execution outcome. Errors rejected before persistence do not create history.

Generated samples use ``albumentationsx-output`` and
``albumentationsx-run:<run-key>`` tags. With a real run key copied from
history:

.. code:: python

    all_outputs = dataset.match_tags("albumentationsx-output")
    run_key = "replace-with-the-run-key-from-history"
    run_outputs = dataset.match_tags(f"albumentationsx-run:{run_key}")

Provenance includes ``albumentationsx_source_sample_id``,
``albumentationsx_run_key``, ``albumentationsx_transform_summary``, and
``albumentationsx_output_tag``. Manifests are stored under
``~/.fiftyone/albumentationsx-plugin/<normalized-dataset-name>-<hash>/<run-key>/``.
The dataset directory includes a ten-character hash; use the exact path shown
in the run details instead of guessing it from the dataset name. Manifests
retain configuration, versions, source/output IDs, relative generated paths,
replay metadata, counters, and errors.

Reuse loads configuration with fresh randomness. Exact reproduction of earlier
sampled outputs is not implemented.

.. figure:: /images/integrations/albumentationsx/reuse-pipeline-from-run-history.gif
    :alt: Choose a previous run and reuse its pipeline in the augmentation editor.
    :width: 720px

    Reuse from history (29 seconds): open a run's pipeline as an editable copy,
    review the current source scope, and execute it with fresh randomness.

.. _albumentationsx-errors:

Recover from errors
-------------------

Correct an invalid crop without creating outputs
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Select one source, choose **Validate without creating samples**, and
   configure **RandomCrop** with width and height larger than the image and
   **Pad if needed** disabled.
2. If source dimensions are already known, the editor highlights the invalid
   dimensions and blocks submission. Correct the fields there. If the problem
   is found only after submission, read the returned error and use **Back to
   editor**. Neither case creates samples or a run record.
3. Reduce the crop dimensions to fit the source, or enable **Pad if needed**.
   For example, a 640 × 640 crop of a 480 × 320 image needs padding. Review
   fill values if your labels include masks.
4. Submit validation once the form is valid, then preview. Inspect the crop and
   its selected annotations before choosing **Create augmented samples**.

.. figure:: /images/integrations/albumentationsx/validation-error.png
    :alt: Validation rejects an oversized crop and offers a return to the editor.
    :width: 720px

    Validation example: a 1024 × 1024 crop with padding disabled is rejected
    for the smaller COCO sources. Read the error, return to the editor, and
    reduce the crop dimensions or enable padding. No output samples or run
    record are created.

For these three COCO sources, changing both dimensions to **256**, keeping
padding disabled, and validating again returns **Validation passed** for all
three sources. Review the successful validation, then preview before creation.

If an advanced parameter contains malformed JSON, correct the highlighted field
and submit again. Use JSON syntax such as ``[0.3, 0.3]``, not Python tuples.
For an annotation compatibility error, follow the heatmap example in `Supported
annotations <#supported-annotations>`__.

Inspect and retry a partial or failed run
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. In **Run history**, select the affected run. Read the outcome, output/error
   counters, failed source IDs, and technical details. Error counts describe
   error records, including separate failures for multiple outputs from one
   source; they are not necessarily counts of distinct source images.
2. Use **Open failed source samples** and inspect the reported cause. Repair
   the source access, annotation, or pipeline setting that caused it.
3. Return to that run and choose **Use pipeline from this run**. Review the
   current view and any explicit sample selection; choose a scope containing
   only the intended sources. Loading a pipeline does not restore source IDs.
4. Validate that scope, then create outputs. This creates a new run with fresh
   randomness; it does not resume individual failed output attempts.
5. Inspect the new run and decide whether to retain or clean up the older run.

Retries operate on whole sources. With multiple outputs per source, a failed
source may already have successful outputs; rerunning it can create additional
versions of those outputs. Review existing outputs before retrying. A failure
rejected before persistence has no history entry; correct it in the editor.

.. _albumentationsx-cleanup:

Cleanup and data safety
-----------------------

Finish the execution, or confirm that its worker has stopped, before cleanup.
Cleanup does not cancel an active run or prevent it from writing later outputs.

1. Open **Run history**, select the intended run, and choose **Review deletion
   of generated outputs**.
2. Review the run identity, generated sample/file counts, output directory, and
   listed paths. Confirm only after this scope matches your intention.
3. Inspect the deletion result. Close it and any earlier result with **Close**
   or **Done**. Remove an output-only **Select** view stage to see the sources.

Confirmation is bound to the selected run. Missing, invalid, or unsafe
manifests block deletion. Cleanup resolves only manifest-listed paths inside
the run directory and removes recorded generated sample IDs. It leaves sources
and unrelated files intact.

File-backed generated masks participate in the same allowlist. Partial runs can
be cleaned. Completed cleanup retains the manifest; **Include cleaned runs**
shows audit records. Preset deletion is independent of output cleanup.
Already missing outputs count as skipped. A partial cleanup retains the custom
run and reports file failures for inspection.

.. figure:: /images/integrations/albumentationsx/delete-run-from-history.gif
    :alt: Review and confirm deletion of a run's generated samples and files.
    :width: 720px

    Cleanup example (17 seconds): review the selected run, confirm the deletion,
    and inspect the result. Source images and annotations remain available.

.. _albumentationsx-sample-dataset:

Optional standalone sample dataset
----------------------------------

The following standalone script uses dependencies installed above. It creates
three small images and a new dataset; existing datasets are left intact.

Save it as ``albumentationsx_quickstart.py`` and run it with the Python
environment that contains FiftyOne and the plugin:

.. code:: python

    from pathlib import Path
    from tempfile import mkdtemp

    import fiftyone as fo
    from PIL import Image, ImageDraw

    data_dir = Path(mkdtemp(prefix="albumentationsx-demo-"))
    dataset = fo.Dataset()  # FiftyOne chooses a unique name
    dataset.persistent = True

    for index, color in enumerate(("tomato", "royalblue", "seagreen")):
        image = Image.new("RGB", (480, 320), "whitesmoke")
        ImageDraw.Draw(image).rectangle((48, 64, 192, 224), fill=color)
        path = data_dir / f"source-{index + 1}.png"
        image.save(path)
        dataset.add_sample(
            fo.Sample(
                filepath=str(path),
                ground_truth=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="rectangle",
                            bounding_box=[0.1, 0.2, 0.3, 0.5],
                        )
                    ]
                ),
            )
        )

    print(f"Dataset: {dataset.name}")
    print(f"Source images: {data_dir}")
    session = fo.launch_app(dataset)
    session.wait()

.. code:: bash

    python albumentationsx_quickstart.py

The script prints the unique dataset name and source directory. Run cleanup
removes only plugin-generated outputs. If you later remove this demo dataset,
handle its printed source directory separately.

.. _albumentationsx-troubleshooting:

Troubleshooting
---------------

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Problem
      - What to do
    * - Toolbar/action missing
      - Check the enabled plugin list, environment, dataset type, and overflow menu; restart the App after installation.
    * - Missing runtime dependency
      - Run the plugin requirements command in the environment launching FiftyOne.
    * - Preview blocked
      - Select source images; inspect highlighted fields and compatibility details.
    * - Crop rejected
      - Reduce dimensions, enable supported padding, or resize before cropping; inspect every selected source.
    * - Heatmap conflict
      - Use geometry only, use color only, or deselect the heatmap for a mixed pipeline.
    * - Saved settings do not replace the editor
      - Use **Replace draft with selected pipeline**; selecting a source alone preserves edits.
    * - Imported JSON rejected
      - Paste the complete exported object, not the overview table; check schema, file location, size, and overwrite confirmation.
    * - Outputs hidden by filters
      - Use **Open generated samples** or the selected run in history.
    * - Failed/partial run
      - Read the action and cause in the result; use technical details for full errors and inspect failed sources.
    * - Cleanup blocked
      - Verify the selected manifest and its recorded scope; do not substitute broad filesystem deletion.

For a report, include plugin/dependency versions, the action, source scope,
parameters, and the copyable technical diagnostics. JSON fields include
``errors_json``, ``pipeline_config_json``, ``operator_params_json``, and the
available debug bundle. Avoid attaching private images or paths unnecessarily.

.. _albumentationsx-migration:

Migration from the older community plugin
-----------------------------------------

The new plugin has a different package identity and operator URIs. Inventory
existing plugins with ``fiftyone plugins list``; if both are installed,
distinguish them by name. To avoid using the old actions, disable the old
plugin using its exact name from that listing. Do not delete old datasets or
plugin storage.

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Older community workflow
      - AlbumentationsX workflow
    * - Temporary batches replaced by later runs
      - Persistent outputs, removed through explicit run cleanup
    * - Separate save-generated-augmentations action
      - Created samples are already persisted
    * - Last-run shortcuts
      - Searchable history of saved runs
    * - Dataset-bound saved transforms
      - Shared saved pipelines with editable loading and import/export

There is no automatic migration of old saved transforms, runs, or output
metadata. Recreate configurations, validate a small selection, and preserve
older data until you have confirmed the new result.

.. _albumentationsx-operators:

Python operator reference
-------------------------

All URI suffixes below are relative to ``@albumentations/albumentationsx/``.

.. list-table::
    :header-rows: 1
    :widths: auto

    * - URI suffix
      - Entry
    * - ``augment_with_albumentationsx``
      - Augment images
    * - ``manage_albumentationsx_presets``
      - Saved pipelines
    * - ``view_albumentationsx_run``
      - Run history
    * - ``analyze_albumentationsx_dataset_compatibility``
      - Unlisted detailed compatibility report
    * - ``show_albumentationsx_capabilities``
      - Unlisted full catalog report
    * - ``delete_albumentationsx_run``
      - Run-bound cleanup reached from history

For example, query the catalog from a Python script after installing and
enabling the plugin. Replace the dataset name with an existing image dataset:

.. code:: python

    import fiftyone.operators as foo

    execution = foo.execute_operator(
        "@albumentations/albumentationsx/show_albumentationsx_capabilities",
        ctx={
            "dataset": "your-image-dataset",
            "params": {
                "query": "HorizontalFlip",
                "status_filter": "all",
                "target_filter": "all",
            },
        },
    )
    execution.raise_exceptions()
    print(execution.result["transforms"])

This query creates no samples or run. In a notebook with an active event loop,
await the returned task before reading ``execution.result``. The `Python
operator
contract <https://github.com/albumentations-team/voxel51-plugin/blob/cf08bb776d251933b33189b9bc01ed1c06d9c681/docs/operator-api.md>`__
documents flat parameters and legacy Python migration. UI labels do not change
these six registered URIs.

.. _albumentationsx-media-credits:

Demo image credits
------------------

The recordings and screenshots use COCO 2017 validation photographs with
instance annotations and person keypoints. They show annotation overlays,
geometric augmentations, and cropped views of the App. The COCO source metadata
identifies these photographs as
`Creative Commons Attribution 2.0 <https://creativecommons.org/licenses/by/2.0/>`__.
Photo rights remain with their original creators; the metadata supplies the
following original image references:

.. list-table::
    :header-rows: 1
    :widths: auto

    * - COCO image
      - Subject
      - Original source
    * - 130586
      - Person outdoors
      - `Flickr photograph <https://farm4.staticflickr.com/3587/3392836274_5d866f582b_z.jpg>`__
    * - 261888
      - Cyclist
      - `Flickr photograph <https://farm5.staticflickr.com/4079/4918743472_0b684750c4_z.jpg>`__
    * - 378116
      - Surfer
      - `Flickr photograph <https://farm6.staticflickr.com/5150/5619719330_f8c8934184_z.jpg>`__

Images and annotations were obtained from the
`official COCO downloads <https://cocodataset.org/#download>`__.
