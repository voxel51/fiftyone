
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

* :ref:`Cloud storage <cloud-storage>`: Data is stored in a cloud bucket
  (e.g., :ref:`S3 <AWS>`, :ref:`GCS <google-cloud>`, or :ref:`Azure <azure>`)

* `Window`: The display mode to use for the App, "browser" or "desktop",
  which can be passed to any method or CLI command that creates a session via
  the `window` argument. The `FIFTYONE_DEFAULT_WINDOW` environment variable can
  also be used for a persistent setting. If "browser", the desktop App must be
  installed. See :ref:`Installing FiftyOne <installing-fiftyone>` for more
  details.

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

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset, remote=True)  # (optional) port=XXXX

Leave this session running, and note that instructions for connecting to this
remote session were printed to your terminal (these are described below).

If you do not have `fiftyone` installed on your local machine, and do not want
to install it, you can set up port forwarding manually, and view the App in
your browser.

.. code-block:: shell

    # `[<username>@]<hostname>` refers to your remote machine
    ssh -N -L 5151:127.0.0.1:%d [<username>@]<hostname>

If you have `fiftyone` installed on the local machine, you can
:ref:`use the CLI <cli-fiftyone-app-connect>` to automatically configure port
forwarding and open the App in either `window` mode.

In a local terminal, run the command:

.. code-block:: shell

    # On local machine
    fiftyone app connect --destination <user>@<remote-ip-address> --port 5151 # (Optional) --ssh-key /path/to/key

.. note::

    If you are using :ref:`ssh keys instead of a password to login <cli-fiftyone-app-connect>` then you
    can use the kwarg `--ssh-key`. Though if you are using this key
    more often, `it is recommended to add it
    <https://unix.stackexchange.com/a/494485>`_ to your `~/.ssh/config` as
    the default `IdentityFile`.

The above instructions assume that you used the default port `5151` when
launching the remote session on the remote machine. If you used a custom port,
then substitute the appropriate value in the local commands too.

.. note::

    You can use custom ports when launching remote sessions in order to serve
    multiple remote sessions simultaneously.

.. _notebooks:

Notebooks
_________

FiftyOne officialy supports Jupyter and Google Colaboratory notebook
environments. To use FiftyOne in a notebook, install `fiftyone` via `pip`,
and create a session:

.. code-block:: python
    :linenos:

    !pip install fiftyone
    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.Session(dataset)

Anytime you would like visualize your data in the App, simply call the
:meth:`show() <fiftyone.core.session.Session.show>` method:

.. code-block:: python
   :linenos:

   session.show()

To cut down on resource usage in the notebook, only one App cell can be active
at any given time. To activate a different cell, simply click `Activate` in
the deactivated window, or run the cell again.

If you would like to open the App in a dedicated browser tab, you can get the
URL of the session view the :attr:`url <fiftyone.core.session.Session.url>`
property.

.. note::

   Currently, each session maintains a single state. Therefore displaying the
   App once in the notebook is often sufficient. The window will continue to
   update as you work in the notebook.

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
-------------------

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
    pip install --index https://pypi.voxel51.com fiftyone

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
the mount point you specified above. Then launch the App as a
:ref:`remote session <remote-session>`:

.. code-block:: python
    :linenos:

    # On remote machine
    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset, remote=True)  # (optional) port=XXXX

**Step 5**

Finally, on your local machine, connect to the remote session that you started
on the cloud instance.

.. code-block:: bash

    # On local machine
    fiftyone app connect --destination <user>@<remote-ip-address> --port 5151 # (Optional) --ssh-key /path/to/key

The above instructions assume that you used the default port `5151` when
launching the remote session on the remote machine. If you used a custom port,
then substitute the appropriate value in the local commands too.

.. note::

    If you are using :ref:`ssh keys instead of a password to login <cli-fiftyone-app-connect>` then you
    can use the kwarg `--ssh-key`. Though if you are using this key
    more often, `it is recommended to add it
    <https://unix.stackexchange.com/a/494485>`_ to your `~/.ssh/config` as
    the default `IdentityFile`.


.. _google-cloud:

Google Cloud
------------

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
    pip install --index https://pypi.voxel51.com fiftyone

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
the mount point you specified above. Then launch the App as a
:ref:`remote session <remote-session>`:

.. code-block:: python
    :linenos:

    # On remote machine
    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset, remote=True)  # (optional) port=XXXX

**Step 5**

Finally, on your local machine, connect to the remote session that you started
on the cloud instance.

.. code-block:: bash

    # On local machine
    fiftyone app connect --destination <user>@<remote-ip-address> --port 5151 # (Optional) --ssh-key /path/to/key

The above instructions assume that you used the default port `5151` when
launching the remote session on the remote machine. If you used a custom port,
then substitute the appropriate value in the local commands too.

.. note::

    If you are using :ref:`ssh keys instead of a password to login <cli-fiftyone-app-connect>` then you
    can use the kwarg `--ssh-key`. Though if you are using this key
    more often, `it is recommended to add it
    <https://unix.stackexchange.com/a/494485>`_ to your `~/.ssh/config` as
    the default `IdentityFile`.

.. _azure:

Microsoft Azure
---------------

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
    pip install --index https://pypi.voxel51.com fiftyone

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
the mount point you specified above. Then launch the App as a
:ref:`remote session <remote-session>`:

.. code-block:: python
    :linenos:

    # On remote machine
    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset, remote=True)  # (optional) port=XXXX

**Step 5**

Finally, on your local machine, connect to the remote session that you started
on the cloud instance.

.. code-block:: bash

    # On local machine
    fiftyone app connect --destination <user>@<remote-ip-address> --port 5151 # (Optional) --ssh-key /path/to/key

The above instructions assume that you used the default port `5151` when
launching the remote session on the remote machine. If you used a custom port,
then substitute the appropriate value in the local commands too.

.. note::

    If you are using :ref:`ssh keys instead of a password to login <cli-fiftyone-app-connect>` then you
    can use the kwarg `--ssh-key`. Though if you are using this key
    more often, `it is recommended to add it
    <https://unix.stackexchange.com/a/494485>`_ to your `~/.ssh/config` as
    the default `IdentityFile`.

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

