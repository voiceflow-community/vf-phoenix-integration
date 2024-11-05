import { Request, Response } from "express";

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';
const VOICEFLOW_VERSION_ID = process.env.VOICEFLOW_VERSION_ID || 'development';


export const interact = async (req: Request, res: Response) => {
    try {

      const response = await fetch(`https://${VOICEFLOW_DOMAIN}/state/user/demo/interact`, {
        method: 'POST',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'versionID': VOICEFLOW_VERSION_ID,
        } as HeadersInit,
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        throw new Error(`Voiceflow API request failed with status ${response.status}`);
      }

      const voiceflowResponse = await response.json();

      res.json(voiceflowResponse);

    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
};
