/* eslint-disable no-console */
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_PROJECT_NAME } from '@arizeai/openinference-semantic-conventions';
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

const provider = new NodeTracerProvider({
  resource: new Resource({
    ["service.name"]: "voiceflow-service",
    [SEMRESATTRS_PROJECT_NAME]: process.env.PHOENIX_PROJECT_NAME || 'Default Project'
  }),
});

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.addSpanProcessor(
  new SimpleSpanProcessor(
    new OTLPTraceExporter({
      url: process.env.COLLECTOR_ENDPOINT || "http://localhost:6006/v1/traces",
      headers: {
        Authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
      },
    }),
  ),
);

registerInstrumentations({
  instrumentations: [],
});

provider.register();

console.log("👀 OpenInference initialized");
