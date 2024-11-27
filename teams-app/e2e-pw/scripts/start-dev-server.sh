#!/usr/bin/env bash

set -o allexport

MONGO_CONTAINER_NAME=e2e-mongo
TEAMS_API_CONTAINER_NAME=e2e-teams-api
TEAMS_APP_CONTAINER_NAME=e2e-teams-app
FIFTYONE_APP_CONTAINER_NAME=e2e-teams-fiftyone-app

# Get the directory path of the script
SCRIPTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
ROOT_DIR=$(dirname ${SCRIPTS_DIR})
COMPOSE_FILE=${SCRIPTS_DIR}/docker-compose.yml

${SCRIPTS_DIR}/sync-oss.sh

TEAMS_APP_DEV_PORT=3057

LOGS_DIR=${ROOT_DIR}/.logs
API_LOGS_DIR=${LOGS_DIR}/api
TEAMS_APP_LOGS_DIR=${LOGS_DIR}/teams-app
FIFTYONE_APP_LOGS_DIR=${LOGS_DIR}/fiftyone-app

mkdir -p "$API_LOGS_DIR"
mkdir -p "$TEAMS_APP_LOGS_DIR"
mkdir -p "$FIFTYONE_APP_LOGS_DIR"

IS_CI=${CI:-false}
if [ "${IS_CI}" = true ]; then
    set -o xtrace

    echo "Running in CI mode"
    ENV_FILE=${ROOT_DIR}/.env.ci
else
    echo "Running in dev mode"
    ENV_FILE=${ROOT_DIR}/.env.dev
fi

source ${ENV_FILE}

if [ "${IS_CI}" = false ]; then
    # In dev mode, API server is accessible over host network
    export API_URL="http://127.0.0.1:8005"
else
    # In CI, API server is accessible over docker default network with container name as hostname
    export API_URL="http://teams-api:8005"
fi

# Define the signal handler function
cleanup() {
    echo "Interrupt signal received."

    if [ "${IS_CI}" = false ]; then
        echo "Stopping dev server (PID: ${DEVSERVER_PID})..."
        kill -9 ${DEVSERVER_PID}
    fi

    echo "Stopping containers..."
    docker compose -f ${COMPOSE_FILE} kill
}

# Trap the SIGINT signal and call the cleanup function
trap cleanup SIGINT SIGTERM

# Make sure docker is installed
${SCRIPTS_DIR}/check-docker.sh
IS_DOCKER_GOOD_RETURN_CODE=$?
if [ ${IS_DOCKER_GOOD_RETURN_CODE} -ne 0 ]; then
    exit 1
fi

# Check images unless SKIP_IMAGE_CHECK is set
if [ "${SKIP_IMAGE_CHECK}" != true ]; then
    ${SCRIPTS_DIR}/check-images.sh
    CHECK_IMAGES_RETURN_CODE=$?
    if [ ${CHECK_IMAGES_RETURN_CODE} -ne 0 ]; then
        exit 1
    fi
fi

# Set services to start based on CI mode
if [ "${IS_CI}" = true ]; then
    SERVICES="mongodb teams-api fiftyone-app teams-app"
else
    SERVICES="mongodb teams-api fiftyone-app"
fi

# Start teams app if dev
if [ "${IS_CI}" != true ]; then
    DEVSERVER_COMMAND="source ${ENV_FILE} && cd ../app/packages/app && yarn dev --port ${TEAMS_APP_DEV_PORT}"
    eval ${DEVSERVER_COMMAND} 2>&1 | tee "${TEAMS_APP_LOGS_DIR}/dev-server.log" &
    DEVSERVER_PID=$!
fi

echo "Starting containers in the background. Logs are available in ${LOGS_DIR}, or run 'docker logs -f <container-name>'"
docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} up ${SERVICES} --detach

# save logs to file
docker logs -f ${TEAMS_API_CONTAINER_NAME} &>${API_LOGS_DIR}/api.log &
docker logs -f ${FIFTYONE_APP_CONTAINER_NAME} &>${FIFTYONE_APP_LOGS_DIR}/fiftyone-app.log &
if [ "${IS_CI}" = true ]; then
    docker logs -f ${TEAMS_APP_CONTAINER_NAME} &>${TEAMS_APP_LOGS_DIR}/teams-app.log &
fi

if [ -n "${DEVSERVER_PID}" ]; then
    wait "${DEVSERVER_PID}"
fi
