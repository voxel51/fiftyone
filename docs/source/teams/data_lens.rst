.. _data-lens:

Data Lens
=========

.. default-role:: code

Data Lens is a feature built into the :ref:`FiftyOne Teams App <teams-app>`
which allows you to use FiftyOne to explore and import samples from any data
source. Whether your data resides in a database like PostgreSQL or a data lake
like Google BigQuery, Data Lens provides a way to search your data sources,
visualize sample data, and import into FiftyOne for further analysis.

.. _data-lens-how-it-works:

How it works
____________

.. image:: /images/teams/data_lens_home.png
    :alt: data-lens-home-tab
    :align: center

.. _data-lens-connecting-a-data-source:

Connecting a data source
------------------------

A data source represents anywhere that you store your data outside of FiftyOne.
This could be a local SQL database, a hosted data lake, or an internal data
platform. To connect to your data source, you'll first implement a simple
operator which FiftyOne can use to communicate with your data source.

Once your operator is defined, you can navigate to the "Data sources" tab by
clicking on the tab header or by clicking on "Connect to a data source" from
the "Home" tab.

.. image:: /images/teams/data_lens_data_sources_empty.png
    :alt: data-lens-data-sources-empty
    :align: center

Add a new data source by clicking on "Add data source".

Enter a useful name for your data source and provide the URI for your operator.
The URI should have the format `<your-plugin-name>/<your-operator-name>`.

.. image:: /images/teams/data_lens_add_data_source.png
    :alt: data-lens-add-data-source
    :align: center

Click "Connect" once you're finished to save your configuration.

.. image:: /images/teams/data_lens_data_sources.png
    :alt: data-lens-data-sources
    :align: center

If you need to update your Data Lens configuration, simply click the action
menu icon and select "Edit". Similarly, you can delete a Data Lens
configuration by clicking the action menu icon and selecting "Delete".

That's it. Now you're ready to explore your data source. You can head over to
the "Query data" tab and start interacting with your data.

.. note::

    Don't have a Data Lens operator yet? When you're ready to get started, you
    can follow our detailed :ref:`integration guide <data-lens-integration>`.

.. _data-lens-querying-data:

Exploring samples
-----------------

Once you've connected to a data source, you can open the "Query data" tab to
start working with your data.

In this tab, you can select from your connected data sources using the
"Select a data source" dropdown.

Below this dropdown, you can parameterize your search using the available
query parameters. These parameters are unique to each connected data source,
allowing you to tailor your search experience to exactly what you need.
Selecting a new data source will automatically update the query parameters to
match those expected by your data source.

.. image:: /images/teams/data_lens_query.png
    :alt: data-lens-query
    :align: center

After you enter your query parameters, you can click the "Preview data" button
at the bottom of the page to fetch samples which match your query parameters.
These samples will be displayed in the preview panel, along with any features
associated with the sample like labels or bounding boxes.

.. image:: /images/teams/data_lens_preview.png
    :alt: data-lens-preview
    :align: center

You can use the zoom slider to control the size of the samples, and you can
modify the number of preview samples shown by changing the "Number of preview
samples" input value and clicking "Preview data" again.

If you want to change your search, simply reopen the query parameters panel
and modify your inputs. Clicking "Preview data" will fetch new samples matching
the current query parameters.

If you want to import your samples into FiftyOne for further analysis, you can
import your samples to a dataset.

.. _data-lens-importing-to-fiftyone:

Importing samples to FiftyOne
-----------------------------

After generating a preview in Data Lens, you can click on the "Import data"
button to open the import dialog.

.. image:: /images/teams/data_lens_import_dialog.png
    :alt: data-lens-import-dialog
    :align: center

Imports can be limited to a specific number of samples, or you can import all
samples matching your query parameters.

After configuring the size of your import, select a destination dataset for the
samples. This can be an existing dataset, or you can choose to create a new
dataset.

.. note::

    During import, Data Lens will attempt to de-duplicate samples based on
    their `filepath` attribute. This behavior is the same when importing into
    either existing or new datasets.

You can optionally add tags to the imported samples. These tags will be
added to the `sample.tags` field automatically by the Data Lens framework. If
your samples already have tags, these tags will be appended.

When you click import, you will have the option to either execute immediately
or to schedule this import for asynchronous execution. For most cases, it is
recommended to schedule the import, as this will result in more consistent
and performant execution. Immediate execution should only be used for very
small sample sizes.

