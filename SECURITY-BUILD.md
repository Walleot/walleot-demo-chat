Build on your workstation, then transfer the resulting image to the server. Do not build on Lightsail.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
docker build --pull --platform linux/arm64 -t walleot-demo-chat:node22.23.4 .
```

The Dockerfile packages the locally built output. Node 22.23.4 and refreshed Alpine CA packages remove the compromised October 2026 emSign trust anchors. Keep local build-time configuration available for the application build; `.env` files are excluded from the image context.
