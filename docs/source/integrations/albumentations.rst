.. _albumentations-integration:
.. _albumentationsx-integration:
.. _albumentations-plugin-overview:

AlbumentationsX
===============

Build augmentation pipelines directly in the FiftyOne App, inspect their effect
on labels, and create new image samples. Source samples, annotations, and media
remain unchanged. Generated outputs persist until you explicitly delete them.

This guide describes ``@albumentations/albumentationsx`` from the
`Albumentations team <https://github.com/albumentations-team/voxel51-plugin>`__.
The older `community plugin
<https://github.com/jacobmarks/fiftyone-albumentations-plugin>`__
uses a different workflow; see
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
      - Inspect up to three selected sources with annotated before/after
        comparisons.
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
      - Inspect, load, import/export, edit, duplicate, or delete
        configurations.
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
installation <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/release-artifacts.md#install-from-release-zip>`__
for an alternative to the GitHub download helper.

The wheel is the reusable Python package. The plugin ZIP also includes the
FiftyOne manifest and root registration entrypoint needed for App discovery.

.. _albumentationsx-quickstart:

Quickstart
----------

Create a small dataset without a repository checkout
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

Repository contributors can use the richer generated annotation/mask/validation
suites described in ``docs/demo-dataset.md`` in a source checkout.

.. _albumentations-applying-transformations:
.. _albumentations-visualizing-transformations:
.. _albumentations-saving-augmentations:

Preview and create
~~~~~~~~~~~~~~~~~~

.. figure:: /images/integrations/albumentationsx/preview.gif
    :alt: HorizontalFlip preview on COCO with aligned detections and keypoints.
    :width: 720px

    HorizontalFlip preview on COCO with aligned detections and keypoints.

1. Select the first sample in the grid.
2. Open **AlbumentationsX · Augment images**.
3. Choose **Execution scope → Selected samples**, one stage,
   **HorizontalFlip**, **Probability = 1**, and one output per sample.
4. Keep ``ground_truth`` checked in the annotation section.
5. Choose **Action → Preview**, submit, and inspect the comparison: the
   rectangle and its detection box should move from left to right together.
6. Use **Back to editor** to change settings or **Preview again** to inspect
   another stochastic result. The draft retains stages, parameters, labels,
   scope, and output count.
7. Choose **Review and create samples**. Review the source selection and submit
   **Create augmented samples**.
8. The grid opens the generated sample. The original three samples and their
   files remain unchanged. Use **View in history** to inspect this execution.

Preview does not save files, samples, manifests, or runs. Creation uses fresh
randomness, so a probabilistic pipeline can differ from its preview.

Review and remove generated outputs
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. figure:: /images/integrations/albumentationsx/create-outputs.gif
    :alt: Create one output and open its generated-sample view.
    :width: 720px

    Create one output and open its generated-sample view.

In **Run history**, select the run and choose **Review deletion of generated
outputs**. Check the run, sample/file counts, directory, and listed paths
before confirming.

Cleanup removes only that run’s generated samples, recorded output files, and
matching FiftyOne custom run. Its manifest remains as an audit record. The demo
source images and original samples remain available.

Close the cleanup result and any earlier augmentation result with **Close** or
**Done**. If the grid still shows the output-only view, remove its **Select**
view stage to see the original samples again.

If you later remove the demo dataset, use its printed unique name and handle
the printed source directory separately. Run cleanup does not delete demo
sources.

.. _albumentationsx-editor:

Build and edit a pipeline
-------------------------

.. figure:: /images/integrations/albumentationsx/edit-pipeline.gif
    :alt: Edit two ordered stages, preview, and return with settings preserved.
    :width: 720px

    Edit two ordered stages, preview, and return with settings preserved.

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
loading <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/pipeline-presets.md>`__.

The draft survives the continuation buttons and validation errors. Closing the
editor or result ends it; use **Save pipeline** for later reuse.

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

Use immediate execution for small selections. For larger scopes, choose
delegated creation and run a worker in the same environment:

.. code:: bash

    fiftyone delegated launch

Delegated execution reports progress and retains results without switching the
active grid. Preparation happens before output checkpoints, so progress and
cancellation may not be immediate. Cancellation is best-effort; a hard process
kill may prevent a final checkpoint. Retained partial outputs can be inspected
and cleaned through history. See
`cancellation <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/cancellation.md>`__.

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
      - In-memory or file-backed inputs; transformed masks stored in
        ``Detection.mask``
    * - ``Keypoints``
      - Geometry follows the image; missing/cropped joints retain their
        original slots
    * - ``Polylines``
      - Vertices transformed as keypoints; no full polygon clipping
    * - ``Heatmap``
      - Geometry synchronized through image-like targets; transformed maps
        stored in memory
    * - ``Segmentation``
      - Masks transformed; file-backed outputs saved as plugin-owned PNGs

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
policy <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/annotation-aware-execution.md>`__
for missing keypoints, clipping, dynamic attributes, and file-backed masks.

The example below uses a COCO photograph, its instance masks and keypoints,
mask-derived polylines, and an illustrative gradient heatmap. A mixed
HorizontalFlip + RandomBrightnessContrast pipeline cannot safely transform the
selected heatmap. Uncheck **heatmap** to omit it, then preview the remaining
annotations. For geometry-only processing, keep the heatmap selected instead.

.. figure:: /images/integrations/albumentationsx/compatibility-warning.png
    :alt: The heatmap is incompatible with the mixed geometry/color pipeline.
    :width: 720px

    Review the incompatible field before creating outputs.

