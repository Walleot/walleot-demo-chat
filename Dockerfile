FROM node:22.23.4-alpine3.24 AS runner
RUN apk add --no-cache --upgrade ca-certificates ca-certificates-bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
