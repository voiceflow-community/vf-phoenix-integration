# Overview

This example shows how to use [@arizeai/openinference](https://github.com/Arize-ai/openinference/tree/main) to instrument a Voiceflow agent.

Our example will export spans data on [arize-phoenix](https://github.com/Arize-ai/phoenix) and you will also be able to add feedback to your spans via a Voiceflow chat widget extension.

## Getting Started With the backend local development

First, startup the backend as described in the [backend README](./backend/README.md).
Second, run the Phoenix instance

## Getting Started with Docker-Compose

Ensure that Docker is installed and running. Run the command `docker compose up` to spin up services for the backend and Phoenix. Once those services are running, open [http://localhost:6006](http://localhost:6006) to view spans and feedback in Phoenix. When you're finished, run `docker compose down` to spin down the services.

## Available API Endpoints

The service exposes the following endpoints:

### Chat Endpoints
- `POST /public/:projectId/state/user/:userId/interact` - Main endpoint for Voiceflow chat interactions
- `POST /:projectId/state/user/:userId/interact` - Alternative endpoint for Voiceflow chat interactions

### Feedback Endpoints
- `POST /api/feedback` - Submit detailed feedback for a chat interaction
- `GET /api/formfeedback` - Simple feedback submission (thumbs up/down)
  - Query Parameters:
    - `score`: Either '1' (👍) or '-1' (👎)
    - `spanId`: The ID of the span to provide feedback for

### Tracing Endpoints
- `POST /api/trace` - Log detailed trace information for chat interactions
- `POST /api/log` - Simplified logging endpoint for basic chat traces

### Health Check
- `GET /` - Basic health check endpoint that returns "Voiceflow | Arize Phoenix Service"

## Environment Variables

The service requires several environment variables to be set:

- `PORT` - Server port (default: 5252)
- `PHOENIX_API_ENDPOINT` - Phoenix API endpoint (default: http://localhost:6006)
- `VOICEFLOW_API_KEY` - Your Voiceflow API key
- `VOICEFLOW_DOMAIN` - Voiceflow domain (default: general-runtime.voiceflow.com)
- `VOICEFLOW_VERSION_ID` - Voiceflow version ID (default: development)
- `PHOENIX_API_KEY` - Your Phoenix API key
- `PHOENIX_PROJECT_NAME` - Project name for Phoenix traces

## Learn More

To learn more about Arize Phoenix, take a look at the following resources:

You can check out [the Phoenix GitHub repository](https://github.com/Arize-ai/phoenix) - your feedback and contributions are welcome!
