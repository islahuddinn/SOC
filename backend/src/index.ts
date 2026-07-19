import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { apiRouter } from './routes/api';
import { closePool, pool } from './db/pool';
import { clearLlmClients } from './llm/provider';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', apiRouter);

const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

let server: ReturnType<typeof app.listen> | null = null;

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received — shutting down gracefully...`);
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  clearLlmClients();
  await closePool();
  process.exit(0);
}

async function start(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log('Database connected.');
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
