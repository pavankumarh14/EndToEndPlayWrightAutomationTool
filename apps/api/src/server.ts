import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { repositoryRoot } from './config.js';
import { registerRoutes } from './routes/index.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const webBuild = path.join(repositoryRoot, 'apps/web/dist');
if (existsSync(webBuild)) app.use(express.static(webBuild));

registerRoutes(app);

// In the single-container deployment the React app and API share one origin.
// Keep API routes above this fallback so client-side routes still work on refresh.
if (existsSync(webBuild)) {
  app.get('*', (_req, res) => res.sendFile(path.join(webBuild, 'index.html')));
}

app.listen(port, () => {
  console.log(`Enterprise Playwright Platform API listening on http://localhost:${port}`);
});
