import { Request, response, Response } from "express";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";

const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';

export const interact = async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { projectId, userId } = req.params;

      let targetUrl = `https://${VOICEFLOW_DOMAIN}${req.originalUrl}`;
      console.log(targetUrl);
      let headers: any = {
        ...req.headers,
        host: new URL(`https://${VOICEFLOW_DOMAIN}`).host,
        origin: undefined,
      };

      // Remove headers that shouldn't be forwarded
      delete headers['content-length'];

      // If the request is a launch, return the response immediately and don't trace
      if (req.body?.action?.type === 'launch' || req.body?.request?.type === 'launch') {
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

        let voiceflowResponse = await response.json();

        // Return response to widget
        const safeHeaders = ['content-type', 'cache-control', 'expires'];
        safeHeaders.forEach(header => {
          const value = response.headers.get(header);
          if (value) res.set(header, value);
        });

        return res.status(response.status).send(voiceflowResponse)
      } else {
        const tracer = trace.getTracer("voiceflow-service");
        tracer.startActiveSpan("chat", { startTime: startTime }, async (parentSpan) => {
        const spanId = parentSpan.spanContext().spanId;

        const body = {
          ...req.body,
          config: {
            ...req.body.config, // Preserve existing config
            excludeTypes: ['flow', 'block'], // Override only excludeTypes
          },
          event: {
            type: "launch",
            payload: {
              phoenixSpanID: spanId
            }
          }
        };

        const response = await fetch(targetUrl, {
          method: req.method,
          headers: headers,
          body: JSON.stringify(body),
        });
        // Get response from Voiceflow
        let voiceflowResponse = await response.json();

        // Return response to widget
        const safeHeaders = ['content-type', 'cache-control', 'expires'];
        safeHeaders.forEach(header => {
          const value = response.headers.get(header);
          if (value) res.set(header, value);
        });

        res.status(response.status).send(voiceflowResponse)

        let traces = [];

        // Log interaction details if needed
        console.log(JSON.stringify({
          projectId,
          userId,
          request: body,
          response: voiceflowResponse,
        }, null, 2));

        // Filter out debug traces before sending response
        // Support both array (DM API) and object (Chat Widget public endpoint) responses
        if (Array.isArray(voiceflowResponse)) {
          traces = voiceflowResponse;
          voiceflowResponse = voiceflowResponse.filter(trace => trace.type !== 'debug');
        } else if (voiceflowResponse.trace) {
          traces = voiceflowResponse.trace;
          voiceflowResponse.trace = voiceflowResponse.trace.filter((trace: any) => trace.type !== 'debug');
        }

        if (!response.ok) {
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
          return
        }

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
            let hVersion = req.headers.versionid || 'development';
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
              ((t.paths?.[0]?.event?.type?.startsWith('ai-') && t.paths?.[0]?.event?.payload) || t.type === 'knowledgeBase')
            );

            const hasEndTrace = traces.some((t: any) => t.type === 'end');
            const tag = hasEndTrace ? ['end'] : [];

            llmTraces.forEach((llmTrace: { type: string, time: number, payload: any, paths: [{ event: { payload: any, type: string } }] }) => {
              const fullTraceIndex = traces.findIndex((t: any) => t === llmTrace);
              const currentTraceTime = llmTrace.time;
              // Get previous trace time from full traces array
              const previousTraceTime = fullTraceIndex > 0 ? traces[fullTraceIndex - 1].time : startTime;
              if (llmTrace.type === 'knowledgeBase') {
                tracer.startActiveSpan("knowledgeBaseRetrieval", { startTime: previousTraceTime }, async (knowledgeBaseSpan) => {
                  knowledgeBaseSpan.setAttributes({
                    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.RETRIEVER,
                    [SemanticConventions.INPUT_VALUE]: traces[fullTraceIndex - 1]?.payload?.message?.replace('Query received: ','') || '',
                    [SemanticConventions.INPUT_MIME_TYPE]: MimeType.TEXT,
                    [SemanticConventions.OUTPUT_VALUE]: llmTrace.payload.query?.output,
                  });

                  if (llmTrace.payload.chunks) {
                    for (let i = 0; i < llmTrace.payload.chunks.length; i++) {
                      const chunk = llmTrace.payload.chunks[i];
                      knowledgeBaseSpan.setAttributes({
                        [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_CONTENT}`]: chunk.documentData?.name,
                        [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_ID}`]: chunk.documentID,
                        [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_SCORE}`]: chunk.score,
                        [`${SemanticConventions.RETRIEVAL_DOCUMENTS}.${i}.${SemanticConventions.DOCUMENT_METADATA}`]: JSON.stringify(chunk.documentData),
                      });
                    }
                  }
                  knowledgeBaseSpan.setStatus({ code: SpanStatusCode.OK });
                  knowledgeBaseSpan.end(currentTraceTime);
                });
              } else {
                let params = llmTrace.paths[0].event.payload;
                tracer.startActiveSpan("llm_call", { startTime: previousTraceTime },async (llmSpan) => {
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
                    [SemanticConventions.LLM_INVOCATION_PARAMETERS]: JSON.stringify({ 'model_name': params.model, 'temperature': params.temperature, 'max_tokens': params.maxTokens, 'multiplier': params.multiplier }),
                    [SemanticConventions.TAG_TAGS]: [llmTrace.paths[0].event.type],
                  });
                  llmSpan.setStatus({ code: SpanStatusCode.OK });
                  llmSpan.end(currentTraceTime);
                });
              }

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
      }
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
};

