import express, { Router } from "express";
import { simpleFeedback } from "../controllers/simplefeedback.controller";

const router: Router = express.Router();

router.route("/").get(simpleFeedback);

export default router;
