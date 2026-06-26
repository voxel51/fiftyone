.. _enterprise-workflows:

Workflows
=========

.. default-role:: code

Workflows let your team define multi-stage **annotate → review** pipelines, run
them over a dataset, assign the work to members, and track progress one sample at
a time. Instead of coordinating labeling and review by hand, you build a workflow
once, start it on a set of samples, and FiftyOne Enterprise routes each sample
through the stages you defined until it is fully labeled and approved.

.. TODO: replace with a 30-60s end-to-end demo video (create -> run -> annotate
   -> review). Use the YouTube embed pattern, e.g.:
   .. raw:: html
     <div style="margin-top: 20px; margin-bottom: 20px">
       <iframe id="youtube" src="https://www.youtube.com/embed/VIDEO_ID?rel=0" frameborder="0" allowfullscreen></iframe>
     </div>

Workflows are **generally available** in FiftyOne Enterprise. No additional
setup is required to start using them.

.. _enterprise-workflows-annotate-tab:

The Annotate tab
________________

Workflows live in the **Annotate** tab of the FiftyOne Enterprise App. Open the
tab to see two things:

- **My Tasks** — the work that is currently assigned to you, with a progress bar
  and a button to jump straight into labeling or reviewing.
- **Workflows** — a grid of every workflow on the dataset, with its status,
  number of stages, members, and overall completion.

.. image:: /images/enterprise/workflows/workflows_annotate_tab.png
   :alt: workflows-annotate-tab
   :align: center

.. TODO: provided screenshot #3 (Annotate tab: My Tasks + Workflows grid).

A few concepts make the rest of this page easier to follow:

- **Workflow** — the pipeline definition. A workflow has a status that reflects
  where it is in its lifecycle:

  - **Draft** — still being built; not yet started.
  - **Not started** — configured but not yet running.
  - **Running** — started and actively routing samples through its stages.

- **Stages** — the building blocks of a workflow. The core stages are:

  - **Input samples** — a fixed first stage that defines the set of samples the
    workflow runs on. These are chosen when the workflow is started.
  - **Annotate** — assignees label the samples that reach this stage.
  - **Review** — assignees approve or reject labeled samples. A review stage has
    two outgoing branches, **Accepted** and **Rejected**, which you wire up to
    decide what happens next.

  Additional advanced stages (such as agentic labeling, batch, collect, and
  stream) are available for more complex pipelines.

- **Tasks** — the units of work a running workflow assigns to members. Each
  member sees their assigned tasks under **My Tasks**.

- **Per-sample progress** — progress is tracked per unique sample, which gives
  workflows a few intuitive behaviors:

  - A stage's total reflects the number of unique samples it must process.
  - **Rejecting** a sample in review *reopens* it: it goes back for annotation,
    and the review is no longer counted as complete until the fix is resubmitted.
  - **Skipping** a sample parks it as pending — the total still includes it, but
    it never counts as completed until someone comes back to it.

.. _enterprise-workflows-create:

Creating and managing workflows
_______________________________

Click **New workflow** in the Annotate tab to open the workflow view, where you
design the pipeline on a visual canvas.

Building a workflow on the canvas
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The canvas is a node graph. Each stage is a node, and you connect nodes to define
how samples flow from one stage to the next. Drag from a stage's output to the
next stage's input to create a connection; for a **Review** stage, wire its
**Accepted** and **Rejected** outputs to the stages that should handle each
outcome (for example, route **Rejected** back to an annotate stage so the sample
is fixed, and **Accepted** forward to a final review).

.. image:: /images/enterprise/workflows/workflows_canvas_editor.png
   :alt: workflows-canvas-editor
   :align: center

.. TODO: provided screenshot #4 or #5 (canvas with Input samples -> Annotate ->
   Review stages and Accepted/Rejected connections).

The canvas toolbar provides:

- **Tidy** — automatically lay out the stages for a clean graph.
- **Clear** — remove all connections.
- **Delete** — remove the selected stage.
- **Start workflow** — start the workflow once it is configured (see below).

Using a template
^^^^^^^^^^^^^^^^

Rather than building from scratch, you can start from a **template** — a
prebuilt pipeline you can customize. Templates are a fast way to stand up common
annotate-and-review patterns.

.. image:: /images/enterprise/workflows/workflows_templates_picker.png
   :alt: workflows-templates-picker
   :align: center

