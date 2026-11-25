#!/bin/sh
# With MEMPOOL_URL set: proxy /api (REST and the live websocket) to that mempool server and point the app at it.
# Without it: the app uses mempool.space directly, as on the public site.
set -eu
html=/usr/share/nginx/html inc=/etc/nginx/conf.d/bh-proxy.inc
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
  printf '{ "server": "self" }\n' > "$html/config.json"
  echo "blockhorizon: data from $url (proxied at /api)"
else
  : > "$inc"; rm -f /etc/nginx/conf.d/bh-map.conf
  printf '{ "server": "" }\n' > "$html/config.json"
  echo "blockhorizon: data from mempool.space"
fi
