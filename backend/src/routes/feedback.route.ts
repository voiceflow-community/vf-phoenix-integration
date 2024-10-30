import express, { Router } from "express";
import { feedback } from "../controllers/feedback.controller";

const router: Router = express.Router();

router.route("/").post((req, res, next) => {
  feedback(req, res).catch(next);
});

export default router;