.. image:: /images/teams/data_lens_import_options.png
    :alt: data-lens-import-options
    :align: center

.. note::

    Scheduled imports use the
    :ref:`delegated operations <delegated-operations>` framework to execute.
    Your FiftyOne delegated operations configuration may affect the import
    options that are available to you. Speak with your system administrator
    if you have any questions.

After selecting your execution preference, you will be able to monitor the
status of your import through the information provided by the import panel.

In the case of immediate execution, you will be presented with an option to
view your samples once the import is complete. Clicking on this button will
open your destination dataset containing your imported samples.

.. image:: /images/teams/data_lens_immediate_import.png
    :alt: data-lens-immediate-import
    :align: center

In the case of scheduled execution, you will be presented with an option to
visit the Runs page.

.. image:: /images/teams/data_lens_scheduled_import.png
    :alt: data-lens-scheduled-import
    :align: center

From the Runs page, you can track the status of your import.

.. image:: /images/teams/data_lens_runs_page.png
    :alt: data-lens-runs-page
    :align: center

Once your samples are imported, you will be able to leverage the full
capabilities of FiftyOne to analyze and curate your data, and you can continue
to use Data Lens to augment your datasets.

.. image:: /images/teams/data_lens_imported_samples.png
    :alt: data-lens-imported-samples
    :align: center

.. _data-lens-integration:

Integrating with Data Lens
__________________________

Data Lens makes use of FiftyOne's powerful
:ref:`plugins framework <fiftyone-plugins>` to allow you to tailor your
experience to meet the needs of your data. As part of the plugin framework,
you are able to create custom :ref:`operators <plugins-design-operators>`,
which are self-contained Python classes that provide custom functionality to
FiftyOne.

Data Lens defines an operator interface which makes it easy to connect to your
data sources. We'll walk through an example of creating your first Data Lens
operator.

.. _data-lens-setup:

Setting up your operator
------------------------

To assist with Data Lens integration, we can use the
:class:`DataLensOperator <fiftyone.operators.data_lens.operator.DataLensOperator>`
base class provided with the Teams SDK. This base class handles the
implementation for the operator's `execute` method, and defines a single
abstract method that we'll implement.

.. code-block:: python
    :linenos:

    # my_plugin/__init__.py
    from typing import Generator

    import fiftyone.operators as foo
    from fiftyone.operators.data_lens import (
        DataLensOperator,
        DataLensSearchRequest,
        DataLensSearchResponse
    )


    class MyCustomDataLensOperator(DataLensOperator):
        """Custom operator which integrates with Data Lens."""

        @property
        def config(self) -> foo.OperatorConfig:
            return foo.OperatorConfig(
                name="my_custom_data_lens_operator",
                label="My custom Data Lens operator",
                unlisted=True,
                execute_as_generator=True,
            )

        def handle_lens_search_request(
            self,
            request: DataLensSearchRequest,
            ctx: foo.ExecutionContext
        ) -> Generator[DataLensSearchResponse, None, None]
            # We'll implement our logic here
            pass

Let's take a look at what we have so far.

.. code-block:: python
    :linenos:

    class MyCustomDataLensOperator(DataLensOperator):

Our operator extends the
:class:`DataLensOperator <fiftyone.operators.data_lens.operator.DataLensOperator>`
provided by the Teams SDK. This base class defines the abstract
:meth:`handle_lens_search_request <fiftyone.operators.data_lens.operator.DataLensOperator.handle_lens_search_request>`
method, which we will need to implement.

.. code-block:: python
    :linenos:

    @property
    def config(self) -> foo.OperatorConfig:
        return foo.OperatorConfig(
            # This is the name of your operator. FiftyOne will canonically
            # refer to your operator as <your-plugin>/<your-operator>.
            name="my_custom_data_lens_operator",

            # This is a human-friendly label for your operator.
            label="My custom Data Lens operator",

            # Setting unlisted to True prevents your operator from appearing
            # in lists of general-purpose operators (such as OpenDataset).
            # While not required, we recommend setting unlisted=True for
            # Data Lens operators.
            unlisted=True,

            # For compatibility with the  DataLensOperator base class, we
            # instruct FiftyOne to execute our operator as a generator.
            execute_as_generator=True,
        )

The :meth:`config(self) <fiftyone.operators.operator.Operator.config>` property
is part of the standard :ref:`operator interface <operator-interface>` and
provides configuration options for your operator.

