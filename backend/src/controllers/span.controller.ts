import { Request, Response } from "express";
import { spanService } from "../services/span.service";

export const getNextSpan = async (req: Request, res: Response) => {
  const { currentSpanId } = req.query;

  if (!currentSpanId || typeof currentSpanId !== 'string') {
    return res.status(400).json({
      error: "currentSpanId query parameter is required"
    });
  }

  const nextSpanId = spanService.getNextSpanId(currentSpanId);

  if (!nextSpanId) {
    return res.status(404).json({
      error: "No next span ID found"
    });
  }

  res.json({ nextSpanId });
};

export const getAllSpans = async (req: Request, res: Response) => {
  const spans = spanService.getAllSpanIds();
  res.json({ spans });
};
