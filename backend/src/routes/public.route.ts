import express, { Router, Request, Response } from "express";
import { interact } from "../controllers/interact.controller";

const router: Router = express.Router();

router.route("/:projectId/publishing").get((req, res) => {
  // Return publishing configuration
  res.json({
    version: process.env.VOICEFLOW_VERSION_ID || 'development',
    // Add other publishing configs as needed
  });
});

router.route("/:projectId/state/user/:userId/interact").post(
  async (req: Request, res: Response): Promise<void> => {
    await interact(req, res);
  }
);

export default router;
