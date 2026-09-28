#!/bin/sh
# Entrypoint: link persistent data to mounted volume at /data
# First boot copies data from Docker image; subsequent boots use volume data

set -e

mkdir -p /data/session /data/backups

# On first boot (volume empty), migrate data from image to /data
for item in session bot_data.sqlite bot_data.json database.json cookies.txt user_facts.json backups; do
  if [ ! -e "/data/$item" ] && [ -e "/app/$item" ]; then
    echo "Migrating $item to persistent volume..."
    cp -r "/app/$item" "/data/$item"
  fi
done

# Replace image files with symlinks to /data volume
for item in session bot_data.sqlite bot_data.json database.json cookies.txt user_facts.json backups; do
  if [ ! -L "/app/$item" ]; then
    rm -rf "/app/$item"
    ln -sf "/data/$item" "/app/$item"
  fi
done

cd /app
exec "$@"
