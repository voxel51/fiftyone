.. _environments:

FiftyOne Environments
=====================

.. default-role:: code

This guide describes best practices for using FiftyOne with data stored in
various environments, including local machines, remote servers, and cloud
storage.

Terminology
___________

- :ref:`Local machine <local-data>`: Data is stored on the same computer that
  will be used to launch the App

* :ref:`Remote machine <remote-data>`: Data is stored on disk on a separate
  machine (typically a remote server) from the one that will be used to launch
  the App

* :ref:`Notebooks <notebooks>`: You are working from a
  `Jupyter Notebook <https://jupyter.org>`_ or a
  `Google Colab Notebook <https://colab.research.google.com>`_.

* :ref:`Cloud storage <cloud-storage>`: Data is stored in a cloud bucket
  (e.g., :ref:`S3 <AWS>`, :ref:`GCS <google-cloud>`, or :ref:`Azure <azure>`)

.. _local-data:

Local data
__________

When working with data that is stored on disk on a machine with a display, you
can directly :ref:`load a dataset <loading-datasets>` and then
:ref:`launch the App <creating-an-app-session>`:

.. code-block:: python
    :linenos:

    # On local machine
    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset)  # (optional) port=XXXX

From here, you can explore the dataset interactively from the App and from your
Python shell by manipulating the
:class:`session object <fiftyone.core.session.Session>`.

.. note::

    You can use custom ports when launching the App in order to operate
    multiple App instances simultaneously on your machine.

.. _remote-data:

Remote data
___________

FiftyOne supports working with data that is stored on a remote machine that you
have `ssh` access to. The basic workflow is to load a dataset on the remote
machine via the FiftyOne Python library, launch a
:ref:`remote session <remote-session>`, and connect to the session on your
local machine where you can then interact with the App.

First, `ssh` into your remote machine and
:ref:`install FiftyOne <installing-fiftyone>` if necessary.

Then :ref:`load a dataset <loading-datasets>` using Python on the remote
machine and launch a remote session:

.. code-block:: python
    :linenos:

    # On remote machine
    import fiftyone as fo

    dataset = fo.load_dataset(...)

    session = fo.launch_app(dataset, remote=True)  # optional: port=XXXX

Leave the Python REPL running and follow the instructions for connecting to
this session remotely that were printed to your terminal (also described
below).

.. note::

    You can manipulate the `session` object on the remote machine as usual to
    programmatically interact with the App instance that you view locally.

If you do not have `fiftyone` installed on your local machine, open a new
terminal window on your local machine and execute the following command to
setup port forwarding to connect to your remote session:

.. code-block:: shell

    # On local machine
    ssh -N -L 5151:127.0.0.1:XXXX [<username>@]<hostname>

Leave this process running and open http://localhost:5151 in your browser to
access the App.

In the above, `[<username>@]<hostname>` specifies the remote machine to connect
to, `XXXX` refers to the port that you chose when you launched the session on
your remote machine (the default is 5151), and `5151` specifies the local port
to use to connect to the App (and can be customized).

Alternatively, if you have FiftyOne installed on your local machine, you can
:ref:`use the CLI <cli-fiftyone-app-connect>` to automatically configure port
forwarding and open the App in your browser as follows:

.. code-block:: shell

    # On local machine
    fiftyone app connect --destination [<username>@]<hostname>

If you choose a custom port `XXXX` on the remote machine, add a ``--port XXXX``
flag to the above command.

If you would like to use a custom local port, add a ``--local-port YYYY`` flag
to the above command.

.. note::

    You can customize the local/remote ports used when launching remote
    sessions in order to connect/servce multiple remote sessions
    simultaneously.

.. note::

    If you use ssh keys to connect to your remote machine, you can use the
    optional `--ssh-key` argument of the
    :ref:`fiftyone app connect <cli-fiftyone-app-connect>` command.

    However, if you are using this key regularly,
    `it is recommended <https://unix.stackexchange.com/a/494485>`_ to add it
    to your `~/.ssh/config` as the default `IdentityFile`.

.. _notebooks:

Notebooks
_________

FiftyOne officialy supports `Jupyter Notebooks <https://jupyter.org>`_ and
`Google Colab Notebooks <https://colab.research.google.com>`_.

To use FiftyOne in a notebook, simply install `fiftyone` via `pip`:

.. code-block:: python
    :linenos:

    !pip install fiftyone

and load datasets as usual. When you run
:meth:`launch_app() <fiftyone.core.session.launch_app>` in a notebook, an App
window will be opened in the output of your current cell.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    # Creates a session and opens the App in the output of the cell
    session = fo.launch_app(dataset)

