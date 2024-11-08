# Overview

This example shows how to use [@arizeai/openinference](https://github.com/Arize-ai/openinference/tree/main) to instrument a [Voiceflow](https://voiceflow.com/) agent and save the logs to [Arize Phoenix](https://github.com/Arize-ai/phoenix) by providing a backend/proxy service.

# Getting Started with Docker-Compose

## Environment Variables

The service requires several environment variables to be set in the .env file,
you can use the .env.template file as a template.

- `PHOENIX_API_ENDPOINT` - Phoenix API endpoint (default: http://localhost:6006)
- `PHOENIX_PORT` - Phoenix port (default: 6006)
- `PHOENIX_PROJECT_NAME` - The Phoenix project name to store traces
- `PHOENIX_API_KEY` - Your Phoenix API key
- `PHOENIX_ENABLE_AUTH` - Whether to enable authentication for Phoenix (default: True)
- `PHOENIX_SECRET` - Phoenix secret (change this to a random string)
- `PHOENIX_CSRF_TRUSTED_ORIGINS` - Allowed origins for Phoenix traces (default: http://localhost:5252)
- `COLLECTOR_ENDPOINT` - http://phoenix:6006/v1/traces
- `VOICEFLOW_DOMAIN` - Voiceflow domain (default: general-runtime.voiceflow.com)
- `ALLOWED_ORIGINS` - Allowed origins for Phoenix traces (default: http://localhost:5252)
- `PORT` - Backend server port (default: 5252)
- `NODE_ENV` - Node environment (default: development - allows all origins)

Ensure that Docker is installed and running. Run the command `docker compose up` to spin up the backend service and the Phoenix instance. Once those services are running, open [http://localhost:6006](http://localhost:6006) to view spans and feedback in Phoenix and use [http://localhost:5252](http://localhost:5252) endpoints to send traces to Phoenix. When you're finished, run `docker compose down` to spin down the services.

### Proxy Endpoints

Replace `https://general-runtime.voiceflow.com` with your backend URL to auto log all Voiceflow LLM interactions to Phoenix.

For example, in the following Chat Widget snippet code example, replace `[YOUR_BACKEND_URL]` with your backend URL.

```javascript
(function(d, t) {
      var v = d.createElement(t), s = d.getElementsByTagName(t)[0];
      v.onload = function() {
        window.voiceflow.chat.load({
          verify: { projectID: '[YOUR_PROJECT_ID]' },
          url: '[YOUR_BACKEND_URL]',
          versionID: 'production'
        });
      }
      v.src = "https://cdn.voiceflow.com/widget/bundle.mjs"; v.type = "text/javascript"; s.parentNode.insertBefore(v, s);
  })(document, 'script');
```

For Voiceflow, replace `[YOUR_BACKEND_URL]` with your backend URL in your requests to the Dialog Management API.

```bash
curl --request POST \
  --url [YOUR_BACKEND_URL]/state/user/demo/interact \
  --header 'Authorization: [YOUR_VOICEFLOW_API_KEY]' \
  --header 'content-type: application/json' \
  --header 'versionID: production' \
  --data '{
          "action": {
            "type": "text",
            "payload": "What is Voiceflow?"
          },
          "config": {
            "excludeTypes": ["flow", "block"]
          }
 }'
```

## Available API Endpoints

The service also exposes the following endpoints:

### Tracing Endpoints
- `POST /api/trace` - Log detailed trace information for chat interactions
- `POST /api/log` - Simplified logging endpoint for basic chat traces

### Feedback Endpoints
- `POST /api/feedback` - Submit detailed feedback for a chat interaction
- `GET /api/formfeedback` - Simple feedback submission (thumbs up/down)
  - Query Parameters:
    - `score`: Either '1' (👍) or '-1' (👎)
    - `spanId`: The ID of the span to provide feedback for

### Span Management Endpoints
- `GET /api/span/user/:userId/current` - Get the current active span for a user
- `GET /api/span/user/:userId/next` - Get the next span after the current one
  - Query Parameters:
    - `spanId` (optional): Get the next span after a specific span ID
- `GET /api/span/user/:userId/all` - Get all spans for a user

Example usage:
```bash
# Get current span
curl http://localhost:5252/api/span/user/123/current

# Get next span after current
curl http://localhost:5252/api/span/user/123/next

# Get next span after specific span (useful for the chat widget extension and rating from a previous turn)
curl http://localhost:5252/api/span/user/123/next?spanId=span_abc123

# Get all spans
curl http://localhost:5252/api/span/user/123/all
```

### Health Check
- `GET /health` - Basic health check endpoint that returns `{ "status": "OK"}` if the service is running


## Learn More

To learn more about Arize Phoenix, take a look at the following resources:

You can check out [the Phoenix GitHub repository](https://github.com/Arize-ai/phoenix)
as well as some [additional documentation](https://docs.arize.com/phoenix/evaluation/evals) on how to run evals.
