This is a demo chat application built with Next.js, showcasing Walleot payments. It communicates with a demo MCP image generator server over Streamable HTTP (see https://github.com/blustAI/node-paymcp-server-demo).
It generates images in exchange for demo credits.

To use it, simply request an image — the system will prompt for a payment (in demo credits) before generating the image.

Create .env.local file with:

```
OPENAI_API_KEY = xxxxx
```

Run the development server:

```bash
pnpm dev
```

[Live Demo](https://demo.walleot.com)


### Backend (MCP server)
This client expects a Model Context Protocol (MCP) server from https://github.com/blustAI/node-paymcp-server-demo