Any time you update the state of your ``session`` object; e.g., by setting
:meth:`session.dataset <fiftyone.core.session.Session.dataset>` or
:meth:`session.view <fiftyone.core.session.Session.view>`, a new App window
will be automatically opened in the output of the current cell. The previously
active App will be replaced with a screenshot of itself.

An App that was replaced with a screenshot can be reactivated by clicking on
the screenshot if within the notebooj environment in which it was created. Note
that the reactivated App will load the current state of the ``session`` object,
not the state in which the screenshot was taken.

.. code-block:: python
    :linenos:

    # A new App window will be created in the output of this cell
    session.view = dataset.take(10)

A screenshot of the active App can be taken with
:meth:`session.freeze() <fiftyone.core.session.Session.freeze>`. This is
useful when you are finished with your notebook and ready to share it with
others.

.. code-block:: python
    :linenos:

    # Ensure only screenshots of FiftyOne Apps exist, so the notebook can be
    # shared
    session.freeze()

Manually controlling App instances
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you would like to manually control when new App instances are created in a
notebook, you can pass the ``auto=False`` flag to
:meth:`launch_app() <fiftyone.core.session.launch_app>`:

.. code-block:: python
    :linenos:

    # Creates a session but does not open an App instance
    session = fo.launch_app(dataset, auto=False)

When ``auto=False`` is provided, a new App window is created only when you call
:meth:`session.show() <fiftyone.core.session.Session.show>`:

.. code-block:: python
    :linenos:

    # Update the session's view; no App windows is created
    session.view = dataset.take(10)

    # In another cell

    # Now open an App window in the cell's output
    session.show()

As usual, this App window will remain connected to your ``session`` object, so
it will stay in-sync with your session whenever it is active.

.. note::

    If you run :meth:`session.show() <fiftyone.core.session.Session.show>` in
    multiple cells, only the most recently created App window will be active,
    i.e., synced with the ``session`` object.

    You can reactivate an older cell by clicking the link in the deactivated
    App window, or by running the cell again. This will deactivate the
    previously active cell.

Opening the App in a dedicated tab
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you are working from a Jupyter notebook, you can open the App in a separate
browser tab rather than working with it in cell output(s).

To do this, pass the ``auto=False`` flag to
:meth:`launch_app() <fiftyone.core.session.launch_app>` when you launch the
App and then call
:meth:`session.open_tab() <fiftyone.core.session.Session.open_tab>`:

.. code-block:: python
    :linenos:

    # Launch the App in a dedicated browser tab
    session = fo.launch_app(dataset, auto=False)
    session.open_tab()

Using the desktop App
~~~~~~~~~~~~~~~~~~~~~

If you are working from a Jupyter notebook on a machine with the
:ref:`FiftyOne Desktop App <installing-fiftyone-desktop>` installed, you can
optionally open the desktop App rather than working with the App in cell
output(s).

To do this, pass the ``desktop=True`` flag to
:meth:`launch_app() <fiftyone.core.session.launch_app>`:

.. code-block:: python
    :linenos:

    # Creates a session and launches the desktop App
    session = fo.launch_app(dataset, desktop=True)

.. _cloud-storage:

Cloud storage
_____________

FiftyOne does not yet support accessing data directly in a cloud bucket.
Instead, the best practice that we recommend is to mount the cloud bucket as a
local drive on a cloud compute instance.

The following sections describe how to do this in the :ref:`AWS <aws>`,
:ref:`Google Cloud <google-cloud>`, and :ref:`Miscrosoft Azure <azure>` cloud
environments.

.. _aws:

Amazon Web Services
~~~~~~~~~~~~~~~~~~~

If your data is stored in an AWS S3 bucket, we recommend mounting the bucket as
a local drive on an EC2 instance and then accessing the data using the standard
workflow for remote data.

The steps below outline the process.

**Step 1**

`Create an EC2 instance <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html>`_.
We recommend a Linux instance.

**Step 2**

Now `ssh into the instance <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AccessingInstancesLinux.html>`_
and :ref:`install FiftyOne <installing-fiftyone>` if necessary.

.. code-block:: shell

    # On remote machine
    pip install fiftyone

.. note::

    You may need to :ref:`install some system packages <compute-instance-setup>`
    on your compute instance instance in order to run FiftyOne.

**Step 3**

Mount the S3 bucket as a local drive.

We recommend using `s3fs-fuse <https://github.com/s3fs-fuse/s3fs-fuse>`_ for
this. You will need to make a `.passwd-s3fs` file that contains your AWS
credentials as outlined in the
`s3fs-fuse README <https://github.com/s3fs-fuse/s3fs-fuse>`_.

