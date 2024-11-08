import express, { Router, Request, Response } from "express";
import { getNextSpan, getAllSpans, getCurrentSpan } from "../controllers/span.controller";

const router: Router = express.Router();

router.get("/current", async (req: Request, res: Response) => {
  await getCurrentSpan(req, res);
});
router.get("/next", async (req: Request, res: Response) => {
  await getNextSpan(req, res);
});
router.get("/all", async (req: Request, res: Response) => {
  await getAllSpans(req, res);
});

export default router;
