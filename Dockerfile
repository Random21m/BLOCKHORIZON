# BLOCKHORIZON as a container: the static site served by nginx. Optionally proxies a mempool server (your own node's
# mempool, on Umbrel, Start9 or anywhere) at /api, so the browser talks only to this container.
#   docker build -t blockhorizon .
#   docker run -p 8080:80 blockhorizon                                          # data from mempool.space
#   docker run -p 8080:80 -e MEMPOOL_URL=http://192.168.1.20:3006 blockhorizon  # data from your node's mempool
FROM nginx:1.27-alpine
COPY packaging/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY packaging/40-blockhorizon.sh /docker-entrypoint.d/40-blockhorizon.sh
COPY index.html embed.html embed.css style.css sw.js manifest.webmanifest privacy.html config.json /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY src /usr/share/nginx/html/src
COPY docs /usr/share/nginx/html/docs
RUN chmod +x /docker-entrypoint.d/40-blockhorizon.sh
ENV MEMPOOL_URL=""
EXPOSE 80
