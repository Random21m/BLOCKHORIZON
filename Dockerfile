# BLOCKHORIZON as a container: the static site served by nginx. Optionally proxies a mempool server (your own node's
# mempool, on Umbrel, Start9 or anywhere) at /api, so the browser talks only to this container.
#   docker build -t blockhorizon .
#   docker run -p 8080:80 blockhorizon                                          # data from mempool.space
#   docker run -p 8080:80 -e MEMPOOL_URL=http://192.168.1.20:3006 blockhorizon  # data from your node's mempool
# With MEMPOOL_URL set, alarms can also reach your phone (ntfy) while no browser is open: see packaging/README.md.
# Keep /var/lib/blockhorizon on a volume so waiting alarms survive a restart (browsers also send them again on start).
FROM nginx:1.27-alpine
COPY packaging/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY packaging/40-blockhorizon.sh /docker-entrypoint.d/40-blockhorizon.sh
COPY packaging/push.js /etc/nginx/bh-push.js
COPY index.html embed.html embed.css style.css sw.js manifest.webmanifest privacy.html config.json /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY src /usr/share/nginx/html/src
COPY docs /usr/share/nginx/html/docs
RUN chmod +x /docker-entrypoint.d/40-blockhorizon.sh
ENV MEMPOOL_URL=""
VOLUME /var/lib/blockhorizon
EXPOSE 80