.. code-block:: python
    :linenos:

    def handle_lens_search_request(
            self,
            request: DataLensSearchRequest,
            ctx: foo.ExecutionContext
        ) -> Generator[DataLensSearchResponse, None, None]
            pass

The
:meth:`handle_lens_search_request <fiftyone.operators.data_lens.operator.DataLensOperator.handle_lens_search_request>`
method provides us with two arguments (aside from `self`) - a
:class:`DataLensSearchRequest <fiftyone.operators.data_lens.models.DataLensSearchRequest>`
instance, and the current operator execution context.

The
:class:`DataLensSearchRequest <fiftyone.operators.data_lens.models.DataLensSearchRequest>`
is generated by the Data Lens framework and provides information about the
Data Lens user's query. The request object has
the following properties:

-   `request.search_params`: a dict containing the search parameters provided
    by the Data Lens user.
-   `request.batch_size`: a number indicating the maximum number of samples to
    return in a single batch.
-   `request.max_results`: a number indicating the maximum number of
    samples to return in total (the sum of all batches).

.. note::

    The Data Lens framework will automatically truncate responses to adhere
    to `request.max_results`. Any sample data beyond this limit will be
    discarded.

The `ctx` argument provides access to a
:ref:`range of useful capabilities <operator-execution-context>` which you can
leverage in your operator, including things like
:ref:`providing secrets to your operator <operator-secrets>`.

Using these inputs, we are expected to return a generator which yields
:class:`DataLensSearchResponse <fiftyone.operators.data_lens.models.DataLensSearchResponse>`
objects. To start, we'll create some synthetic data to better understand the
interaction between Data Lens and our operator. We'll look at a
:ref:`more realistic example <data-lens-realistic-example>` later on.

.. note::

    Why a generator? Generators provide a convenient approach for long-lived,
    lazy-fetching connections that are common in databases and data lakes.
    While Data Lens does support operators which do not execute as generators,
    we recommend using a generator during the beta period of this feature.

.. _data-lens-generating-responses:

Generating search responses
---------------------------

To adhere to the Data Lens interface, we need to yield
:class:`DataLensSearchRequest <fiftyone.operators.data_lens.models.DataLensSearchResponse>`
objects from our operator. A
:class:`DataLensSearchRequest <fiftyone.operators.data_lens.models.DataLensSearchResponse>`
is comprised of the following fields:

-   `response.result_count`: a number indicating the number of samples being
    returned in this response.
-   `response.query_result`: a list of dicts containing serialized
    :class:`Sample <fiftyone.core.sample.Sample>` data, e.g. obtained via
    :meth:`to_dict() <fiftyone.core.sample.Sample.to_dict>`.

.. note::

    Data Lens expects sample data to adhere to the
    :class:`fo.Sample <fiftyone.core.sample.Sample>` format. It is highly recommended that
    you use the FiftyOne SDK to create your sample data.

To see how Data Lens works, let's yield a response with a single synthetic
sample.

.. code-block:: python
    :linenos:

    def handle_lens_search_request(
        self,
        request: DataLensSearchRequest,
        ctx: foo.ExecutionContext
    ) -> Generator[DataLensSearchResponse, None, None]
        # We'll use a placeholder image for our synthetic data
        image_url = "https://placehold.co/150x150"

        # Create a sample using the SDK
        synthetic_sample = fo.Sample(filepath=image_url)

        # Convert our samples to dicts
        samples = [synthetic_sample.to_dict()]

        # We'll ignore any inputs for now and yield a single response
        yield DataLensSearchResponse(
            result_count=len(samples),
            query_result=samples
        )

Let's see what this looks like in Data Lens. After adding the operator as a
data source, we can navigate to the "Query data" tab to interact with the
operator. When we click the preview button, the Data Lens framework invokes
our operator to retrieve sample data. Our operator yields a single sample, and
we see that sample shown in the preview.

.. image:: /images/teams/data_lens_synthetic_sample.png
    :alt: data-lens-synthetic-sample
    :align: center

Let's modify our operator to incorporate the `request.batch_size` property.

.. code-block:: python
    :linenos:

    def handle_lens_search_request(
        self,
        request: DataLensSearchRequest,
        ctx: foo.ExecutionContext
    ) -> Generator[DataLensSearchResponse, None, None]
        samples = []

        # Generate number of samples equal to request.batch_size
        for i in range(request.batch_size):
            samples.append(
                fo.Sample(
                    # We'll modify our synthetic data to include the
                    # sample's index as the image text.
                    filepath=f"https://placehold.co/150x150?text={i + 1}"
                ).to_dict()
            )

        # Still yielding a single response
        yield DataLensSearchResponse(
            result_count=len(samples),
            query_result=samples
        )

