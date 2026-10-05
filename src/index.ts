#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer, SERVER_NAME, VERSION } from "./server.js";

if (!process.env.HARDCOVER_API_KEY) {
  console.error(
    "ERROR: HARDCOVER_API_KEY environment variable is required.\n" +
      "Get your API key from your Hardcover account settings."
  );
  process.exit(1);
}

serveStdio(createServer);
console.error(`${SERVER_NAME} ${VERSION} running via stdio`);
