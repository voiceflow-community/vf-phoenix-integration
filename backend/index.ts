/* eslint-disable no-console */
import "dotenv/config";
import express, { Express, Request, Response } from "express";
import traceRouter from "./src/routes/trace.route";
import logRouter from "./src/routes/log.route";
import feedbackRouter from "./src/routes/feedback.route";
import simpleFeedbackRouter from "./src/routes/simplefeedback.route";

const app: Express = express();
const port = parseInt(process.env.PORT || "5252");

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
