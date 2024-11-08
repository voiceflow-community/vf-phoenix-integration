import { Request, Response } from "express";
import db from '../config/database';

interface Span {
  span_id: string;
  user_id: string;
  start_time: number;
  end_time: number;
  is_current: boolean;
}

export const getCurrentSpan = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const span = db.prepare('SELECT * FROM spans WHERE user_id = ? AND is_current = true').get(userId);
  return res.json(span || null);
};

export const getNextSpan = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const currentSpan = db.prepare('SELECT * FROM spans WHERE user_id = ? AND is_current = true').get(userId) as Span | undefined;
  const nextSpan = db.prepare('SELECT * FROM spans WHERE user_id = ? AND start_time > ? ORDER BY start_time LIMIT 1')
    .get(userId, currentSpan?.end_time || 0);
  return res.json(nextSpan || null);
};

export const getAllSpans = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const spans = db.prepare('SELECT * FROM spans WHERE user_id = ? ORDER BY start_time').all(userId);
  return res.json(spans);
};
