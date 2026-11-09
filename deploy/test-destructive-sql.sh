#!/usr/bin/env bash
# Tests for destructive-sql.sh: every migration in apps/be/migrations must pass, and each destructive
# statement below must be caught. Run: deploy/test-destructive-sql.sh
set -uo pipefail
cd "$(dirname "$0")/.."
check=deploy/destructive-sql.sh
fails=0
expect() { # expect <0 caught|1 passes> <name> <sql>
  printf '%s' "$3" | "$check" >/dev/null; got=$?
  if [ "$got" = "$1" ]; then echo "ok   $2"; else echo "FAIL $2 (exit $got, want $1)"; fails=$((fails + 1)); fi
}
for f in apps/be/migrations/*.sql; do expect 1 "$f passes" "$(cat "$f")"; done
expect 1 'fk on delete cascade'  'create table a (id text references b(id) on delete cascade);'
expect 1 'fk ON DELETE SET NULL'  'create table a (id text REFERENCES b(id) ON DELETE SET NULL ON UPDATE NO ACTION);'
expect 1 'fk across lines'        $'create table a (\n  id text references b(id)\n    on delete\n    restrict);'
expect 1 'comment mentions drop'  $'-- we never drop this\ncreate table a (id text);'
expect 0 'delete from'            'delete from runs where id = 1;'
expect 0 'DROP TABLE'             'DROP TABLE runs;'
expect 0 'drop column'            'alter table runs drop column x;'
expect 0 'truncate'               'truncate run_events;'
expect 0 'alter … type'           'alter table runs alter column x type int;'
expect 0 'fk then a real delete'  'create table a (id text references b on delete cascade); delete from a;'
expect 0 'on delete in a delete'  'delete from a where on_delete = 1;'
[ "$fails" = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
