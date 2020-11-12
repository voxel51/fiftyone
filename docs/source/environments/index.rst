FiftyOne Environments
=====================
.. _environments:

.. default-role:: code

This is a guide to using FiftyOne with data stored in various environments, for
example, how to work with remote data.


Terminology:

* :ref:`Local Machine <local-data>` - Data is stored on the same machine on which FiftyOne
  is installed

* :ref:`Remote Machine <remote-data>` - Data is stored on a disk remotely

* :ref:`Cloud <cloud-data>` - Data is stored in a cloud bucket like :ref:`AWS <AWS>`/:ref:`Azure <Azure>`/:ref:`GCS <google-cloud>`


.. _local-data:

Local Data
__________

When working with data that is stored on disk on the same machine that is
running FiftyOne, the data can be loaded into the App directly.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset)


The FiftyOne App will then be launched with the |Dataset| loaded. The suggested workflow
is to use the App in conjuction with an `ipython` session where you loaded
your |Dataset|.


.. _remote-data:

Remote Data
___________

If you are accessing data that is stored on a remote machine that you have
`ssh`
access to, you can easily load up a FiftyOne dataset remotely and view it
locally.


First `ssh` into your remote machine.
Then :doc:`create a Dataset in FiftyOne </user_guide/dataset_creation/index>` using Python on the remote machine and
launch a remote session. 

.. code-block:: python
    :linenos:

    # On remote machine

    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

    session = fo.launch_app(dataset, remote=True) # (Optional) port=XXXX


Leave this session running and go back to your local
machine.
On your local machine, you need to set up port forwarding via `ssh` and connect
to the App. This can be done either through the CLI or Python.

.. tabs::

  .. group-tab:: CLI

    On the local machine, you can :ref:`use the CLI <cli-fiftyone-app-connect>`
    to automatically configure port forwarding and open the App.

    In a local terminal, run the command:

    .. code-block:: shell

        # On local machine
        fiftyone app connect --destination username@remote_machine_ip --port 5151

  .. group-tab:: Python

    Open two terminal windows on the local machine. In order to forward the
    port `5151` from the remote machine to the local machine, run the following
    command in one terminal and leave the process running:

    .. code-block:: shell

        # On local machine
        ssh -N -L 5151:127.0.0.1:5151 username@remote_machine_ip

    Port `5151` is now being forwarded from the remote machine to port
    `5151` of the local machine.

    In the other terminal, launch the FiftyOne App locally by starting Python
    and running the following commands:

    .. code-block:: python
        :linenos:

        # On local machine
        import fiftyone.core.session as fos

        fos.launch_app()


The default port is `5151`, but if you entered an optional port, then
use that port here.
You will have to use a separate port in order to launch two remote sessions
from the same machine

.. _cloud-data:

Cloud Data
__________


FiftyOne does not yet support accessing data directly in a cloud bucket, but
there are best practices for mounting data stored in:

* :ref:`AWS <AWS>`

* :ref:`Azure <Azure>`

* :ref:`Google Cloud <google-cloud>`




.. _AWS:

AWS
---

You can use FiftyOne if your data is stored in an AWS S3 bucket.
For the best results, it is recommended to mount the container in an AWS VM
instance
and then access the data remotely from there. The steps to do so are outline
below.

Step 1
^^^^^^

`Start a Linux VM on AWS that you can ssh into.
<https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html>`_


Step 2
^^^^^^

`ssh into the VM and install FiftyOne.
<https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AccessingInstancesLinux.html>`_

.. code-block:: bash
    
    pip install --index https://pypi.voxel51.com fiftyone


Step 3
^^^^^^

Mount the S3 bucket in the VM.
We recommend you use the open source project `s3fs-fuse
<https://github.com/s3fs-fuse/s3fs-fuse>`_. You will need to make a
`.passwd-s3fs` file including your AWS credentials as outlined in the `s3fs-fuse
<https://github.com/s3fs-fuse/s3fs-fuse>`_ README.

.. code-block:: bash

    s3fs <bucket name> /path/to/mount/point -o passwd_file=.passwd-s3fs -o umask=0007,uid=<your user id>


