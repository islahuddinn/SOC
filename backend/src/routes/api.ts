import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createSupportRequest,
  getQueue,
  getSupportRequestDetail,
  getEscalationDetail,
  getPendingEscalations,
  getRefunds,
  getDashboardStats,
  getOrders,
} from '../services/supportService';
import { executeApprovedEscalation, rejectEscalation } from '../services/actionExecutor';
import { getAvailableProviders, getLlmConfig } from '../llm/provider';

const createRequestSchema = z.object({
  customer_email: z.string().email(),
  message: z.string().min(1).max(5000),
});

const approveSchema = z.object({
  reviewer: z.string().min(1).max(255),
});

const rejectSchema = z.object({
  reviewer: z.string().min(1).max(255),
  reason: z.string().min(1).max(2000),
});

export const apiRouter = Router();

apiRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    await poolHealthCheck();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', timestamp: new Date().toISOString() });
  }
});

async function poolHealthCheck(): Promise<void> {
  const { pool } = await import('../db/pool');
  await pool.query('SELECT 1');
}

apiRouter.get('/config', (_req: Request, res: Response) => {
  const llm = getLlmConfig();
  res.json({
    llm,
    providers: getAvailableProviders(),
  });
});

apiRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/orders', async (_req: Request, res: Response) => {
  try {
    const orders = await getOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.post('/support-requests', async (req: Request, res: Response) => {
  try {
    const parsed = createRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { customer_email, message } = parsed.data;
    const result = await createSupportRequest(customer_email, message);
    res.status(202).json(result);
  } catch (err) {
    console.error('Create support request error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/queue', async (_req: Request, res: Response) => {
  try {
    const queue = await getQueue();
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/support-requests/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const detail = await getSupportRequestDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/escalations/pending', async (_req: Request, res: Response) => {
  try {
    const escalations = await getPendingEscalations();
    res.json(escalations);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/escalations/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const detail = await getEscalationDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.post('/escalations/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await executeApprovedEscalation(id, parsed.data.reviewer);
    const detail = await getEscalationDetail(id);

    if (!result.success) {
      res.status(409).json({ ...result, escalation: detail?.escalation });
      return;
    }

    res.json({ ...result, escalation: detail?.escalation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.post('/escalations/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await rejectEscalation(id, parsed.data.reviewer, parsed.data.reason);
    const detail = await getEscalationDetail(id);

    if (!result.success) {
      res.status(409).json({ ...result, escalation: detail?.escalation });
      return;
    }

    res.json({ ...result, escalation: detail?.escalation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

apiRouter.get('/refunds', async (_req: Request, res: Response) => {
  try {
    const refunds = await getRefunds();
    res.json(refunds);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});