.. TODO: needs capture — templates picker.

Configuring stages
^^^^^^^^^^^^^^^^^^

Open a stage to configure it:

- **Input samples** — defines which samples the workflow runs on. The set is
  chosen when the workflow is started.
- **Annotate** — choose who can work on the stage (for example, *Anyone can
  annotate*, or specific members) and the label schema annotators will use.
- **Review** — choose who can review, and wire the **Accepted** / **Rejected**
  branches to the appropriate downstream stages.

.. image:: /images/enterprise/workflows/workflows_stage_config.png
   :alt: workflows-stage-config
   :align: center

.. TODO: needs capture — stage configuration dialog (assignees + schema).

Starting a workflow
^^^^^^^^^^^^^^^^^^^

When the pipeline is ready, click **Start workflow** and choose the **input
samples** to run it on. The workflow moves from **Draft** to **Running**, tasks
are created for its members, and each member's share shows up in the Annotate tab
(for example, a *"N for you"* indicator on the workflow card).

.. image:: /images/enterprise/workflows/workflows_start_input_samples.png
   :alt: workflows-start-input-samples
   :align: center

.. TODO: needs capture — Start workflow / input-samples selection.

Cloning and deleting a workflow
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

You can **clone** a workflow to reuse its pipeline as the starting point for a
new one, and **delete** a workflow you no longer need from its card in the
Workflows grid or from the workflow detail view.

.. image:: /images/enterprise/workflows/workflows_clone_delete.png
   :alt: workflows-clone-delete
   :align: center

.. TODO: needs capture — clone/delete controls.

Viewing a workflow's tasks
^^^^^^^^^^^^^^^^^^^^^^^^^^

Each workflow has a **Tasks** tab that lists all of the tasks the workflow has
generated, so you can see the work across the whole pipeline in one place.

.. image:: /images/enterprise/workflows/workflows_tasks_tab.png
   :alt: workflows-tasks-tab
   :align: center

.. TODO: needs capture — workflow Tasks tab.

.. _enterprise-workflows-tasks:

Working on tasks
________________

To do your assigned work, open the **Annotate** tab and pick a task from **My
Tasks**. Annotate tasks open in labeling mode; review tasks open in review mode.

The sample modal in task mode
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

When you open a sample as part of a task, the sample modal adds three task
surfaces alongside the usual viewer:

- **Task banner** — shows the workflow and task you are working on, along with
  the primary actions for the stage (**Skip** / **Submit & next** when
  annotating, or accept / reject when reviewing).
- **Task progress** — shows how far along the task is, such as *"x / y samples"*
  and *"(n rejected)"*. Because progress is per sample, skipping or rejecting a
  sample updates these counts as described in
  :ref:`The Annotate tab <enterprise-workflows-annotate-tab>`.
- **Discussion** — an in-app comment thread on the sample and its labels. You
  and your teammates can leave comments, edit or delete your own, and moderate
  the thread, keeping the conversation attached to the work itself.

.. image:: /images/enterprise/workflows/workflows_discussion.png
   :alt: workflows-discussion
   :align: center

.. TODO: needs capture — Discussion / comment thread panel (collapsed in
   provided screenshot #2).

Annotating
^^^^^^^^^^

In an annotate task, you label one sample at a time. Use **Submit & next** to
save your work and advance, or **Skip** to move on without labeling the current
sample (it stays pending until it is completed). The progress indicator
(for example, *"2 / 66 samples"*) tracks how many samples remain.

.. image:: /images/enterprise/workflows/workflows_annotate_task.png
   :alt: workflows-annotate-task
   :align: center

.. TODO: provided screenshot #2 (annotate task mode: Submit & next / Skip).

Reviewing
^^^^^^^^^

In a review task, you approve or reject labeled samples. Approved and rejected
samples are marked with **APPROVED** / **REJECTED** badges. Rejecting a sample
reopens it for annotation, so it returns to the labeling stage to be fixed and
resubmitted. The task's progress (for example, *"5 / 5 reviewed · 1 rejected"*)
reflects the outcomes, and you complete the task with **Task complete** when all
samples have been reviewed.

.. image:: /images/enterprise/workflows/workflows_review_task.png
   :alt: workflows-review-task
   :align: center

.. TODO: provided screenshot #1 (review task mode: APPROVED/REJECTED grid).
