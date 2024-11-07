import { Request, Response } from "express";
import { Span,SpanStatusCode, trace } from "@opentelemetry/api";
import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';
const VOICEFLOW_VERSION_ID = process.env.VOICEFLOW_VERSION_ID || 'development';
const MODE = process.env.MODE?.toLowerCase() || 'widget';

export const interact = async (req: Request, res: Response) => {

    try {
      const { projectId, userId } = req.params;

      let targetUrl = `https://${VOICEFLOW_DOMAIN}${req.originalUrl}`;
      let headers: any = {
        ...req.headers,
        host: new URL(`https://${VOICEFLOW_DOMAIN}`).host,
        origin: undefined,
      };

      let sessionid = req.headers.sessionid || null
      let versionid = req.headers.versionid || 'development'

      // Remove headers that shouldn't be forwarded
      delete headers['content-length'];

      // Handle different modes (API vs Widget)
      if (MODE === 'api') {
        const userID = req.headers.userid || 'user';
        headers.authorization = VOICEFLOW_API_KEY;
        targetUrl = `https://${VOICEFLOW_DOMAIN}/state/user/${userID}/interact`;
      }

      const body = {
        ...req.body,
        config: {
          ...req.body.config, // Preserve existing config
          excludeTypes: ['speak', 'flow', 'block'], // Override only excludeTypes
        }
      };

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: JSON.stringify(body),
      });

      const voiceflowResponse = await response.json();

      // Log interaction details if needed
      console.log(JSON.stringify({
        projectId,
        userId,
        request: body,
        response: voiceflowResponse,
      }, null, 2));

      // Return response to widget
      const safeHeaders = ['content-type', 'cache-control', 'expires'];
      safeHeaders.forEach(header => {
        const value = response.headers.get(header);
        if (value) res.set(header, value);
      });

      // If the request is a launch, return the response immediately
      if (req.body?.action?.type === 'launch' || req.body?.request?.type === 'launch') {
        return res.status(response.status).send(voiceflowResponse)
      }

      const tracer = trace.getTracer("voiceflow-service");

      if (!response.ok) {
        tracer.startActiveSpan("chat", async (parentSpan) => {
          parentSpan.setAttributes({
            [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
            [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: [
              {
                "role": "user",
                "content": req.body.action.text || ""
              }
            ]}),
            [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
          });
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Voiceflow API request failed with status ${response.status}`,
          });
          parentSpan.end();
        });
        return res.status(response.status).send(voiceflowResponse)
      }

      const traceInfo = extractTraceInfo(
        tracer,
        voiceflowResponse.trace || [],
        body,
        req.headers,
        userId
      );


    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
};

function extractTraceInfo(tracer: any, trace: any[], requestBody: any, requestHeaders: any, userId: string) {
  let hSession = requestHeaders.sessionid || null;
  let hVersion = requestHeaders.versionid || null;
  let hOrigin = requestHeaders.origin || null;
  let hReferer = requestHeaders.referer || null;
  let hIP = requestHeaders['x-forwarded-for'] || '127.0.0.1';

  const output = {
    headers: {
      origin: hOrigin,
      referer: hReferer,
      ip: hIP,
      session: hSession,
      version: hVersion,
    },
    userId: null as string | null,
    userQuery: null as string | null,
    aiResponse: null as string | null,
    knowledgeBase: {
      chunks: [] as string[],
      query: null as string | null,
      system: null as string | null,
      assistant: null as string | null,
      output: null as string | null,
      model: null as string | null,
      temperature: null as number | null,
      maxTokens: null as number | null,
      queryTokens: null as number | null,
      answerTokens: null as number | null,
      tokens: null as number | null,
      multiplier: null as number | null,
    },
    aiParameters: {
      system: null as string | null,
      assistant: null as string | null,
      output: null as string | null,
      model: null as string | null,
      temperature: null as number | null,
      maxTokens: null as number | null,
      queryTokens: null as number | null,
      answerTokens: null as number | null,
      tokens: null as number | null,
      multiplier: null as number | null,
    },
    textResponses: [] as string[],
    endOfConvo: false,
  };


  // Extract user query if action type is text
  if (requestBody?.action?.type === 'text' && requestBody.action.payload) {
    output.userQuery = requestBody.action.payload;
  }

  // Process trace items
  trace.forEach((item) => {
    if (item.type === 'end') {
      output.endOfConvo = true;
    }

    if (item.type === 'text' && item.payload?.ai === true && item.payload.message) {
      output.aiResponse = item.payload.message;
    }

    if (item.type === 'debug') {
      processDebugItem(item, output);
    }
  });

  tracer.startActiveSpan("chat", async (parentSpan: Span) => {
    try {
        parentSpan.setAttributes({
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
          [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: [
            {
              "role": "system",
              "content": output.aiParameters.system || ""
            },
            {
              "role": "assistant",
              "content": output.aiParameters.assistant || ""
            },
            {
              "role": "user",
              "content": output.userQuery || ""
            }

          ]}),
          [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
        });

        const spanId = parentSpan.spanContext().spanId;

        parentSpan.setAttributes({
          [SemanticConventions.LLM_MODEL_NAME]: (output as any).aiParameters.model,
          [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: (output as any).aiParameters.queryTokens,
          [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: (output as any).aiParameters.answerTokens,
          [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: (output as any).aiParameters.tokens,
          [SemanticConventions.OUTPUT_VALUE]: (output as any).aiParameters.output,
        });

        tracer.startActiveSpan("llm_call", async (llmSpan: Span) => {
          llmSpan.setAttributes({
            [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
            [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: [
              {
                "role": "system",
                "content": output.aiParameters.system || ""
              },
              {
                "role": "assistant",
                "content": output.aiParameters.assistant || ""
              },
              {
                "role": "user",
                "content": output.userQuery || ""
              }

            ]}),
            [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
            [SemanticConventions.LLM_MODEL_NAME]: (output as any).aiParameters.model,
            [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: (output as any).aiParameters.queryTokens,
            [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: (output as any).aiParameters.answerTokens,
            [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: (output as any).aiParameters.tokens,
            [SemanticConventions.OUTPUT_VALUE]: (output as any).aiParameters.output,
          });
          llmSpan.setStatus({ code: SpanStatusCode.OK });
          llmSpan.end();
        });
        // Set parent span attributes with final output
        const outputValue = JSON.stringify({
          messages: [
            {
              role: "assistant",
              content: (output as any).aiParameters.output,
            },
          ],
        });

        parentSpan.setAttributes({
          [SemanticConventions.OUTPUT_VALUE]: outputValue,
          [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.JSON,
          [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`]: (output as any).aiParameters.output,
          [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
          // [SemanticConventions.METADATA]: JSON.stringify(metadata),
          [SemanticConventions.USER_ID]: userId,
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
    }
  })

  return output;
}

function processDebugItem(item: any, output: any) {
  if (item.payload.type === 'ai-response-parameters-model' && item.paths?.[0]?.event?.payload) {
    const params = item.paths[0].event.payload;
    output.aiParameters = {
      system: params.system || null,
      assistant: params.assistant || null,
      output: params.output || null,
      model: params.model || null,
      temperature: params.temperature || null,
      maxTokens: params.maxTokens || null,
      queryTokens: params.queryTokens || null,
      answerTokens: params.answerTokens || null,
      tokens: params.tokens || null,
      multiplier: params.multiplier || null,
    };
  }
}
