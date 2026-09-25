import logging
import numpy as np
import eta.core.utils as etau
import fiftyone.core.utils as fou
from fiftyone.brain.similarity import (
    SimilarityConfig,
    Similarity,
    SimilarityIndex,
)
import fiftyone.brain.internal.core.utils as fbu

chromadb = fou.lazy_import("chromadb")

logger = logging.getLogger(__name__)

_SUPPORTED_METRICS = {
    "cosine": "cosine",
    "dotproduct": "ip",
    "euclidean": "l2",
}

class ChromaSimilarityConfig(SimilarityConfig):
    """Configuration for the ChromaDB similarity backend.

    Args:
        embeddings_field (None): the sample field containing the embeddings,
            if one was provided
        model (None): the :class:`fiftyone.core.models.Model` or name of the
            zoo model that was used to compute embeddings, if known
        patches_field (None): the sample field defining the patches being
            analyzed, if any
        supports_prompts (None): whether this run supports prompt queries
        collection_name (None): the name of a ChromaDB collection to use or
            create. If none is provided, a new collection will be created
        metric (None): the embedding distance metric to use when creating a
            new index. Supported values are
            ``("cosine", "dotproduct", "euclidean")``
        url (None): a ChromaDB server URL to use
    """

    def __init__(
        self,
        embeddings_field=None,
        model=None,
        patches_field=None,
        supports_prompts=None,
        collection_name=None,
        metric=None,
        url=None,
        settings=None,
        **kwargs,
    ):
        if metric is not None and metric not in _SUPPORTED_METRICS:
            raise ValueError(
                "Unsupported metric '%s'. Supported values are %s"
                % (metric, tuple(_SUPPORTED_METRICS.keys()))
            )

        super().__init__(
            embeddings_field=embeddings_field,
            model=model,
            patches_field=patches_field,
            supports_prompts=supports_prompts,
            **kwargs,
        )

        self.collection_name = collection_name
        self.metric = metric

        # store privately so these aren't serialized
        self._url = url

    @property
    def method(self):
        return "chromadb"

    @property
    def url(self):
        return self._url

    @url.setter
    def url(self, value):
        self._url = value

    @property
    def max_k(self):
        return None

    @property
    def supports_least_similarity(self):
        return False

    @property
    def supported_aggregations(self):
        return ("mean",)

    def load_credentials(
        self, url=None
    ):
        self._load_parameters(
            url=url,
        )

class ChromaSimilarity(Similarity):
    """ChromaDB similarity factory.

    Args:
        config: a :class:`ChromaDBSimilarityConfig`
    """

    def ensure_requirements(self):
        fou.ensure_package("chromadb")

    def ensure_usage_requirements(self):
        fou.ensure_package("chromadb")

    def initialize(self, samples, brain_key):
        return ChromaDBSimilarityIndex(
            samples, self.config, brain_key, backend=self
        )