Now if we re-run our preview, we see that we get a number of samples equal to
the "Number of preview samples" input.

.. image:: /images/teams/data_lens_synthetic_batch.png
    :alt: data-lens-synthetic-batch
    :align: center

If we modify that number and regenerate the preview, we can see that the number
of samples remains in sync. For preview functionality, Data Lens fetches
sample data in a single batch, so we can expect these values to be the same.

.. _data-lens-working-with-user-data:

Working with user-provided data
-------------------------------

Let's now look at how Data Lens users are able to interact with our operator.
Data Lens is designed to enable users to quickly explore samples of interest,
and a key component is providing users a way to control the behavior of our
operator.

To achieve this, we simply need to define the possible inputs to our operator
in the
:meth:`resolve_input() <fiftyone.operators.operator.Operator.resolve_input>`
method.

.. code-block:: python
    :linenos:

    def resolve_input(self):
        # We define our inputs as an object.
        # We'll add specific fields to this object which represent a single input.
        inputs = types.Object()

        # Add a string field named "sample_text"
        inputs.str("sample_text", label="Sample text")

        return types.Property(inputs)

.. note::

    For more information on operator inputs, see
    :ref:`the plugin documentation <operator-inputs>`.

With this method implemented, Data Lens will construct a form allowing users
to define any or all of these inputs.

.. image:: /images/teams/data_lens_synthetic_query.png
    :alt: data-lens-synthetic-query
    :align: center

We can then use this data to change the behavior of our operator. Let's add
logic to integrate `sample_text` into our operator.

.. code-block:: python
    :linenos:

    def handle_lens_search_request(
        self,
        request: DataLensSearchRequest,
        ctx: foo.ExecutionContext
    ) -> Generator[DataLensSearchResponse, None, None]
        # Retrieve our "sample_text" input from request.search_params.
        # These parameter names should match those used in resolve_input().
        sample_text = request.search_params.get("sample_text", "")

        samples = []

        # Create a sample for each character in our input text
        for i in range(len(sample_text)):
            samples.append(
                fo.Sample(
                    filepath=f"https://placehold.co/150x150?text={sample_text[i]}"
                ).to_dict()
            )

            # Yield batches when we have enough samples
            if len(samples) == request.batch_size:
                yield DataLensSearchResponse(
                    result_count=len(samples),
                    query_result=samples
                )

                # Reset our batch
                samples = []

        # We've generated all our samples, but might be in the middle of a batch
        if len(samples) > 0:
            yield DataLensSearchResponse(
                result_count=len(samples),
                query_result=samples
            )

        # Now we're done :)

Now when we run our preview, we can see that the text we provide as input is
reflected in the samples returned by our operator. Modifying the text and
regenerating the preview yields the expected result.

.. image:: /images/teams/data_lens_synthetic_text.png
    :alt: data-lens-synthetic-text
    :align: center

There are a couple things to note about the changes we made here.

-   Inputs can be specified with `required=True`, in which case Data Lens will
    ensure that the user provides a value for that input. If an input is not
    explicitly required, then we should be sure to handle the case where it is
    not present.
-   In most real scenarios, our operator will be processing more samples than
    fit in a single batch. (This is even true here, where there is no upper
    bound on our input length). As such, our operator should respect the
    `request.batch_size` parameter and yield batches of samples as they are
    available.

.. note::

    This example is meant to illustrate how users can interact with our
    operator. For a more realistic view into how inputs can tailor our search
    experience, see our example
    :ref:`integration with BigQuery <data-lens-realistic-example>`.

.. _data-lens-preview-vs-import:

Differences in preview and import
---------------------------------

While the examples here are focused on preview functionality, the Data Lens
framework invokes your operator in the same way to achieve both preview and
import functionality. The `request.batch_size` and `request.max_results`
parameters can be used to optimize your data retrieval, but preview and import
should otherwise be treated as functionally equivalent.

.. _data-lens-realistic-example:

Example: Integrating with Google BigQuery
_________________________________________

To give a more realistic example of a Data Lens operator, let's take a look at
how we might integrate with a dataset in Google BigQuery. The full, functional
source code is listed below.