.. figure:: /images/integrations/albumentationsx/annotation-preview.jpg
    :alt: Successful COCO preview with masks, keypoints, and polylines.
    :width: 720px

    After omitting the heatmap, preview the remaining annotations.

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
transforms <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/external-data-transforms.md>`__
explains this policy.

Video, 3D, tensor/unsafe image outputs, unsupported label classes, and
unresolved donor-object/mosaic/overlay/text inputs are outside the current
executable flow.

.. _albumentations-saving-transformations:
.. _albumentationsx-presets:

Save and share pipelines
------------------------

.. figure:: /images/integrations/albumentationsx/save-reuse.gif
    :alt: Save a pipeline, load its independent copy, and edit the flip
        probability.
    :width: 720px

    Save a pipeline, load its independent copy, and edit the flip probability.

Choose **Action → Save pipeline**, enter a name, and choose:

- **Save as new pipeline**: creates a new ID even if a display name already
  exists.
- **Update existing pipeline**: select the target and confirm its replacement.

The load picker never selects a replacement target. Other actions do not
implicitly save a name retained in the draft.

In **Saved pipelines**, inspect configurations, **Edit a copy of this
pipeline**, rename/edit metadata, duplicate, export, import, or delete. Export
the full **Importable pipeline JSON** object. Import accepts pasted JSON or a
regular UTF-8 JSON file on the machine running FiftyOne, up to 4 MiB. A
browser-local file path is not a remote server path.

Imported IDs are retained. Replacing an existing ID requires explicit
overwrite; equal names with different IDs remain separate. Presets store
configuration, annotation mapping, and dependency metadata, without source IDs,
generated paths, or sampled replay. See the `complete preset
contract <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/pipeline-presets.md>`__.

.. _albumentations-last-transformation-info:
.. _albumentationsx-history:

Run history, outcomes, and provenance
-------------------------------------

.. figure:: /images/integrations/albumentationsx/inspect-run.gif
    :alt: Inspect completed counters and reuse the run pipeline.
    :width: 720px

    Inspect completed counters and reuse the run pipeline.

**Run history** searches labels, dates, statuses, and transforms, newest first.
Select a run to inspect counters, scope, parameters, versions, errors, outputs,
and per-output replay. Open generated or failed source samples, or use **Use
pipeline from this run** to open an editable copy.

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Outcome
      - Meaning
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
``~/.fiftyone/albumentationsx-plugin/<dataset-name>/<run-key>/``. They retain
configuration, versions, source/output IDs, relative generated paths, replay
metadata, counters, and errors.

Reuse loads configuration with fresh randomness. Exact reproduction of earlier
sampled outputs is not implemented.

.. _albumentationsx-cleanup:

Cleanup and data safety
-----------------------

.. figure:: /images/integrations/albumentationsx/cleanup.gif
    :alt: Confirm deletion, inspect the result, and return to the original
        COCO images.
    :width: 720px

    Confirm deletion, inspect the result, and return to the original COCO images.

Use **Run history → Review deletion of generated outputs**. Confirmation is
bound to the selected run. Missing, invalid, or unsafe manifests block
deletion. Cleanup resolves only manifest-listed paths inside the run directory
and removes recorded generated sample IDs. It leaves sources and unrelated
files intact.

File-backed generated masks participate in the same allowlist. Partial runs can
be cleaned. Completed cleanup retains the manifest; **Include cleaned runs**
shows audit records. Preset deletion is independent of output cleanup. See
`cleanup
details <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/run-cleanup-operator.md>`__.

.. _albumentationsx-troubleshooting:

Troubleshooting
---------------

.. list-table::
    :header-rows: 1
    :widths: auto

    * - Problem
      - What to do
    * - Toolbar/action missing
      - Check the enabled plugin list, environment, dataset type, and overflow
        menu; restart the App after installation.
    * - Missing runtime dependency
      - Run the plugin requirements command in the environment launching
        FiftyOne.
    * - Preview blocked
      - Select source images; inspect highlighted fields and compatibility
        details.
    * - Crop rejected
      - Reduce dimensions, enable supported padding, or resize before cropping;
        inspect every selected source.
    * - Heatmap conflict
      - Use geometry only, use color only, or deselect the heatmap for a mixed
        pipeline.
    * - Saved settings do not replace the editor
      - Use **Replace draft with selected pipeline**; selecting a source alone
        preserves edits.
    * - Imported JSON rejected
      - Paste the complete exported object, not the overview table; check
        schema, file location, size, and overwrite confirmation.
    * - Outputs hidden by filters
      - Use **Open generated samples** or the selected run in history.
    * - Failed/partial run
      - Read the action and cause in the result; use technical details for full
        errors and inspect failed sources.
    * - Cleanup blocked
      - Verify the selected manifest and its recorded scope; do not substitute
        broad filesystem deletion.

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

The `Python operator
contract <https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/operator-api.md>`__
documents flat parameters and legacy Python migration. UI labels do not change
these six registered Python URIs.

Demo image credits
------------------

The recordings use COCO 2017 images 130586, 261888, and 378116. Official
COCO metadata identifies their photo license as `CC BY 2.0
<https://creativecommons.org/licenses/by/2.0/>`__. The examples show transformed
photographs and annotation overlays. See the `original image sources and
capture manifest
<https://github.com/albumentations-team/voxel51-plugin/blob/2f8aa79c4acad7d5efa41e8554161b15828ec9ee/docs/media/README.md>`__
for attribution, parameters, and versions. Polylines in the additional example
are derived from instance masks; its gradient heatmap is an illustrative fixture.
