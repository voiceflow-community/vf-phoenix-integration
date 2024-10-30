import { Request, Response } from "express";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions,
  SEMRESATTRS_PROJECT_NAME,
} from "@arizeai/openinference-semantic-conventions";

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';
const VOICEFLOW_VERSION_ID = process.env.VOICEFLOW_VERSION_ID || 'development';
const TOKEN_CONSUMPTION_TYPE = process.env.TOKEN_CONSUMPTION_TYPE || 'inference';

type Message = {
  role: string;
  content: string;
};

export const log = async (req: Request, res: Response) => {
  const tracer = trace.getTracer("voiceflow-service");

  tracer.startActiveSpan("chat", async (span) => {
    try {
      const { messages, metadata = {}, user = "unknown", tags = [], projectName = null } = req.body;

      /* if (projectName) {
        // How to update SEMRESATTRS_PROJECT_NAME
      } */

      span.setAttributes({
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM, // AGENT, CHAIN ...
        [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages }),
        [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
      });

      if (!messages || messages.length === 0) {
        return res.status(400).json({
          error: "messages are required in the request body",
        });
      }
      /* const systemMessage = messages.find((msg: Message) => msg.role === "system");
      if (systemMessage) {
        span.setAttribute("system.message", systemMessage.content);
      } */
      const userInput = messages[messages.length - 1].content;
      const spanId = span.spanContext().spanId;

      const response = await fetch(`https://${VOICEFLOW_DOMAIN}/state/user/${req.ip}/interact`, {
        method: 'POST',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'versionID': VOICEFLOW_VERSION_ID,
        } as HeadersInit,
        body: JSON.stringify({
          action: {
            type: 'text',
            payload: userInput,
          },
          config: {
            tts: false,
            stripSSML: true,
            stopAll: true,
            excludeTypes: ['block', 'flow'],
          },
          versionID: VOICEFLOW_VERSION_ID,
        }),
      });

      if (!response.ok) {
        throw new Error(`Voiceflow API request failed with status ${response.status}`);
      }

      const voiceflowResponse = await response.json();
      let debugInfo = {};
      let assistantReply = "";

      for (const trace of voiceflowResponse) {
        if (trace.type === 'debug') {
          const message = trace.payload.message;
          const modelMatch = message.match(/Model: `(.*?)`/);

          // Choose which token consumption to parse based on the environment variable
          const tokenConsumptionRegex = TOKEN_CONSUMPTION_TYPE === 'voiceflow'
            ? /Post-Multiplier Token Consumption: `({.*?})`/
            : /Token Consumption: `({.*?})`/;

          const tokenConsumptionMatch = message.match(tokenConsumptionRegex);
          if (modelMatch) (debugInfo as any).model = modelMatch[1];
          if (tokenConsumptionMatch) {
            try {
              const tokenConsumptionStr = tokenConsumptionMatch[1]
                .replace(/(\w+):/g, '"$1":')
                .replace(/'/g, '"');
              (debugInfo as any).tokenConsumption = JSON.parse(tokenConsumptionStr);
            } catch (error) {
              console.warn("Failed to parse token consumption:", tokenConsumptionMatch[1]);
              (debugInfo as any).tokenConsumption = { error: "Failed to parse" };
            }
          }
        } else if (trace.type === 'text' && trace.payload.ai === true) {
          assistantReply = trace.payload.message;
        }
      }

      // Convert the assistant reply to a JSON object
      const outputValue = JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: assistantReply,
          },
        ],
      });

      span.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: outputValue,
        [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.JSON,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`]: assistantReply,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
        "llm.model": (debugInfo as any).model,
        "llm.token_count.prompt": (debugInfo as any).tokenConsumption?.query,
        "llm.token_count.completion": (debugInfo as any).tokenConsumption?.answer,
        "llm.token_count.total": (debugInfo as any).tokenConsumption?.total,
        //"llm.invocation_parameters": "{\"temperature\": 0.1, \"model\": \"gpt-4-turbo-preview\"}",
        "metadata": JSON.stringify(metadata),
        //"session.id": spanId,
        "user.id": user,
        "tag.tags":tags,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      res.json({ spanId, voiceflowResponse });
    } catch (error) {
      console.error("Error:", error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.end();
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
  });
};
