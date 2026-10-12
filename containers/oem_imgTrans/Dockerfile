FROM public.ecr.aws/docker/library/node:22-trixie-slim

WORKDIR /app

RUN apt-get -o Acquire::Retries=3 update \
  && apt-get -o Acquire::Retries=3 install -y --no-install-recommends libheif-examples libheif-plugin-libde265 \
  && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libheif1)" ge 1.23.4 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["npm", "start"]
