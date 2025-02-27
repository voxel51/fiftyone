
Upgrading MongoDB Binaries
==========================

Voxel51 advises performing database backups of your mongodb
data directory whenever performing a database upgrade.

.. note::

    The following steps apply to FiftyOne users who utilize
    the pre-packaged FiftyOne MongoDB instance. If you utilize
    a :ref:`custom/shared MongoDB database <configuring-mongodb-connection>`,
    follow the upgrade path advised by your database provider.

.. _mongodb-7-to-8:

Upgrading Mongodb 7 to Mongodb 8
------------------------------------

1. Stop the FiftyOne session and exit the python interpreter.
   Ensure that the mongo process has been shut down.

    **Mac/Linux users:**

    .. code-block:: shell

        ps -ef | egrep "fiftyone.*mongod"

    **Windows users:**

    .. code-block:: shell
    
        Get-Process | \
            Where-Object { \
                $_.Name -like "*fiftyone*" \
                -and $_.Name -like "*mongod*" \
            }

2. Upgrade FiftyOne to 1.3.0+ and fiftyone-db to 1.2.0+

    .. code-block:: shell

        pip install --upgrade fiftyone fiftyone[db]

3. Relaunch FiftyOne

4. `Install mongosh <https://www.mongodb.com/docs/mongodb-shell/install/>`_

5. Find the MongoDB URI using your operating systems network libraries

    **Mac/Linux users:**

    .. code-block:: shell

        sudo lsof -iTCP -sTCP:LISTEN -P -n | egrep "mongod"

    **Windows users:**

    .. code-block:: shell
    
        Get-NetTCPConnection | \
            Where-Object { $_.State -eq 'Listen' } | \
            Select-String -Pattern "mongod"

6. Connect to mongodb using mongosh

    .. code-block:: shell

        mongosh "$URI_FROM_ABOVE"

7. Run the following command:

    .. code-block:: javascript
    
        db.adminCommand({ 
            setFeatureCompatibilityVersion: "8.0", 
            confirm: true 
        })

        // Verify the upgrade
        db.adminCommand({ 
            getParameter: 1, 
            featureCompatibilityVersion: 1 
        })
