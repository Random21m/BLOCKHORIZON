#!/bin/sh
# With MEMPOOL_URL set: proxy /api (REST and the live websocket) to that mempool server and point the app at it, and
# turn on phone notifications for alarms (push.js, run by nginx's njs module).
# Without it: the app uses mempool.space directly, as on the public site.
set -eu
html=/usr/share/nginx/html inc=/etc/nginx/conf.d/bh-proxy.inc
njs=/etc/nginx/modules/ngx_http_js_module.so data=/var/lib/blockhorizon
rm -f /etc/nginx/conf.d/bh-map.conf /etc/nginx/conf.d/bh-push.conf
if [ -n "${MEMPOOL_URL:-}" ]; then
  url=$(printf '%s' "$MEMPOOL_URL" | sed 's:/*$::; s:/api$::')
  cat > "$inc" <<CONF
location /api/ {
  proxy_pass $url/api/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection \$connection_upgrade_bh;
  proxy_set_header Host \$proxy_host;
  proxy_ssl_server_name on;
  proxy_read_timeout 1h;
}
CONF
  printf 'map $http_upgrade $connection_upgrade_bh { default upgrade; "" close; }\n' > /etc/nginx/conf.d/bh-map.conf
  push=false
  if [ -f "$njs" ]; then
    grep -q 'ngx_http_js_module' /etc/nginx/nginx.conf || sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf
    mkdir -p "$data" && chown -R nginx:nginx "$data" 2>/dev/null || true
    # the DNS server this container uses (Docker's own on a compose network), for reaching the ntfy server
    ns=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)
    case "$ns" in *:*) ns="[$ns]" ;; esac
    {
      echo 'js_import bh from /etc/nginx/bh-push.js;'
      echo 'js_fetch_trusted_certificate /etc/ssl/certs/ca-certificates.crt;'
      echo 'js_fetch_timeout 20s;'
      [ -n "$ns" ] && echo "resolver $ns valid=300s;"
    } > /etc/nginx/conf.d/bh-push.conf
    cat >> "$inc" <<'CONF'
location = /push/sync { client_max_body_size 64k; client_body_buffer_size 64k; js_content bh.sync; }
location = /push/test { client_max_body_size 4k; client_body_buffer_size 4k; js_content bh.test; }
location @bh_check { js_periodic bh.check interval=60s; }
CONF
    push=true
  fi
  printf '{ "server": "self", "push": %s }\n' "$push" > "$html/config.json"
  echo "blockhorizon: data from $url (proxied at /api); phone notifications: $push"
else
  : > "$inc"
  printf '{ "server": "" }\n' > "$html/config.json"
  echo "blockhorizon: data from mempool.space"
fi