.. code-block:: python
    :linenos:

    import fiftyone.operators as foo
    import fiftyone.operators.types as types
    from fiftyone.operators.data_lens import (
        DataLensOperator,
        DataLensSearchRequest,
        DataLensSearchResponse
    )
    from google.cloud import bigquery


    class BigQueryConnector(DataLensOperator):
        @property
        def config(self):
            return foo.OperatorConfig(
                name="bq_connector",
                label="BigQuery Connector",
                unlisted=True,
                execute_as_generator=True,
            )

        def resolve_input(self, ctx):
            inputs = types.Object()

            # We'll enable searching on detection labels
            inputs.str("detection_label", label="Detection label", required=True)

            return types.Property(inputs)

        def handle_lens_search_request(
                self,
                request: DataLensSearchRequest,
                ctx: foo.ExecutionContext,
        ) -> Generator[DataLensSearchResponse, None, None]:
            handler = BigQueryHandler()
            for batch in handler.handle_request(request):
                yield batch


    class BigQueryHandler:
        def handle_request(
            self,
            request: DataLensSearchRequest
        ) -> Generator[DataLensSearchResponse, None, None]:
            # Create our client
            client = bigquery.Client()

            try:
                # Retrieve our Data Lens search parameters
                detection_label = request.search_params.get("detection_label", "")

                # Construct our query
                query = """
                        SELECT
                            media_path, tags, detections, keypoints
                        FROM `my_dataset.samples_json`,
                        UNNEST(JSON_QUERY_ARRAY(detections)) as detection
                        WHERE JSON_VALUE(detection.label) = @detection_label
                    """

                # Submit our query to BigQuery
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter(
                            "detection_label",
                            "STRING",
                            detection_label
                        )
                    ]
                )
                query_job = client.query(query, job_config=job_config)

                # Wait for results
                rows = query_job.result(
                        # BigQuery will handle pagination automatically, but
                        # we can optimize its behavior by synchronizing with
                        # the parameters provided by Data Lens
                        page_size=request.batch_size,
                        max_results=request.max_results
                )

                samples = []

                # Iterate over data from BigQuery
                for row in rows:

                    # Transform sample data from BigQuery format to FiftyOne
                    samples.append(self.convert_to_sample(row))

                    # Yield next batch when we have enough samples
                    if len(samples) == request.batch_size:
                        yield DataLensSearchResponse(
                            result_count=len(samples),
                            query_result=samples
                        )

                        # Reset our batch
                        samples = []

                # We've run out of rows, but might have a partial batch
                if len(samples) > 0:
                    yield DataLensSearchResponse(
                        result_count=len(samples),
                        query_result=samples
                    )

                # Our generator is now exhausted

            finally:
                # Clean up our client on exit
                client.close()

Let's take a look at a few parts in detail.

.. code-block:: python
    :linenos:

    # Retrieve our Data Lens search parameters
    detection_label = request.search_params.get("detection_label", "")

    # Construct our query
    query = """
            SELECT
                media_path, tags, detections, keypoints
            FROM `my_dataset.samples_json`,
            UNNEST(JSON_QUERY_ARRAY(detections)) as detection
            WHERE JSON_VALUE(detection.label) = @detection_label
        """

Here we're using our user-provided input parameters to tailor our query to only
the samples of interest. This logic can be as simple or complex as needed to
match our use case.

.. code-block:: python
    :linenos:

    # Wait for results
    rows = query_job.result(
            # BigQuery will handle pagination automatically, but
            # we can optimize its behavior by synchronizing with
            # the parameters provided by Data Lens
            page_size=request.batch_size,
            max_results=request.max_results
    )

Here we're using `request.batch_size` and `request.max_results` to help
BigQuery align its performance with our use case. In cases where
`request.max_results` is smaller than our universe of samples (such as during
preview or small imports), we can prevent fetching more data than we need,
improving both query performance and operational cost.

.. code-block:: python
    :linenos:

    # Transform sample data from BigQuery format to FiftyOne
    samples.append(self.convert_to_sample(row))

Here we are converting our sample data from its storage format to a
:class:`FiftyOne Sample <fiftyone.core.sample.Sample>`. This is where we will add features
to our samples, such as :class:`labels <fiftyone.core.labels.Label>` or
:class:`detections <fiftyone.core.labels.Detections>` by leveraging the
FiftyOne SDK.

As we can see from this example, we can make our Data Lens search experience
as powerful as it needs to be. We can leverage internal libraries and services,
hosted solutions, and tooling that meets the specific needs of our data. We
can expose flexible but precise controls to users to allow them to find exactly
the data that's needed.