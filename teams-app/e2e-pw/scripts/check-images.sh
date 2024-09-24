#!/usr/bin/env bash

SCRIPTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
COMPOSE_FILE=${SCRIPTS_DIR}/docker-compose.yml

# Check if images are available and download them if not
IMAGES=$(docker-compose -f $COMPOSE_FILE config 2>/dev/null | awk '/image:/ {print $2}')

IS_MISSING_IMAGE=false
# Check each service's image availability
for IMAGE in $IMAGES; do
    IMAGE_NAME_TAG=$(echo $IMAGE | awk -F'/' '{print $NF}')
    IMAGE_NAME=$(echo $IMAGE_NAME_TAG | awk -F':' '{print $1}')

    echo "Checking image: $IMAGE_NAME_TAG"
    if ! docker inspect $IMAGE &>/dev/null; then
        if [ "$IMAGE_NAME" = "fiftyone-teams-app" ] && [ "$CI" != true ]; then
            echo "Skipping fiftyone-teams-app image check in dev mode."
        else
            echo "$IMAGE_NAME_TAG is missing, skipping other image checks and pulling all images."
            IS_MISSING_IMAGE=true
            break
        fi
    fi
done

if [ "$IS_MISSING_IMAGE" = true ]; then
    echo "Pulling images..."
    echo "Logging in to GCR..."
    gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://us-central1-docker.pkg.dev
    docker compose -f "$COMPOSE_FILE" pull
else
    echo "All images are available."
fi
