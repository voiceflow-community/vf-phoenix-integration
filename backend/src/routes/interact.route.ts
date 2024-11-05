import express, { Router } from "express";
import { interact } from "../controllers/interact.controller";

const router: Router = express.Router();

router.route("/").post(interact);

export default router;
