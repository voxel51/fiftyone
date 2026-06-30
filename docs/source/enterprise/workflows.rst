.. _enterprise-workflows:

Annotation Workflows
====================

.. default-role:: code

Workflows provide a flexible framework for orchestrating data operations
across your team to bring humans into the loop. You define a multi-stage
pipeline, run it over a dataset, assign work to members, and track progress
one sample at a time. For example, in an annotate-and-review pipeline you
build a workflow once, start it on a set of samples, and FiftyOne Enterprise
routes each sample through the stages you defined to your annotation team
until it is fully labeled and approved.

.. _enterprise-workflows-annotate-tab:

The Annotate Tab
----------------

Workflows live in the **Annotate** tab of the
:ref:`FiftyOne Enterprise App <enterprise-app>` within a dataset. Open the
tab to see two areas:

- **My Tasks** — work currently assigned to you, with a progress bar and a
  button to jump straight into labeling or reviewing.
- **Workflows** — a grid of every workflow on the dataset showing its
  status, stage count, members, and overall completion.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_annotate_tab.webp
   :alt: Annotate tab showing My Tasks and the Workflows grid

Each workflow has a **status** that reflects where it is in its lifecycle:
**Draft** (still being designed), **Started** (launched, with tasks being
created), **Running** (actively routing samples through its stages), or
**Complete** (all samples have been fully processed).

Workflows are built from **stages**. The core stage types are:

- **Input samples** — a fixed first stage that defines which samples the
  workflow runs on.
- **Annotate** — assignees label the samples that reach this stage and
  submit the samples as they finish.
- **Review** — assignees approve or reject labeled samples. A review stage
  has two outgoing branches, **Accepted** and **Rejected**, that you wire
  to downstream stages.

A running workflow creates **tasks** — units of work assigned to members.
Each member sees their share under **My Tasks**. Progress is tracked per
unique sample: a stage's total reflects the number of unique samples
currently available to work on — this number updates as upstream stages
push new samples in.

----

How to: Create a Workflow
-------------------------

Click **+ New workflow** in the Annotate tab to open the workflow editor.

Building the Pipeline on the Canvas
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The editor is a visual node graph. Each stage is a node; drag from one
stage's output handle to the next stage's input handle to create a
connection.

For a **Review** stage, wire the **Accepted** output forward (for example,
to a final review or to the end of the pipeline) and the **Rejected**
output back to an **Annotate** stage so the sample is fixed and
resubmitted.

The canvas toolbar provides:

- **Tidy** — auto-layout the graph.
- **Clear** — reset the pipeline.
- **Delete** — remove the selected stage.
- **Start workflow** — launch the workflow once it is configured.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_canvas_editor_demo.webp
   :alt: Building a workflow on the canvas editor

Using a Template
~~~~~~~~~~~~~~~~

Instead of building from scratch, click **Templates** to start from a
prebuilt pipeline. Templates are a fast way to stand up common
annotate-and-review patterns; customize the stages after importing.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_templates_picker.webp
   :alt: Templates picker showing prebuilt workflow patterns

For example, the **Human-in-the-loop** template creates a single
Annotate → Review pipeline:

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_canvas_simple.webp
   :alt: Single-stage review template on the canvas

The **Two-tier review** template adds a second review stage for
high-stakes labeling:

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_two_tier_template.webp
   :alt: Two-tier review template on the canvas

Configuring Stages
~~~~~~~~~~~~~~~~~~

Click a stage on the canvas to configure it. Workflows are built from
stages, each with stage-specific configuration options, that can spawn
tasks and delegated operations.

For example, the **Input samples** stage lets you choose which samples
enter the pipeline, such as a :ref:`saved view <app-saving-views>`:

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_input_samples_config_v2.webp
   :alt: Configuring Input samples with saved view selection

An **Annotate** or **Review** stage lets you set who is assigned to the
work. The following example shows how to edit the assignee for a Review
stage:

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_stage_config.webp
   :alt: Editing the assignee for a Review stage

Starting a Workflow
~~~~~~~~~~~~~~~~~~~

When the pipeline is ready, click **Start workflow**. The workflow moves
from **Draft** to **Running**, tasks are created for each member, and a
*"N for you"* indicator appears on the workflow card in the Annotate tab.

Cloning and Deleting
~~~~~~~~~~~~~~~~~~~~

**Clone** a workflow to reuse its pipeline as the starting point for a new
one.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_clone_delete.webp
   :alt: Cloning a workflow to reuse its pipeline

**Delete** a workflow you no longer need from the workflow card or the
detail view.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_delete.webp
   :alt: Delete workflow button on a workflow card

Viewing Tasks
~~~~~~~~~~~~~

Each workflow has a **Tasks** tab listing every task the workflow has
generated, so you can see work across the whole pipeline in one place.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_tasks_tab.webp
   :alt: Workflow Tasks tab listing all tasks

----

How to: Work on Tasks
---------------------

Open the **Annotate** tab and pick a task from **My Tasks**. Annotate
tasks open in labeling mode; review tasks open in review mode.

.. _enterprise-workflows-task-mode:

Task Mode
~~~~~~~~~

When you open a sample as part of a task, the sample modal adds two
surfaces alongside the usual viewer:

**Task banner.** Displays task progress at a glance, along with a
**Resume labeling** button to jump back into the task and a link to
**View workflow** for the full pipeline context.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_task_banner.webp
   :alt: Task banner showing progress, Resume labeling, and View workflow

**Task progress.** Shows how many samples have been completed out of the
total assigned to the task (for example, *"5 / 501 samples"*).

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_task_progress.webp
   :alt: Task progress bar with Skip and Submit & next buttons

Annotate
~~~~~~~~

In an annotate task you label one sample at a time. Click **Submit & next**
to save your work and advance, or **Skip** to move on without labeling
(the sample stays pending until someone completes it). The progress
indicator (for example, *"5 / 501 samples · 496 left"*) tracks how many
samples remain.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_annotate_task.webp
   :alt: Annotating a sample with Submit & next and Skip

Review
~~~~~~

In a review task you approve or reject labeled samples. Each sample is
marked with an **APPROVED** or **REJECTED** badge. Approving or rejecting
samples routes them to the next stage as defined in the workflow pipeline;
for example, rejecting a sample might route it back to the annotate stage
it came from. The task progress (for example,
*"2 / 2 samples reviewed · 0 remaining (1 rejected)"*) reflects outcomes,
and you complete the task with **Task complete** once all samples have
been reviewed.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_review_task.webp
   :alt: Review task mode showing APPROVED and REJECTED badges on a grid

Leaving Comments
^^^^^^^^^^^^^^^^

While reviewing, you can leave :ref:`comments <enterprise-comments>` on
individual samples to flag issues, request changes, or discuss specific
labels with the annotator. Comments stay attached to the sample so the
conversation follows the work as it moves through the pipeline.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_discussion.webp
   :alt: Discussion panel attached to a reviewed sample
