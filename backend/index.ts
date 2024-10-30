/* eslint-disable no-console */
import "dotenv/config";
import express, { Express, Request, Response } from "express";
import traceRouter from "./src/routes/trace.route";
import logRouter from "./src/routes/log.route";
import feedbackRouter from "./src/routes/feedback.route";
import simpleFeedbackRouter from "./src/routes/simplefeedback.route";
import cors from "cors";

const app: Express = express();
const port = parseInt(process.env.PORT || "5252");

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') // Allow multiple origins in production
    : true, // Allow all origins in development
  credentials: true, // If you need to support credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

app.use(express.json());

app.use(express.text());

app.get("/", (req: Request, res: Response) => {
  res.send("Voiceflow | Arize Phoenix Service");
});

app.use("/api/trace", traceRouter);

app.use("/api/log", logRouter);

app.use("/api/feedback", feedbackRouter);

app.use("/api/formfeedback", simpleFeedbackRouter);

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
