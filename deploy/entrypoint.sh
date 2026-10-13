#!/bin/sh
set -eu
umask 077
# Require an operator-created marker INSIDE the explicit mounted persistent volume.
# It is not included in the image. A missing mount must fail, not create a new mailbox.
if [ ! -f /data/.nookwire-persistent-volume ]; then
    printf '%s\n' '{"event":"startup_failed","message":"An initialized persistent volume is required."}' >&2
    exit 1
fi
exec "$@"
