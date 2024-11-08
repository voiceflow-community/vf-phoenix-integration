import { Request, Response } from "express";
import db from '../config/database';

interface Span {
  start_time: number;
  end_time: number;
  is_current: boolean;
}

export const getCurrentSpan = async (req: Request, res: Response) => {
  const span = db.prepare('SELECT * FROM spans WHERE is_current = true').get();
  return res.json(span || null);
};

export const getNextSpan = async (req: Request, res: Response) => {
  const currentSpan = db.prepare('SELECT * FROM spans WHERE is_current = true').get() as Span | undefined;
  const nextSpan = db.prepare('SELECT * FROM spans WHERE start_time > ? ORDER BY start_time LIMIT 1')
    .get(currentSpan?.end_time || 0);
  return res.json(nextSpan || null);
};

export const getAllSpans = async (req: Request, res: Response) => {
  const spans = db.prepare('SELECT * FROM spans ORDER BY start_time').all();
  return res.json(spans);
};
