import { Request, Response } from "express";
import parser from 'ua-parser-js';
import { SpanStatusCode, trace } from "@opentelemetry/api";
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
  const tracer = trace.getTracer("voiceflow-service");
  // Start parent span for the entire chat operation

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
      targetUrl = `https://${VOICEFLOW_DOMAIN}/state/user/${userId}/interact`;
    }

    const body = {
      ...req.body,
      config: {
        excludeTypes: ['speak', 'flow', 'block'],
        tts: false,
        stripSSML: true,
        stopAll: true,
      }
    };

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Voiceflow API request failed with status ${response.status}`);
    }

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

    res.status(response.status).send(voiceflowResponse)

    // Process trace information asynchronously after response is sent
    setImmediate(() => {
      try {
        const traceInfo = extractTraceInfo(
          voiceflowResponse.trace || [],
          body,
          req.headers
        );

        // Log or process the trace info as needed
        console.log('Trace Info:', JSON.stringify(traceInfo, null, 2));
      } catch (error) {
        console.error('Error processing trace:', error);
      }
    });

    return;

    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: (error as Error).message,
      });
    }
};

function extractTraceInfo(trace: any[], requestBody: any, requestHeaders: any) {
  let hSession = requestHeaders.sessionid || null;
  let hVersion = requestHeaders.versionid || null;
  let hOrigin = requestHeaders.origin || null;
  let hReferer = requestHeaders.referer || null;
  let hIP = requestHeaders['x-forwarded-for'] || '127.0.0.1';

  const output = {
    headers: {
      os: null as string | null,
      device: null as string | null,
      browser: null as string | null,
      origin: hOrigin,
      referer: hReferer,
      ip: hIP,
      session: hSession,
      version: hVersion,
    },
    actionType: null,
    actionValue: null,
    matchedIntent: null,
    confidence: null,
    model: null,
    userQuery: null as string | null,
    aiResponse: null as string | null,
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
    tokenConsumption: {
      total: 0,
      query: 0,
      answer: 0,
    },
    apiCalls: {
      total: 0,
      successful: 0,
      failed: 0,
    },
    textResponses: [] as string[],
    endOfConvo: false,
  };

  if (MODE !== 'api') {
    const ua = parser(requestHeaders['user-agent']);

    let device = ua.getDevice();
    output.headers.device = device ? `${device.vendor} ${device.model}` : null;

    let browser = ua.getBrowser();
    output.headers.browser = browser ? `${browser.name} ${browser.version}` : null;

    let os = ua.getOS();
    output.headers.os = os && os.name ? `${os.name} ${os.version}` : null;
  }

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
