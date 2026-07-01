import cors from 'cors';
import express from 'express';
import { registerRoutes } from './routes/index.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

registerRoutes(app);

app.listen(port, () => {
  console.log(`Enterprise Playwright Platform API listening on http://localhost:${port}`);
});
