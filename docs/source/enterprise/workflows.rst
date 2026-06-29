.. _enterprise-workflows:

Workflows
=========

.. default-role:: code

Workflows provide a flexible framework for orchestrating data operations
across your team. You define a multi-stage pipeline, run it over a dataset,
assign work to members, and track progress one sample at a time. In the
current release, workflows support **annotate → review** pipelines: you
build a workflow once, start it on a set of samples, and FiftyOne Enterprise
routes each sample through the stages you defined until it is fully labeled
and approved.

.. _enterprise-workflows-annotate-tab:

The Annotate Tab
----------------

Workflows live in the **Annotate** tab of the
:ref:`FiftyOne Enterprise App <enterprise-app>`. Open the tab to see two
areas:

- **My Tasks** — work currently assigned to you, with a progress bar and a
  button to jump straight into labeling or reviewing.
- **Workflows** — a grid of every workflow on the dataset showing its
  status, stage count, members, and overall completion.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_annotate_tab.webp
   :alt: Annotate tab showing My Tasks and the Workflows grid

Each workflow has a **status** that reflects where it is in its lifecycle:
**Draft** (still being designed), **Not started** (configured but not yet
running), or **Running** (actively routing samples through its stages).

Workflows are built from **stages**. The core stage types are:

- **Input samples** — a fixed first stage that defines which samples the
  workflow runs on. These are chosen when the workflow is started.
- **Annotate** — assignees label the samples that reach this stage and
  submit the sample as they finish.
- **Review** — assignees approve or reject labeled samples. A review stage
  has two outgoing branches, **Accepted** and **Rejected**, that you wire
  to downstream stages.

.. note::

   Additional stage types, including **agentic labeling**, are coming soon.

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
- **Clear** — remove all connections.
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

Click a stage on the canvas to configure it:

- **Input samples** — the set of samples the workflow runs on, chosen when
  the workflow is started.
- **Annotate** — select who can annotate (for example, *Anyone can
  annotate* or specific members) and set the label schema annotators will
  use.
- **Review** — select who can review and wire the **Accepted** /
  **Rejected** branches to the appropriate downstream stages.

The following example shows how to edit the assignee for a Review
stage:

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_stage_config.webp
   :alt: Editing the assignee for a Review stage

Starting a Workflow
~~~~~~~~~~~~~~~~~~~

When the pipeline is ready, click **Start workflow** and choose the input
samples to run on. The workflow moves from **Draft** to **Running**, tasks
are created for each member, and a *"N for you"* indicator appears on the
workflow card in the Annotate tab.

.. TODO: needs capture — Start workflow / input-samples selection screenshot.

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

When you open a sample as part of a task, the sample modal adds three
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

**Discussion.** An in-app comment thread on the sample and its labels.
You and your teammates can leave comments, edit or delete your own, and
moderate the thread — keeping the conversation attached to the work
itself.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_discussion.webp
   :alt: Discussion panel with comment thread on a sample

Annotating
~~~~~~~~~~

In an annotate task you label one sample at a time. Click **Submit & next**
to save your work and advance, or **Skip** to move on without labeling
(the sample stays pending until someone completes it). The progress
indicator (for example, *"5 / 501 samples · 496 left"*) tracks how many
samples remain.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_annotate_task.webp
   :alt: Annotating a sample with Submit & next and Skip

Reviewing
~~~~~~~~~

In a review task you approve or reject labeled samples. Each sample is
marked with an **APPROVED** or **REJECTED** badge. Rejecting a sample
reopens it for annotation — it returns to the labeling stage to be fixed
and resubmitted. The task progress (for example, *"2 / 2 samples reviewed · 0 remaining
(1 rejected)"*) reflects outcomes, and you complete the task with
**Task complete** once all samples have been reviewed.

.. image:: https://cdn.voxel51.com/enterprise/workflows/workflows_review_task.webp
   :alt: Review task mode showing APPROVED and REJECTED badges on a grid
