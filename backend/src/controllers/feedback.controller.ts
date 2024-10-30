import { Request, Response } from "express";

const PHOENIX_API_ENDPOINT =
  process.env.PHOENIX_API_ENDPOINT || "http://localhost:6006";

const SPAN_ANNOTATIONS_ENDPOINT = `${PHOENIX_API_ENDPOINT}/v1/span_annotations`;

export const feedback = async (req: Request, res: Response) => {
  const data = req.body;
  const authorizationHeader = req.headers['authorization'];

  const response = await fetch(SPAN_ANNOTATIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(authorizationHeader && { Authorization: authorizationHeader }),
    },
    body: JSON.stringify({
      data,
    }),
  });

  if (response.status !== 200) {
    return res.status(500).json({
      error: "Failed to send feedback",
    });
  }

  res.sendStatus(200);
};
