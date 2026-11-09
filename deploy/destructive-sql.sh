#!/usr/bin/env bash
# Reads one migration on stdin. Exits 0 and prints the statements that may destroy data
# (drop, delete, truncate, alter … type), exits 1 if there are none. Used by deploy.sh.
# Foreign-key actions (`on delete cascade`, `on update set null`, …) are not deletes: they are removed first,
# so a migration that only adds tables with foreign keys passes. Plain POSIX tools (GNU and BSD sed).
found=$(sed 's/--.*$//' | tr 'A-Z' 'a-z' | tr '\n' ' ' | tr ';' '\n' \
  | sed -E 's/on[[:space:]]+(delete|update)[[:space:]]+(cascade|set[[:space:]]+null|set[[:space:]]+default|restrict|no[[:space:]]+action)//g' \
  | grep -E '\b(drop|delete|truncate)\b|\balter\b.*\btype\b' || true)
[ -n "$found" ] || exit 1
sed -E 's/[[:space:]]+/ /g; s/^ //' <<<"$found"
