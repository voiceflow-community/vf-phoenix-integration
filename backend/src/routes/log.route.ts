import express, { Router } from "express";
import { logTrace } from "../controllers/log.controller";

const router: Router = express.Router();

router.route("/").post(logTrace);

export default router;
