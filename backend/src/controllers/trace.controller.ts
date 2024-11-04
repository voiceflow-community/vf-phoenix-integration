import { Request, Response } from "express";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions,
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

  // Start parent span for the entire chat operation
  tracer.startActiveSpan("chat", async (parentSpan) => {
    try {
      const { messages, metadata = {}, user = "unknown", tags = [] } = req.body;

      parentSpan.setAttributes({
        [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages }),
        [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
      });

      if (!messages || messages.length === 0) {
        return res.status(400).json({
          error: "messages are required in the request body",
        });
      }

      const userInput = messages[messages.length - 1].content;
      const spanId = parentSpan.spanContext().spanId;

      const response = await fetch(`https://${VOICEFLOW_DOMAIN}/state/user/${user}/interact`, {
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
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: `Voiceflow API request failed with status ${response.status}`,
        });
        parentSpan.end();
        throw new Error(`Voiceflow API request failed with status ${response.status}`);
      }

      const voiceflowResponse = await response.json();
     
      let debugInfo = {};
      let assistantReply = "";

      for (const trace of voiceflowResponse) {
        if (trace.type === 'debug' && trace.payload.message) {
          const message = trace.payload.message;
          const modelMatch = message.match(/Model: `(.*?)`/);

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
        } else if (trace.type === 'knowledgeBase') {
          tracer.startActiveSpan("knowledgeBaseRetrieval", async (knowledgeBaseSpan) => {
            knowledgeBaseSpan.setAttributes({
              [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.RETRIEVER,
              [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: trace.payload.query?.messages }),
              [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
              [SemanticConventions.OUTPUT_VALUE]: trace.payload.query?.output,
            });

            if (trace.payload.chunks) {
              for (let i = 0; i < trace.payload.chunks.length; i++) {
                const chunk = trace.payload.chunks[i];
                knowledgeBaseSpan.setAttributes({ 
                  [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_CONTENT}`]: chunk.documentData?.name,
                  [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_ID}`]: chunk.documentID,
                  [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_SCORE}`]: chunk.score,
                  [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_METADATA}`]: JSON.stringify(chunk.documentData),
                });
              }
            }
            
            knowledgeBaseSpan.setStatus({ code: SpanStatusCode.OK });
            knowledgeBaseSpan.end();
          });
        }
        
        else if (trace.type === 'text' && trace.payload.ai === true) {
          assistantReply = trace.payload.message;
        }
      }

      parentSpan.setAttributes({
        [SemanticConventions.LLM_MODEL_NAME]: (debugInfo as any).model,
        [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: (debugInfo as any).tokenConsumption?.query,
        [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: (debugInfo as any).tokenConsumption?.answer,
        [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: (debugInfo as any).tokenConsumption?.total,
        [SemanticConventions.OUTPUT_VALUE]: assistantReply,
      });

      tracer.startActiveSpan("llm_call", async (llmSpan) => {
        llmSpan.setAttributes({
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
          [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages }),
          [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
          [SemanticConventions.LLM_MODEL_NAME]: (debugInfo as any).model,
          [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: (debugInfo as any).tokenConsumption?.query,
          [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: (debugInfo as any).tokenConsumption?.answer,
          [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: (debugInfo as any).tokenConsumption?.total,
          [SemanticConventions.OUTPUT_VALUE]: assistantReply,
        });
        llmSpan.setStatus({ code: SpanStatusCode.OK });
        llmSpan.end();
      });

      // Set parent span attributes with final output
      const outputValue = JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: assistantReply,
          },
        ],
      });
      parentSpan.setAttributes({
        [SemanticConventions.OUTPUT_VALUE]: outputValue,
        [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.JSON,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`]: assistantReply,
        [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
        [SemanticConventions.METADATA]: JSON.stringify(metadata),
        [SemanticConventions.USER_ID]: user,
        [SemanticConventions.TAG_TAGS]: tags,
      });

      res.json({ spanId, voiceflowResponse });

      parentSpan.setStatus({ code: SpanStatusCode.OK });
      parentSpan.end();
    } catch (error) {
      console.error("Error:", error);
      parentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      parentSpan.end();
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
  });
};
