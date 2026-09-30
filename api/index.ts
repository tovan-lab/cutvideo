import express, { Request, Response } from 'express';
import { aiContentRouter } from '../server/routes/aiContentRoutes';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to normalize URL in case Vercel rewrites altered the path
app.use((req, _res, next) => {
  const matchedPath = (req.headers['x-matched-path'] as string) || (req.headers['x-invoke-path'] as string);
  if (matchedPath && (req.url === '/api' || req.url === '/api/' || req.url === '/')) {
    req.url = matchedPath;
  }
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', serverless: true, time: new Date().toISOString() });
});

// Mount aiContentRouter for both /api/ai-content and /ai-content
app.use('/api/ai-content', aiContentRouter);
app.use('/ai-content', aiContentRouter);

export default app;
