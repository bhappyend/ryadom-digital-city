#!/bin/bash
set -euo pipefail
# Upstream uses bash -x and would print its DB password. Run pinned copies without xtrace.
export NOMINATIM_PASSWORD="$(cat /run/secrets/nominatim_password)"
for script in config init start; do
  sed '1s/ -ex/ -e/;s|/app/config.sh|/tmp/ryadom-config.sh|g;s|/app/init.sh|/tmp/ryadom-init.sh|g' "/app/$script.sh" > "/tmp/ryadom-$script.sh"
  chmod 700 "/tmp/ryadom-$script.sh"
done
# Bound osm2pgsql cache explicitly; upstream auto-sizing sees host memory rather than container limit.
sed -i 's/--threads \$THREADS/--threads $THREADS --osm2pgsql-cache 256/g' /tmp/ryadom-init.sh
exec bash /tmp/ryadom-start.sh
