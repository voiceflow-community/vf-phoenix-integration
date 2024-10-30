import { Request, Response } from "express";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions,
  SEMRESATTRS_PROJECT_NAME,
} from "@arizeai/openinference-semantic-conventions";

type Message = {
  role: string;
  content: string;
};

export const logTrace = async (req: Request, res: Response) => {
  const tracer = trace.getTracer("voiceflow-service");
  tracer.startActiveSpan("chat", async (span) => {
    try {
      const { messages, metadata = {}, user = "unknown", tags = [], modelName = "Voiceflow", projectName = null } = req.body;

      /* if (projectName) {
        // How to update SEMRESATTRS_PROJECT_NAME
      } */

      if (!messages || messages.length === 0) {
        return res.status(400).json({
          error: "messages are required in the request body",
        });
      }

      const inputMessages = messages.filter((msg: Message) => msg.role !== "assistant");

      span.setAttributes({
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM, // AGENT, CHAIN ...
        [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: inputMessages }),
        [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
      });

      const spanId = span.spanContext().spanId;
      const assistantMessage = messages.find((msg: Message) => msg.role === "assistant");

      // Convert the assistant reply to a JSON object
      const outputValue = JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: assistantMessage.content,
          },
        ],
      });

      span.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: outputValue,
        [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.JSON,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`]: assistantMessage.content,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
        "llm.model": (modelName as any).model,
        "metadata": JSON.stringify(metadata),
        "user.id": user,
        "tag.tags":tags,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      res.json({ spanId });
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
