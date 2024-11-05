import { Request, Response } from "express";
import parser from 'ua-parser-js';

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_DOMAIN = process.env.VOICEFLOW_DOMAIN || 'general-runtime.voiceflow.com';
const VOICEFLOW_VERSION_ID = process.env.VOICEFLOW_VERSION_ID || 'development';
const MODE = process.env.MODE?.toLowerCase() || 'widget';

export const interact = async (req: Request, res: Response) => {
  try {
    let targetUrl = `https://${VOICEFLOW_DOMAIN}/state/user/demo/interact`;
    let headers: any = {
      'Content-Type': 'application/json',
      'versionID': VOICEFLOW_VERSION_ID,
    };

    // Handle different modes (API vs Widget)
    if (MODE === 'api') {
      const userID = req.headers.userid || 'user';
      headers.authorization = VOICEFLOW_API_KEY;
      targetUrl = `https://${VOICEFLOW_DOMAIN}/state/user/${userID}/interact`;
    }

    // Add configuration to exclude certain types and disable TTS
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
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Voiceflow API request failed with status ${response.status}`);
    }

    const voiceflowResponse = await response.json();

    // Extract and log trace information
    if (MODE === 'api') {
      console.log(extractTraceInfo(voiceflowResponse, body, req.headers));
      // Filter out debug items from response
      const filteredResponse = voiceflowResponse.filter((item: any) => item.type !== 'debug');
      res.json(filteredResponse);
    } else {
      console.log(extractTraceInfo(voiceflowResponse.trace, body, req.headers));
      // Filter out debug items from trace
      voiceflowResponse.trace = voiceflowResponse.trace.filter((item: any) => item.type !== 'debug');
      res.json(voiceflowResponse);
    }

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

  // Extract action information from request body
  if (requestBody?.action) {
    output.actionType = requestBody.action.type;
    output.actionValue = requestBody.action.type.startsWith('path-') &&
      requestBody.action.payload?.label ?
      requestBody.action.payload.label :
      requestBody.action.payload;
  }

  // Process trace items
  trace.forEach((item) => {
    if (item.type === 'end') {
      output.endOfConvo = true;
    }
    if (item.type === 'text' && item.payload?.message) {
      output.textResponses.push(item.payload.message);
    }
    if (item.type === 'debug') {
      processDebugItem(item, output);
    }
  });

  return output;
}

function processDebugItem(item: any, output: any) {
  if (item.payload.type === 'api') {
    output.apiCalls.total += 1;
    if (item.payload.message === 'API call successfully triggered') {
      output.apiCalls.successful += 1;
    } else {
      output.apiCalls.failed += 1;
    }
  }

  if (item.payload.type === 'intent') {
    const intentMatch = item.payload.message.match(
      /matched intent \*\*(.*?)\*\* - confidence interval _(.*?)%_/
    );
    if (intentMatch) {
      output.matchedIntent = intentMatch[1];
      output.confidence = parseFloat(intentMatch[2]);
    }
  }

  if (item.payload.message.includes('__AI Set__') ||
      item.payload.message.includes('__AI Response__')) {
    processAIMessage(item, output);
  }
}

function processAIMessage(item: any, output: any) {
  const modelMatch = item.payload.message.match(/Model: `(.*?)`/);
  const postMultiplierMatch = item.payload.message.match(
    /Post-Multiplier Token Consumption: `{(.*?)}`/
  );

  if (modelMatch) {
    output.model = modelMatch[1];
  }

  if (postMultiplierMatch) {
    try {
      const formattedString = postMultiplierMatch[1]
        .replace(/`/g, '"')
        .replace(/(\w+):/g, '"$1":');
      const consumptionJson = JSON.parse(`{${formattedString}}`);

      output.tokenConsumption.total += consumptionJson.total || 0;
      output.tokenConsumption.query += consumptionJson.query || 0;
      output.tokenConsumption.answer += consumptionJson.answer || 0;
    } catch (error) {
      console.error('Error parsing token consumption data:', error);
    }
  }
}
