#!/bin/sh
set -eu
# Keep configuration interpolation bounded to an alphabet that needs no Redis escaping.
case "$REDIS_PASSWORD" in *[!a-zA-Z0-9_-]*|'') echo 'REDIS_PASSWORD must use letters, digits, _ or -' >&2; exit 1;; esac
[ "${#REDIS_PASSWORD}" -ge 32 ] || { echo 'REDIS_PASSWORD needs at least 32 characters' >&2; exit 1; }
umask 077
printf 'bind 0.0.0.0\nprotected-mode yes\nrequirepass %s\nappendonly yes\nappendfsync everysec\nmaxmemory 128mb\nmaxmemory-policy noeviction\n' "$REDIS_PASSWORD" > /run/redis/redis.conf
chown redis:redis /run/redis/redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /run/redis/redis.conf
