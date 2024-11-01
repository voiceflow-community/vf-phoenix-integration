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

      const userMessage = messages.find((msg: Message) => msg.role === 'user');
      const systemMessage = messages.find((msg: Message) => msg.role === 'system');
      const retrievedDocuments = systemMessage?.content?.split('Provided details: ')[1] || '';
      const conversationHistoryIndex = retrievedDocuments.indexOf('3. Conversation history:');
      const truncatedDocuments = conversationHistoryIndex !== -1
        ? retrievedDocuments.substring(0, conversationHistoryIndex)
        : retrievedDocuments;

      let documents;
      try {
        documents = JSON.parse(truncatedDocuments.slice(1, -1));
        console.log(documents);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
        documents = [];
      }

      // Start document retrieval span
      await tracer.startActiveSpan("retrieve_documents", async (retrievalSpan) => {
        retrievalSpan.setAttributes({
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.RETRIEVER,
          [SemanticConventions.INPUT_VALUE]: userMessage?.content,
          [SemanticConventions.RETRIEVAL_DOCUMENTS]: documents,
        });
        retrievalSpan.setStatus({ code: SpanStatusCode.OK });
        retrievalSpan.end();
      });

      const userInput = messages[messages.length - 1].content;
      const spanId = parentSpan.spanContext().spanId;

      await tracer.startActiveSpan("voiceflow_llm_call", async (llmSpan) => {
        llmSpan.setAttributes({
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
          [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages }),
          [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
        });
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
          llmSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Voiceflow API request failed with status ${response.status}`,
          });
          llmSpan.end();
          throw new Error(`Voiceflow API request failed with status ${response.status}`);
        }

        const voiceflowResponse = await response.json();
        let debugInfo = {};
        let assistantReply = "";

        for (const trace of voiceflowResponse) {
          if (trace.type === 'debug') {
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
          } else if (trace.type === 'text' && trace.payload.ai === true) {
            assistantReply = trace.payload.message;
          }
        }

        llmSpan.setAttributes({
          "llm.model": (debugInfo as any).model,
          "llm.token_count.prompt": (debugInfo as any).tokenConsumption?.query,
          "llm.token_count.completion": (debugInfo as any).tokenConsumption?.answer,
          "llm.token_count.total": (debugInfo as any).tokenConsumption?.total,
          "llm.response": assistantReply,
        });
        llmSpan.setStatus({ code: SpanStatusCode.OK });
        llmSpan.end();

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
          "metadata": JSON.stringify(metadata),
          "user.id": user,
          "tag.tags": tags,
        });

        res.json({ spanId, voiceflowResponse });
      });

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
