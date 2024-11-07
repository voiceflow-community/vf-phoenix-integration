/* eslint-disable no-console */
import "dotenv/config";
import express, { Express, Response } from "express";
import traceRouter from "./src/routes/trace.route";
import logRouter from "./src/routes/log.route";
import feedbackRouter from "./src/routes/feedback.route";
import simpleFeedbackRouter from "./src/routes/simplefeedback.route";
import publicRouter from "./src/routes/public.route";
import cors from "cors";

const app: Express = express();
const port = parseInt(process.env.PORT || "5252");

const NODE_ENV = process.env.NODE_ENV || 'development';

// Set up cors
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') // Allow multiple origins in production
    : '*', // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'versionid',
    'userid',
    'sessionid',
    'x-forwarded-for',
    'origin',
    'referer'
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());
app.use(express.text());

app.get("/", (res: Response) => {
  res.send("Voiceflow | Arize Phoenix Service");
});

app.get("/health", (res: Response) => {
  res.send({ status: "OK" });
});

app.use("/", publicRouter);

app.use("/api/log", logRouter);

app.use("/api/feedback", feedbackRouter);

app.use("/api/formfeedback", simpleFeedbackRouter);

// DEPRECATED ROUTES
app.use("/api/trace", traceRouter);


app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
