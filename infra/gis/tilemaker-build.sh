#!/bin/sh
set -eu
# This path is owned by GIS06.1. Never expose an incomplete SQLite database.
fingerprint=$(sha256sum /data/runtime/smolensk.osm.pbf /data/tilemaker.json /data/process-openmaptiles.lua /data/tilemaker-build.sh | sha256sum | cut -d' ' -f1)
if [ -f /data/runtime/smolensk.mbtiles ] && [ -f /data/runtime/tiles-complete ] && [ "$(cat /data/runtime/tiles-complete)" = "$fingerprint" ]; then
  echo 'Completed tiles checkpoint found; not rebuilding.'
  exit 0
fi
if [ -f /data/runtime/smolensk-building.mbtiles ]; then
  mv /data/runtime/smolensk-building.mbtiles "/data/runtime/smolensk-interrupted-$(date +%s).mbtiles"
fi
/usr/src/app/tilemaker /data/runtime/smolensk.osm.pbf --output /data/runtime/smolensk-building.mbtiles --config /data/tilemaker.json --process /data/process-openmaptiles.lua --threads 1 --store /data/runtime/tilemaker-store --skip-integrity
mv /data/runtime/smolensk-building.mbtiles /data/runtime/smolensk.mbtiles
printf '%s\n' "$fingerprint" > /data/runtime/tiles-complete