Step 4
^^^^^^

Now that you can access your data from within the VM, start up Python and
:doc:`create a FiftyOne Dataset. </user_guide/dataset_creation/index>`

Then start a remote FiftyOne session.

.. code-block:: python

    session = fo.launch_app(dataset, remote=True) # (optional) port=XXXX


Step 5
^^^^^^

On your local machine, connect to the port on the VM and launch the local App.

First open an `ssh` connection connecting to port `5151` (or any other port if you
set an optional port in the previous step)

.. code-block:: bash

    ssh -N -L 5151:127.0.0.1:5151 -i <key>.pem <user>@<VM address>


Then launch the App from python on your local machine.

.. code-block:: python

    import fiftyone as fo
    fo.launch_app()




.. _Azure:

Azure
-----

You can use FiftyOne if your data is stored in an Azure storage container.
For the best results, it is recommended to mount the container in an Azure VM
and then access the data remotely from there. The steps to do so are outline
below.

Step 1
^^^^^^

`Start a Linux VM on Azure that you can ssh into. <https://docs.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal>`_


Step 2
^^^^^^

`ssh into the VM and install FiftyOne. <https://docs.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal#connect-to-virtual-machine>`_

.. code-block:: bash
    
    pip install --index https://pypi.voxel51.com fiftyone


Step 3
^^^^^^

Mount the Azure storage container in the VM.

This is fairly straight forward if your data is stored in a blob container. 
In this case, we recommend you use the open source project `blobfuse <https://github.com/Azure/azure-storage-fuse>`_


Step 4
^^^^^^

Now that you can access your data from within the VM, start up Python and
:doc:`create a FiftyOne Dataset. </user_guide/dataset_creation/index>`

Then start a remote FiftyOne session.

.. code-block:: python

    session = fo.launch_app(dataset, remote=True) # (optional) port=XXXX


Step 5
^^^^^^

On your local machine, connect to the port on the VM and launch the local App.

First open an `ssh` connection connecting to port `5151` (or any other port if you
set an optional port in the previous step)

.. code-block:: bash

    ssh -N -L 5151:127.0.0.1:5151 -i <key>.pem <user>@<VM ip address>


Then launch the App from python on your local machine.

.. code-block:: python

    import fiftyone as fo
    fo.launch_app()


.. _google-cloud:

Google Cloud
------------

You can use FiftyOne if your data is stored in an Google Cloud storage bucket.
For the best results, it is recommended to mount the container in a Google
Cloud Platform VM
and then access the data remotely from there. The steps to do so are outline
below.

Step 1
^^^^^^

`Start a Linux VM on Google Cloud that you can ssh into.
<https://cloud.google.com/compute/docs/quickstart-linux>`_


Step 2
^^^^^^

`ssh into the VM and install FiftyOne.
<https://cloud.google.com/compute/docs/quickstart-linux#connect_to_your_instance>`_

.. code-block:: bash
    
    pip install --index https://pypi.voxel51.com fiftyone


Step 3
^^^^^^

Mount the Google Cloud storage bucket in the VM.
In this case, we recommend you use the open source project `gcsfuse
<https://github.com/GoogleCloudPlatform/gcsfuse>`_

.. code-block:: bash

    gcsfuse my-bucket /path/to/mount --implicit-dirs



Step 4
^^^^^^

Now that you can access your data from within the VM, start up Python and
:doc:`create a FiftyOne Dataset. </user_guide/dataset_creation/index>`

Then start a remote FiftyOne session.

.. code-block:: python

    session = fo.launch_app(dataset, remote=True) # (optional) port=XXXX


Step 5
^^^^^^

On your local machine, connect to the port on the VM and launch the local App.

First open an `ssh` connection connecting to port `5151` (or any other port if you
set an optional port in the previous step).
You may need to `set up your ssh key.
<https://cloud.google.com/compute/docs/instances/adding-removing-ssh-keys#project-wide>`_

.. code-block:: bash

    ssh -N -L 5151:127.0.0.1:5151 -i <key> <user>@<VM ip address>


Then launch the App from Python on your local machine.

.. code-block:: python

    import fiftyone as fo
    fo.launch_app()
