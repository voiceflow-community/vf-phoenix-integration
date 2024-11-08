import express, { Router } from "express";
import { getNextSpan, getAllSpans } from "../controllers/span.controller";

const router: Router = express.Router();

router.get("/next", getNextSpan);
router.get("/all", getAllSpans);

export default router;
