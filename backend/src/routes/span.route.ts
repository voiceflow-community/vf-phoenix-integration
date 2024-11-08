import express, { Router, Request, Response } from "express";
import { getNextSpan, getAllSpans, getCurrentSpan } from "../controllers/span.controller";

const router: Router = express.Router();

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
