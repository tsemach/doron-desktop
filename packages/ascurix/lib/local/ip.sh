# IP allocation for ascurix.
#
# Each worktree gets a deterministic loopback alias derived from its own
# absolute path, so re-running `ascurix init` in the same worktree is
# idempotent and needs no persisted state. Collisions are resolved by
# scanning sibling worktrees via `git worktree list` instead of keeping a
# separate registry file -- git already tracks which worktrees exist, so a
# hand-rolled registry would just be a second source of truth that can go
# stale (e.g. after `git worktree remove`).
#
# Default pool is 127.0.0.2 - 127.0.0.254: the whole 127.0.0.0/8 block is
# loopback with zero OS configuration on Linux/macOS, unlike an arbitrary
# routable range (e.g. 10.10.10.x), which would need to be aliased onto
# `lo` by hand (see warn_if_non_loopback).
IP_POOL_BASE=2
IP_POOL_SIZE=253 # 127.0.0.2 .. 127.0.0.254

hash_to_offset() {
  local input="$1" hash
  hash=$(printf '%s' "$input" | cksum | cut -d' ' -f1)
  echo $((hash % IP_POOL_SIZE))
}

candidate_ip() {
  local offset="$1"
  echo "127.0.0.$((IP_POOL_BASE + offset))"
}

# Reads another worktree's already-assigned IP, if it ever ran
# `ascurix init`. Returns non-zero (with no output) if it hasn't.
worktree_assigned_ip() {
  local wt_root="$1" env_file
  env_file="$wt_root/apps/desktop/.env.local"
  if [ ! -f "$env_file" ]; then
    return 1
  fi
  grep '^TAURI_DEV_HOST=' "$env_file" | tail -n1 | cut -d= -f2-
}

# Lists IPs already claimed by *other* worktrees of this repo.
used_ips() {
  local self_root="$1"
  git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
    if [ "$wt" = "$self_root" ]; then
      continue
    fi
    worktree_assigned_ip "$wt" 2>/dev/null || true
  done
}

# allocate_ip [explicit_ip] -- prints the IP to use for this worktree.
allocate_ip() {
  local explicit_ip="${1:-}"
  if [ -n "$explicit_ip" ]; then
    echo "$explicit_ip"
    return 0
  fi

  local self_root taken offset tries=0
  self_root="$(worktree_root)"
  taken="$(used_ips "$self_root")"
  offset="$(hash_to_offset "$self_root")"

  while [ "$tries" -lt "$IP_POOL_SIZE" ]; do
    local ip
    ip="$(candidate_ip "$offset")"
    if ! printf '%s\n' "$taken" | grep -qx "$ip"; then
      echo "$ip"
      return 0
    fi
    offset=$(((offset + 1) % IP_POOL_SIZE))
    tries=$((tries + 1))
  done

  echo "ascurix: could not find a free loopback IP in the 127.0.0.0/24 pool" >&2
  return 1
}

warn_if_non_loopback() {
  local ip="$1"
  case "$ip" in
    127.*) ;;
    *)
      cat >&2 <<EOF
ascurix: $ip is outside 127.0.0.0/8, so it is not loopback by default.
You need to alias it onto the loopback interface yourself before 'pnpm dev'
is reachable at that address, e.g. on Linux:

  sudo ip addr add ${ip}/32 dev lo

ascurix will not run this for you.
EOF
      ;;
  esac
}
