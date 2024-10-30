import express, { Router } from "express";
import { log } from "../controllers/trace.controller";

const router: Router = express.Router();

router.route("/").post(log);

export default router;
