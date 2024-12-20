#!/bin/bash

if [ $# -lt 1 ]; then
  echo "Usage: $0 <kubernetes-namespace>"
  exit 1
fi

NAMESPACE="${1}"

if ! kubectl get ns "$NAMESPACE" &>/dev/null; then
    echo "Namespace ${NAMESPACE} not found! Exiting..."
    exit 1
fi

GIT_ROOT=$(git rev-parse --show-toplevel)
DOT_ENV="$GIT_ROOT/teams-app/.env"

# Get base dev .env
gcloud storage cp \
    gs://voxel51-fiftyone-ai/dev-env-files/deploy/dev/.env \
    "${DOT_ENV}" \
    --project computer-vision-team

NAME=${NAMESPACE//-ephem-fiftyone-ai}

DOT_ENV_KEYS=(
    CAS_SECURE_COOKIE
    CAS_DATABASE_NAME
    TEAMS_API_DATABASE_NAME
    FIFTYONE_DATABASE_NAME
    MONGO_DEFAULT_DB
    FIFTYONE_DATABASE_URI
    MONGO_URI
    FIFTYONE_AUTH_SECRET
    TEAMS_API_MONGODB_URI
    CAS_DATABASE_URI
    CAS_MONGODB_URI
    FIFTYONE_ENCRYPTION_KEY
    LICENSE_KEY_FILE_PATHS
    BASE_URL
    FIFTYONE_API_URI
    NEXTAUTH_URL
    CAS_URL
    CAS_BASE_URL
    FIFTYONE_SERVER_ADDRESS
    FIFTYONE_TEAMS_PROXY_URL
    FIFTYONE_SERVER_PATH_PREFIX
    API_URL
)

REPLACEMENTS=(
    "true"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.fiftyoneDatabaseName}' $NAME-ephem-teams-secrets | base64 -d)-cas"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.fiftyoneDatabaseName}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.fiftyoneDatabaseName}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.fiftyoneDatabaseName}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.mongodbConnectionString}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.mongodbConnectionString}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.fiftyoneAuthSecret}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.mongodbConnectionString}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.mongodbConnectionString}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.mongodbConnectionString}' $NAME-ephem-teams-secrets | base64 -d)"
    "$(kubectl get secret -n $NAMESPACE -o jsonpath='{.data.encryptionKey}' $NAME-ephem-teams-secrets | base64 -d)"
    "$GIT_ROOT/license.key"
    "https://${NAME}.ephem.fiftyone.ai"
    "https://${NAME}-api.ephem.fiftyone.ai"
    "https://${NAME}.ephem.fiftyone.ai/cas/api/auth"
    "https://${NAME}.ephem.fiftyone.ai"
    "http://teams-cas:80/cas/api"
    "https://${NAME}.ephem.fiftyone.ai"
    "http://fiftyone-app:80"
    "/api/proxy/fiftyone-teams"
    "https://${NAME}-api.ephem.fiftyone.ai"
)

echo "" >>  "${DOT_ENV}"
for i in "${!DOT_ENV_KEYS[@]}"; do
    echo "${DOT_ENV_KEYS[$i]}=\"${REPLACEMENTS[$i]}\"" >> "${DOT_ENV}"
done

cp "${DOT_ENV}" "$GIT_ROOT/package/teams/.env"