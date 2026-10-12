#!/bin/sh
# Entrypoint: link persistent data to mounted volume at /data
# First boot copies data from Docker image; subsequent boots use volume data

set -e

mkdir -p /data/session /data/backups
touch /data/cookies.txt

# Se YOUTUBE_COOKIES foi definido nas variáveis do Railway, sincroniza diretamente para /data/cookies.txt
if [ -n "$YOUTUBE_COOKIES" ]; then
  echo "Syncing YOUTUBE_COOKIES env var to persistent storage..."
  if echo "$YOUTUBE_COOKIES" | base64 -d >/dev/null 2>&1; then
    echo "$YOUTUBE_COOKIES" | base64 -d > /data/cookies.txt 2>/dev/null || printf "%b\n" "$YOUTUBE_COOKIES" > /data/cookies.txt
  else
    printf "%b\n" "$YOUTUBE_COOKIES" > /data/cookies.txt
  fi
fi

# On first boot (volume empty), migrate data from image to /data
for item in session bot_data.sqlite bot_data.json database.json cookies.txt user_facts.json backups; do
  if [ "$item" = "cookies.txt" ] && [ -f "/app/$item" ] && [ ! -L "/app/$item" ]; then
    if ! cmp -s "/app/$item" "/data/$item"; then
      echo "Updating $item in persistent volume..."
      cp -f "/app/$item" "/data/$item"
    fi
  elif [ ! -e "/data/$item" ] && [ -e "/app/$item" ]; then
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