class ChromaSimilarityIndex(SimilarityIndex):
    """Class for interacting with ChromaDB similarity indexes.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`ChromaDBSimilarityConfig` used
        brain_key: the brain key
        backend (None): a :class:`ChromaDBSimilarity` instance
    """

    def __init__(self, samples, config, brain_key, backend=None):
        super().__init__(samples, config, brain_key, backend=backend)
        self._client = None
        self._initialize()

    def _initialize(self):
        self._client=chromadb.HttpClient( 
            host=self.config._url,
            # port=self.config.port,
            ssl=False,
            # headers=self.config.headers, # headers managed and defined in config by user ~ no reason to be anymore opinionated 
            # settings=self.config.settings # should we dig into the source code and identify potential ramificatiosn of this? 
        )
        # self._client = chromadb.Client(
        #     #host=self.config.url
        # )

        try:
            collection_names = self._get_collection_names()
        except Exception as e:
            raise ValueError(
                "Failed to connect to ChromaDB backend at URL '%s'. Refer to "
                "https://docs.voxel51.com/integrations/chromadb.html for more "
                "information" % self.config.url
            ) from e

        if self.config.collection_name is None:
            root = "fiftyone-" + fou.to_slug(self.samples._root_dataset.name)
            collection_name = fbu.get_unique_name(root, collection_names)

            self.config.collection_name = collection_name
            self.save_config()

    def _get_collection_names(self):
        return [c.name for c in self._client.list_collections()]

    def _create_collection(self, dimension):
        metric = self.config.metric if self.config.metric else "cosign"
        self._client.create_collection(
            name=self.config.collection_name,
            metadata={"hnsw:space": _SUPPORTED_METRICS[metric]}
        )

    def _get_index_ids(self, batch_size=1000):
        ids = []

        offset = 0
        while True:
            response = self._client.get_collection(self.config.collection_name).peek()
            if not response:
                break
            ids.extend(response["ids"])
            if len(response) < batch_size:
                break

        return ids

    @property
    def total_index_size(self):
        try:
            return self._client.get_collection(self.config.collection_name).count()
        except:
            return 0

    @property
    def client(self):
        """The ``chromadb.ChromaClient`` instance for this index."""
        return self._client

    def add_to_index(
        self,
        embeddings,
        sample_ids,
        label_ids=None,
        overwrite=True,
        allow_existing=True,
        warn_existing=False,
        reload=True,
        batch_size=1000,
    ):
        if self.config.collection_name not in self._get_collection_names():
            self._create_collection(embeddings.shape[1])

        if label_ids is not None:
            ids = label_ids
        else:
            ids = sample_ids

        if warn_existing or not allow_existing or not overwrite:
            index_ids = self._get_index_ids()

            existing_ids = set(ids) & set(index_ids)
            num_existing = len(existing_ids)

            if num_existing > 0:
                if not allow_existing:
                    raise ValueError(
                        "Found %d IDs (eg %s) that already exist in the index"
                        % (num_existing, next(iter(existing_ids)))
                    )

                if warn_existing:
                    if overwrite:
                        logger.warning(
                            "Overwriting %d IDs that already exist in the "
                            "index",
                            num_existing,
                        )
                    else:
                        logger.warning(
                            "Skipping %d IDs that already exist in the index",
                            num_existing,
                        )
        else:
            existing_ids = set()

        if existing_ids and not overwrite:
            del_inds = [i for i, _id in enumerate(ids) if _id in existing_ids]
            embeddings = np.delete(embeddings, del_inds, axis=0)
            sample_ids = np.delete(sample_ids, del_inds)
            if label_ids is not None:
                label_ids = np.delete(label_ids, del_inds)

        embeddings = [e.tolist() for e in embeddings]
        sample_ids = list(sample_ids)
        if label_ids is not None:
            ids = list(label_ids)
        else:
            ids = list(sample_ids)

        collection = self._client.get_collection(self.config.collection_name)
        
        for _embeddings, _ids, _sample_ids in zip(
            fou.iter_batches(embeddings, batch_size),
            fou.iter_batches(ids, batch_size),
            fou.iter_batches(sample_ids, batch_size),
        ):
            collection.upsert(
                embeddings=list(_embeddings),
                metadatas=[{"sample_id": _id} for _id in _sample_ids],
                ids=list(_ids)
            )

        if reload:
            self.reload()

    def remove_from_index(
        self,
        sample_ids=None,
        label_ids=None,
        allow_missing=True,
        warn_missing=False,
        reload=True,
    ):
        if label_ids is not None:
            ids = label_ids
        else:
            ids = sample_ids

        if not ids:
            raise ValueError("You must provide either ids, where, or where_document to delete.")

        collection = self._client.get_collection(self.config.collection_name)

        if warn_missing or not allow_missing:
            existing_ids = collection.get()["ids"]
            missing_ids = list(set(ids) - set(existing_ids))
            num_missing_ids = len(missing_ids)

            if num_missing_ids > 0:
                if not allow_missing:
                    raise ValueError(
                        "Found %d IDs (eg %s) that do not exist in the index"
                        % (num_missing_ids, missing_ids[0])
                    )
                if warn_missing and not allow_missing:
                    logger.warning(
                        "Skipping %d IDs that do not exist in the index",
                        num_missing_ids,
                    )

        collection.delete(ids=ids)

        if reload:
            self.reload()


    def get_embeddings(
        self,
        sample_ids=None,
        label_ids=None,
        allow_missing=True,
        warn_missing=False,
    ):
        if label_ids is not None:
            if self.config.patches_field is None:
                raise ValueError("This index does not support label IDs")

            if sample_ids is not None:
                logger.warning(
                    "Ignoring sample IDs when label IDs are provided"
                )

        if sample_ids is not None and self.config.patches_field is not None:
            (
                embeddings,
                sample_ids,
                label_ids,
                missing_ids,
            ) = self._get_patch_embeddings_from_sample_ids(sample_ids)
        elif self.config.patches_field is not None:
            (
                embeddings,
                sample_ids,
                label_ids,
                missing_ids,
            ) = self._get_patch_embeddings_from_label_ids(label_ids)
        else:
            (
                embeddings,
                sample_ids,
                label_ids,
                missing_ids,
            ) = self._get_sample_embeddings(sample_ids)

        num_missing_ids = len(missing_ids)
        if num_missing_ids > 0:
            if not allow_missing:
                raise ValueError(
                    "Found %d IDs (eg %s) that do not exist in the index"
                    % (num_missing_ids, missing_ids[0])
                )

            if warn_missing:
                logger.warning(
                    "Skipping %d IDs that do not exist in the index",
                    num_missing_ids,
                )

        embeddings = np.array(embeddings)
        sample_ids = np.array(sample_ids)
        if label_ids is not None:
            label_ids = np.array(label_ids)

        return embeddings, sample_ids, label_ids

    def cleanup(self):
        if self.config.collection_name in self._get_collection_names():
            self._client.delete_collection(self.config.collection_name)


    def _retrieve_points(self, ids):
        return self._client.get_collection(self.config.collection_name).get(ids=ids, include=['embeddings','metadatas'])

    def _get_sample_embeddings(self, sample_ids):
        if sample_ids is None:
            sample_ids = self._get_index_ids()

        response = self._retrieve_points(sample_ids)

        found_embeddings = response["embeddings"]
        found_sample_ids = response["ids"]
        missing_ids = list(set(sample_ids) - set(found_sample_ids))

        return found_embeddings, found_sample_ids, None, missing_ids

    def _get_patch_embeddings_from_label_ids(self, label_ids):
        if label_ids is None:
            label_ids = self._get_index_ids()

        response = self._retrieve_points(label_ids)

        found_embeddings = response['embeddings']
        found_sample_ids = [metadata['sample_id'] for metadata in response['metadatas']]
        found_label_ids = response['ids']
        missing_ids = list(set(label_ids) - set(found_label_ids))

        return found_embeddings, found_sample_ids, found_label_ids, missing_ids

    def _get_patch_embeddings_from_sample_ids(self, sample_ids):
        collection = self._client.get_collection(self.config.collection_name)
        filter_query = {"sample_id": {"$in": sample_ids}}

        response = collection.query(
            query_embeddings=[],
            n_results=len(sample_ids),
            where=filter_query
        )

        found_embeddings = response['embeddings']
        found_sample_ids = [metadata['sample_id'] for metadata in response['metadatas']]
        found_label_ids = response['ids']
        missing_ids = list(set(sample_ids) - set(found_sample_ids))

        return found_embeddings, found_sample_ids, found_label_ids, missing_ids


    def _kneighbors(
        self,
        query=None,
        k=None,
        reverse=False,
        aggregation=None,
        return_dists=False,
    ):
        if query is None:
            raise ValueError("ChromaDB does not support full index neighbors")

        if reverse is True:
            raise ValueError(
                "ChromaDB does not support least similarity queries"
            )

        if aggregation not in (None, "mean"):
            raise ValueError("Unsupported aggregation '%s'" % aggregation)

        if k is None:
            k = self.index_size

        query = self._parse_neighbors_query(query)
        if aggregation == "mean" and query.ndim == 2:
            query = query.mean(axis=0)

        single_query = query.ndim == 1
        if single_query:
            query = [query]

        if self.has_view:
            if self.config.patches_field is not None:
                index_ids = self.current_label_ids
            else:
                index_ids = self.current_sample_ids

            filter_query = {"$or": [{"id": _id} for _id in index_ids]}
        else:
            filter_query = None

        ids = []
        dists = []
        collection = self._client.get_collection(self.config.collection_name)
        for q in query:
            # Ensure the query embeddings are converted to standard Python floats
            query_embeddings = [float(val) for val in q]
            results = collection.query(
                query_embeddings=query_embeddings,
                n_results=k,
                where=filter_query
            )
            
            ids.extend(results["ids"])
            if return_dists:
                dists.append([r['distance'] for r in results])

        if single_query:
            ids = ids[0]
            if return_dists:
                dists = dists[0]

        if return_dists:
            return ids, dists

        return ids


    def _parse_neighbors_query(self, query):
        if etau.is_str(query):
            query_ids = [query]
            single_query = True
        else:
            query = np.asarray(query)

            # Query by vector(s)
            if np.issubdtype(query.dtype, np.number):
                return query

            query_ids = list(query)
            single_query = False

        # Query by ID(s)
        response = self._retrieve_points(query_ids)
        query = np.array([r['vector'] for r in response])

        if single_query:
            query = query[0, :]

        return query

    @classmethod
    def _from_dict(cls, d, samples, config, brain_key):
        return cls(samples, config, brain_key)

