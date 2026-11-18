FROM node:24-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app

COPY package.json ./
COPY src ./src

RUN mkdir -p /data && chown -R app:app /app /data

USER app
ENV NODE_ENV=production
ENV PORT=4010
ENV DATA_DIR=/data
EXPOSE 4010
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4010/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