.. code-block:: shell

    # On remote machine
    s3fs <bucket-name> /path/to/mount/point \
        -o passwd_file=.passwd-s3fs \
        -o umask=0007,uid=<your-user-id>

**Step 4**

Now that you can access your data from the compute instance, start up Python
and :ref:`create a FiftyOne dataset <loading-datasets>` whose filepaths are in
the mount point you specified above. Then you can launch the App and work with
it locally in your browser using :ref:`remote sessions <remote-data>`.

.. _google-cloud:

Google Cloud
~~~~~~~~~~~~

If your data is stored in a Google Cloud storage bucket, we recommend mounting
the bucket as a local drive on a GC compute instance and then accessing the
data using the standard workflow for remote data.

The steps below outline the process.

**Step 1**

`Create a GC compute instance <https://cloud.google.com/compute/docs/quickstart-linux>`_.
We recommend a Linux instance.

**Step 2**

Now `ssh into the instance <https://cloud.google.com/compute/docs/quickstart-linux#connect_to_your_instance>`_
and :ref:`install FiftyOne <installing-fiftyone>` if necessary.

.. code-block:: shell

    # On remote machine
    pip install fiftyone

.. note::

    You may need to :ref:`install some system packages <compute-instance-setup>`
    on your compute instance instance in order to run FiftyOne.

**Step 3**

Mount the GCS bucket as a local drive.

We recommend using `gcsfuse <https://github.com/GoogleCloudPlatform/gcsfuse>`_
to do this:

.. code-block:: shell

    # On remote machine
    gcsfuse my-bucket /path/to/mount --implicit-dirs

**Step 4**

Now that you can access your data from the compute instance, start up Python
and :ref:`create a FiftyOne dataset <loading-datasets>` whose filepaths are in
the mount point you specified above. Then you can launch the App and work with
it locally in your browser using :ref:`remote sessions <remote-data>`.

.. _azure:

Microsoft Azure
~~~~~~~~~~~~~~~

If your data is stored in an Azure storage bucket, we recommend mounting the
bucket as a local drive on an Azure compute instance and then accessing the
data using the standard workflow for remote data.

The steps below outline the process.

**Step 1**

`Create an Azure compute instance <https://docs.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal>`_.
We recommend a Linux instance.

**Step 2**

Now `ssh into the instance <https://docs.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal#connect-to-virtual-machine>`_
and :ref:`install FiftyOne <installing-fiftyone>` if necessary.

.. code-block:: shell

    # On remote machine
    pip install fiftyone

.. note::

    You may need to :ref:`install some system packages <compute-instance-setup>`
    on your compute instance instance in order to run FiftyOne.

**Step 3**

Mount the Azure storage container in the instance.

This is fairly straight forward if your data is stored in a blob container.
We recommend using `blobfuse <https://github.com/Azure/azure-storage-fuse>`_
for this.

**Step 4**

Now that you can access your data from the compute instance, start up Python
and :ref:`create a FiftyOne dataset <loading-datasets>` whose filepaths are in
the mount point you specified above. Then you can launch the App and work with
it locally in your browser using :ref:`remote sessions <remote-data>`.

.. _compute-instance-setup:

Setting up a cloud instance
___________________________

When you create a fresh cloud compute instance, you may need to install some
system packages in order to install and use FiftyOne.

For example, the script below shows a set of commands that may be used to
configure a Debian-like Linux instance, after which you should be able to
successfully :ref:`install FiftyOne <installing-fiftyone>`.

.. code-block:: shell

    # Example setup script for a Debian-like virtual machine

    # System packages
    sudo apt update
    sudo apt -y upgrade
    sudo apt install -y build-essential
    sudo apt install -y unzip
    sudo apt install -y cmake
    sudo apt install -y cmake-data
    sudo apt install -y pkg-config
    sudo apt install -y libsm6
    sudo apt install -y libxext6
    sudo apt install -y libssl-dev
    sudo apt install -y libffi-dev
    sudo apt install -y libxml2-dev
    sudo apt install -y libxslt1-dev
    sudo apt install -y zlib1g-dev
    sudo apt install -y python3
    sudo apt install -y python-dev
    sudo apt install -y python3-dev
    sudo apt install -y python3-pip
    sudo apt install -y python3-venv
    sudo apt install -y ffmpeg  # if working with video

    # (Recommended) Create a virtual environment
    python3 -m venv fiftyone-env
    . fiftyone-env/bin/activate

    # Python packages
    pip install --upgrade pip setuptools wheel
    pip install ipython
