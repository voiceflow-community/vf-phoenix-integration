import express, { Router, Request, Response } from "express";
import { interact } from "../controllers/interact.controller";

const router: Router = express.Router();

// Simple proxy for non-interact endpoints
const simpleProxy = async (req: Request, res: Response) => {
  try {
    const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';
    const targetUrl = `https://${VOICEFLOW_DOMAIN}${req.originalUrl}`;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: new Headers({
        ...Object.fromEntries(Object.entries(req.headers)),
        'host': new URL(`https://${VOICEFLOW_DOMAIN}`).host,
      }),
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy error' });
  }
};

router.route("/:projectId/publishing").get(simpleProxy);

router.route("/:projectId/state/user/:userId/interact").post(
  async (req: Request, res: Response): Promise<void> => {
    await interact(req, res);
  }
);

router.route("/public/:projectId/state/user/:userId/interact").post(
  async (req: Request, res: Response): Promise<void> => {
    await interact(req, res);
  }
);

export default router;
