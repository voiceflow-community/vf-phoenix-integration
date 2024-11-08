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
  try {
    const { userId } = req.params;
    const span = db.prepare('SELECT * FROM spans WHERE user_id = ? AND is_current = true').get(userId);
    return res.json(span || null);
  } catch (error: any) {
    console.error('Error getting current span:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getNextSpan = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { spanId } = req.query;

    let currentSpan: Span | undefined;

    if (spanId) {
      currentSpan = db.prepare('SELECT * FROM spans WHERE user_id = ? AND span_id = ?')
        .get(userId, spanId) as Span | undefined;
    } else {
      currentSpan = db.prepare('SELECT * FROM spans WHERE user_id = ? AND is_current = true')
        .get(userId) as Span | undefined;
    }

    const nextSpan = db.prepare('SELECT * FROM spans WHERE user_id = ? AND start_time > ? ORDER BY start_time LIMIT 1')
      .get(userId, currentSpan?.end_time || 0);

    return res.json(nextSpan || null);
  } catch (error: any) {
    console.error('Error getting next span:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAllSpans = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const spans = db.prepare('SELECT * FROM spans WHERE user_id = ? ORDER BY start_time').all(userId);
  return res.json(spans);
};
