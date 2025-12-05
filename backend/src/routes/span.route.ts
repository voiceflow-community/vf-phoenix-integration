import express, { Router, Request, Response } from "express";
import { getNextSpan, getAllSpans, getCurrentSpan } from "../controllers/span.controller";
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

const router: Router = express.Router();

// Apply rate limiting to all routes on this router
router.use(limiter);

// Apply rate limiting to all routes on this router
router.use(limiter);

router.get("/user/:userId/current", async (req: Request, res: Response) => {
  await getCurrentSpan(req, res);
});
router.get("/user/:userId/next", async (req: Request, res: Response) => {
  await getNextSpan(req, res);
});
router.get("/user/:userId/all", async (req: Request, res: Response) => {
  await getAllSpans(req, res);
});

export default router;
