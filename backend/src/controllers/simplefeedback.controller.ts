import { Request, Response } from "express";

const PHOENIX_API_ENDPOINT =
  process.env.PHOENIX_API_ENDPOINT || "http://localhost:6006";

const SPAN_ANNOTATIONS_ENDPOINT = `${PHOENIX_API_ENDPOINT}/v1/span_annotations`;

export const simpleFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { score, spanId } = req.query;

    if (!spanId || !score || (score !== '1' && score !== '-1')) {
      res.status(400).json({ error: "Invalid spanId or score" });
      return;
    }

    const feedbackScore = parseInt(score as string, 10);

    const response = await fetch(SPAN_ANNOTATIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        Authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
      },
      body: JSON.stringify({
        data: [
          {
            span_id: spanId,
            annotator_kind: "HUMAN",
            name: "vote",
            result: {
              label: feedbackScore === -1 ? "👎" : "👍",
              score: feedbackScore,
              explanation:
                feedbackScore === -1
                  ? "Negative feedback from user"
                  : "Positive feedback from user",
            },
          },
        ],
      }),
    });

    if (response.status !== 200) {
      res.status(500).json({
        error: "Failed to send feedback",
      });
      return;
    }
    res.status(200).json({ message: "Feedback received" });
  } catch (error) {
    res.status(500).json({ error: "An error occurred" });
  }
};
