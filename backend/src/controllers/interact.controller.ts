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
      console.log(targetUrl);
      let headers: any = {
        ...req.headers,
        host: new URL(`https://${VOICEFLOW_DOMAIN}`).host,
        origin: undefined,
      };

      //let sessionid = req.headers.sessionid || null
      //let versionid = req.headers.versionid || 'development'

      // Remove headers that shouldn't be forwarded
      delete headers['content-length'];

      // Handle different modes (API vs Widget)
      /* if (MODE === 'api') {
        const userID = req.headers.userid || 'user';
        headers.authorization = VOICEFLOW_API_KEY;
        targetUrl = `https://${VOICEFLOW_DOMAIN}/state/user/${userID}/interact`;
      } */

      const body = {
        ...req.body,
        config: {
          ...req.body.config, // Preserve existing config
          excludeTypes: ['flow', 'block'], // Override only excludeTypes
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
      } else {
        res.status(response.status).send(voiceflowResponse)
      }

      const tracer = trace.getTracer("voiceflow-service");

      // Support both array (DM API) and object (Chat Widget public endpoint) responses
      const traces = Array.isArray(voiceflowResponse) ? voiceflowResponse : voiceflowResponse.trace || [];

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
        return
      }

      tracer.startActiveSpan("chat", async (parentSpan) => {
        try {
          parentSpan.setAttributes({
            [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
            [SemanticConventions.INPUT_VALUE]: JSON.stringify({ messages: [
              {
                "role": "user",
                "content": req.body.action.payload || ""
              }
            ]}),
            [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
          });

          function extractTextContent(trace: any[]): { messages: { role: string; content: string; }[] } {
            const textContent = trace
              .filter(t => t.type === 'text')
              .map(t => {
                if (t.type === 'text') {
                  return t.payload.message;
                }

                return t.payload.message //.replace(/<[^>]*>/g, '').replace(/\*\*/g, '');
              })
              .join('\n');

            return {
              messages: [
                {
                  role: "assistant",
                  content: textContent,
                },
              ],
            };
          }

          const assistantReply = extractTextContent(traces);

          let hSession = req.headers.sessionid || null;
          let hVersion = req.headers.versionid || null;
          let hOrigin = req.headers.origin || null;
          let hReferer = req.headers.referer || null;
          let hIP = req.headers['x-forwarded-for'] || '127.0.0.1';
          parentSpan.setAttributes({
            [SemanticConventions.LLM_MODEL_NAME]: 'Voiceflow',
            [SemanticConventions.OUTPUT_VALUE]: JSON.stringify(assistantReply),
            [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.JSON,
            [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`]: assistantReply.messages[0].content,
            [`${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`]: "assistant",
            [SemanticConventions.METADATA]: JSON.stringify({
                origin: hOrigin,
                referer: hReferer,
                ip: hIP,
                session: hSession,
                version: hVersion,
            }),
            [SemanticConventions.USER_ID]: userId,
          });

          // Filter LLM traces
          const llmTraces = traces.filter((t: any) =>
            t.type === 'debug' &&
            t.paths?.[0]?.event?.type?.startsWith('ai-') &&
            t.paths?.[0]?.event?.payload
          );

          const hasEndTrace = traces.some((t: any) => t.type === 'end');
          const tag = hasEndTrace ? ['end'] : [];

          llmTraces.forEach((t: { paths: [{ event: { payload: any, type: string } }] }) => {
            const params = t.paths[0].event.payload;

            tracer.startActiveSpan("llm_call", async (llmSpan) => {
              llmSpan.setAttributes({
                [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
                [SemanticConventions.INPUT_VALUE]: params.assistant,
                [SemanticConventions.INPUT_MIME_TYPE]: MimeType.TEXT,
                [SemanticConventions.OUTPUT_VALUE]: params.output,
                [SemanticConventions.OUTPUT_MIME_TYPE]: MimeType.TEXT,
                [SemanticConventions.LLM_MODEL_NAME]: params.model,
                [SemanticConventions.LLM_TOKEN_COUNT_PROMPT]: params.queryTokens,
                [SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]: params.answerTokens,
                [SemanticConventions.LLM_TOKEN_COUNT_TOTAL]: params.tokens,
                [SemanticConventions.TAG_TAGS]: [t.paths[0].event.type],
              });
              llmSpan.setStatus({ code: SpanStatusCode.OK });
              llmSpan.end();
            });
          });

          parentSpan.setAttributes({
            [SemanticConventions.TAG_TAGS]: tag,
          });
          parentSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
        } finally {
          parentSpan.end();
        }
      })
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
};

