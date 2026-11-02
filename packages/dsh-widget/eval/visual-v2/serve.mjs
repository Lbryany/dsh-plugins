import { createServer, build } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
if (process.argv[2] === 'build') {
  await build({ root, base: './', build: { outDir: process.argv[3], emptyOutDir: true } });
} else {
  const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); server.printUrls();
}
