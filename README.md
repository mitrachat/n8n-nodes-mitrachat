# MitraChat n8n Community Nodes

n8n community nodes for integrating with MitraChat AI platform. Connect Telegram, WhatsApp, and WebChat providers to n8n workflows with AI agent capabilities.

## Features

- **MitraChatProviderTrigger** — Webhook trigger for incoming messages from Telegram/WhatsApp/WebChat
- **MitraChatAgent** — Generate AI responses using MitraChat agents with credit-based billing
- **MitraChatSendMessage** — Send messages back to users via their original provider

## Prerequisites

- n8n instance (local or cloud)
- MitraChat account with API access
- API key generated from MitraChat Settings → Integrations

## Installation

### Method 1: Install from npm (Recommended)

```bash
# In your n8n installation directory
npm install n8n-nodes-mitrachat
```

Then restart n8n. The nodes will appear in the node panel under "MitraChat".

### Method 2: Local Development (Testing)

1. Clone or navigate to this package:

```bash
cd packages/n8n-nodes-mitrachat
```

2. Install dependencies:

```bash
npm install
```

3. Build the package:

```bash
npm run build
```

4. Link to your local n8n installation:

```bash
# Option A: Using npm link
npm link

# Then in your n8n directory
cd /path/to/n8n
npm link n8n-nodes-mitrachat

# Option B: Copy built files
cp -r dist /path/to/n8n/node_modules/n8n-nodes-mitrachat/
```

5. Restart n8n to load the nodes

### Method 3: Docker (Local Testing)

```bash
# Build the package
cd packages/n8n-nodes-mitrachat
npm install
npm run build

# Start n8n with the nodes mounted
docker run -it --rm \
  -p 5678:5678 \
  -v $(pwd)/dist:/home/node/.n8n/custom/n8n-nodes-mitrachat \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n:latest
```

## Configuration

### 1. Create API Key in MitraChat

1. Log in to your MitraChat dashboard
2. Go to **Settings** → **Integrations** tab
3. Click **"Create API Key"**
4. Enter a name (e.g., "n8n Production")
5. Copy the API key immediately (shown only once)

### 2. Create Credential in n8n

1. In n8n, go to **Settings** → **Credentials**
2. Click **"Add Credential"**
3. Search for **"MitraChat API"**
4. Enter:
   - **API Key**: Your copied key (`mc_live_...`)
   - **Base URL**: Your MitraChat instance (e.g., `https://api.mitrachat.id`)
5. Click **"Test"** to verify connectivity

## Nodes Usage

### MitraChatProviderTrigger

Triggers a workflow when a message arrives from any connected provider.

**Output Fields:**

- `providerId` — Provider that received the message
- `providerType` — telegram | whatsapp | webchat
- `chatId` — Conversation identifier
- `message` — Text content
- `userId` — User identifier (if available)
- `username` — Username (Telegram only)
- `timestamp` — ISO timestamp

**Example Workflow:**

```
[MitraChatProviderTrigger] → [MitraChatAgent] → [MitraChatSendMessage]
```

### MitraChatAgent

Generates AI response using a MitraChat agent. Credits are deducted automatically based on model consumption rate.

**Parameters:**

- **Agent** — Select from your MitraChat agents
- **Message** — Input message (use `{{ $json.message }}` from trigger)
- **Thread ID** — Conversation thread for memory (use `{{ $json.chatId }}`)
- **Provider ID** — Optional, for logging context
- **Chat ID** — Optional, for logging context

**Output Fields:**

- `response` — AI-generated text
- `model` — Model used for generation
- `creditsDeducted` — Credits consumed

**Note:** Insufficient credits will return an error. Monitor your credit balance in MitraChat dashboard.

### MitraChatSendMessage

Sends a message back to the user via their original provider.

**Parameters:**

- **Provider** — Select from your enabled providers
- **Chat ID** — Conversation ID (use `{{ $json.chatId }}`)
- **Message** — Text to send (use `{{ $json.response }}` from agent)

## Testing Locally

### Quick Test Setup

1. **Start MitraChat locally:**

```bash
# In mitrachat-ai-app root
bun run dev
```

2. **Get local API credentials:**

- Create an organization in MitraChat
- Go to Settings → Integrations → Create API Key
- Note the API key and your local URL (e.g., `http://localhost:3000`)

3. **Configure n8n credential:**

- API Key: `mc_live_...`
- Base URL: `http://host.docker.internal:3000` (if n8n in Docker) or `http://localhost:3000`

4. **Enable n8n on a provider:**

- In MitraChat, go to Providers → Edit a Telegram provider
- Enable "n8n Integration" toggle
- Add webhook URL from your n8n trigger node

### Test Workflow

1. Create new workflow in n8n
2. Add **MitraChatProviderTrigger**
3. Select your provider and copy the webhook URL
4. Paste webhook URL in MitraChat provider settings
5. Add **MitraChatAgent** node
6. Add **MitraChatSendMessage** node
7. Connect nodes: Trigger → Agent → SendMessage
8. Activate workflow
9. Send message to your Telegram bot
10. Watch execution in n8n

## Publishing to npm

### Preparation

1. **Update version** in `package.json`:

```json
{
  "version": "0.1.0"
}
```

2. **Ensure build passes:**

```bash
npm run build
npm run lint
```

3. **Create npm account** (if needed):
   https://www.npmjs.com/signup

### Publishing Steps

```bash
# Login to npm (first time only)
npm login

# Build the package
npm run build

# Publish (dry run first)
npm publish --dry-run

# If everything looks good, publish
npm publish --access public
```

### Version Updates

Follow semantic versioning:

- `npm version patch` — Bug fixes (0.1.0 → 0.1.1)
- `npm version minor` — New features (0.1.0 → 0.2.0)
- `npm version major` — Breaking changes (0.1.0 → 1.0.0)

Then: `npm publish`

### Automated Publishing (CI/CD)

Add to `.github/workflows/publish.yml`:

```yaml
name: Publish to npm
on:
  push:
    tags:
      - "v*"
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
          registry-url: "https://registry.npmjs.org"
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Create `NPM_TOKEN` secret in GitHub repository settings.

## API Endpoints

The nodes communicate with these MitraChat REST endpoints:

| Endpoint                       | Method | Description                         |
| ------------------------------ | ------ | ----------------------------------- |
| `/api/n8n/health`              | GET    | Health check for credential testing |
| `/api/n8n/agents`              | GET    | List available agents               |
| `/api/n8n/agents/:id/generate` | POST   | Generate AI response                |
| `/api/n8n/providers`           | GET    | List providers for trigger setup    |
| `/api/n8n/providers/:id/send`  | POST   | Send message via provider           |

All endpoints require `X-API-Key` header.

## Troubleshooting

### "Cannot find module 'n8n-workflow'"

Install peer dependencies: `npm install n8n-workflow`

### "401 Unauthorized"

- Verify API key is correct and not expired
- Check that organization has active subscription

### "Insufficient credits"

- Add credits in MitraChat billing settings
- Or switch to an agent with lower consumption rate

### Webhook not triggering

- Verify n8n webhook URL is correct in provider settings
- Check that provider has "n8n enabled" toggle on
- Look at webhook logs in MitraChat for delivery attempts

## Local Development & Testing

This section covers how to run n8n locally and test your MitraChat nodes during development.

### Prerequisites

- Docker installed (recommended) OR n8n CLI installed
- MitraChat backend running locally (`bun run dev`)
- Built n8n nodes package (`npm run build` in this directory)

### Step 1: Build the Nodes Package

```bash
cd /Users/izzadev/projects/mitrachat/mitrachat-ai-app/packages/n8n-nodes-mitrachat
npm install
npm run build
```

### Step 2: Start n8n with Custom Nodes

#### Option A: Docker (Recommended)

```bash
# Start n8n with your custom nodes mounted
docker run -it --rm \
  -p 5678:5678 \
  -v $(pwd)/dist:/home/node/.n8n/custom/n8n-nodes-mitrachat \
  -v n8n_data:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=admin \
  n8nio/n8n:latest
```

Access n8n at: http://localhost:5678 (login: admin / admin)

#### Option B: n8n CLI

```bash
# Install n8n globally if you haven't
npm install -g n8n

# Create custom nodes directory and copy your build
mkdir -p ~/.n8n/custom
cp -r dist/* ~/.n8n/custom/n8n-nodes-mitrachat/

# Start n8n
n8n start
```

#### Option C: Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    volumes:
      - ./dist:/home/node/.n8n/custom/n8n-nodes-mitrachat
      - n8n_data:/home/node/.n8n
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=admin
    extra_hosts:
      - "host.docker.internal:host-gateway"
volumes:
  n8n_data:
```

Run: `docker-compose up`

### Step 3: Configure MitraChat

1. **Start MitraChat backend:**

   ```bash
   cd /Users/izzadev/projects/mitrachat/mitrachat-ai-app
   bun run dev
   ```

   - Frontend: http://localhost:5173
   - API: http://localhost:3000

2. **Create API Key:**
   - Open http://localhost:5173
   - Go to **Settings** → **Integrations**
   - Click **"Create API Key"**
   - Name: "n8n Local Test"
   - Copy the key (starts with `mc_live_...`)

3. **Create a Provider with n8n:**
   - Go to **Providers** → **Create Provider**
   - Select **"Web Chat"** (or Telegram)
   - Enable **"n8n Integration"** toggle
   - Leave webhook URL empty (we'll get it from n8n)

### Step 4: Configure n8n Credentials

1. In n8n, go to **Settings** → **Credentials**
2. Click **"Add Credential"**
3. Search for **"MitraChat API"**
4. Fill in:
   - **API Key**: `mc_live_...` (from Step 3)
   - **Base URL**:
     - Docker: `http://host.docker.internal:3000`
     - Local n8n: `http://localhost:3000`
5. Click **"Test"** — should show green checkmark

### Step 5: Create Test Workflow

**Node 1: MitraChatProviderTrigger**

- Add the trigger node
- Select your provider from dropdown
- Copy the **Webhook URL** (e.g., `http://localhost:5678/webhook-test/...`)
- **Important:** Use the "Test URL" during development

**Node 2: MitraChatAgent**

- Connect to Trigger
- Select an agent from dropdown
- Message: `{{ $json.message }}`
- Thread ID: `{{ $json.chatId }}`
- Provider ID: `{{ $json.providerId }}`
- Chat ID: `{{ $json.chatId }}`

**Node 3: MitraChatSendMessage**

- Connect to Agent
- Provider: Select same provider
- Chat ID: `{{ $json.chatId }}`
- Message: `{{ $json.response }}`

Save and **Activate** the workflow.

### Step 6: Connect Webhook

1. Copy the webhook URL from your trigger node
2. Go to MitraChat → Providers → Edit your provider
3. Paste webhook URL into **"n8n Webhook URL"** field
4. Save

### Step 7: Test End-to-End

**Option A: Web Chat Test**

1. Go to your MitraChat web chat widget
2. Send a message
3. Check n8n Executions tab for the triggered workflow

**Option B: Direct Webhook Test**

```bash
curl -X POST http://localhost:5678/webhook-test/YOUR_WEBHOOK_PATH \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello from test",
    "chatId": "test-123",
    "providerId": "your-provider-id",
    "providerType": "webchat"
  }'
```

### Quick Verification Checklist

| Component            | Check           | Command/URL                            |
| -------------------- | --------------- | -------------------------------------- |
| MitraChat backend    | Running         | `http://localhost:3000/api/n8n/health` |
| API Key valid        | Test passes     | Credential test in n8n                 |
| Provider n8n enabled | Toggle on       | MitraChat dashboard                    |
| Nodes loaded         | See "MitraChat" | n8n node panel                         |
| Webhook reachable    | Green status    | n8n trigger node                       |
| Workflow active      | Toggle on       | n8n workflow editor                    |

### Hot Reload for Development

When you make changes to the nodes:

```bash
# 1. Rebuild the package
cd packages/n8n-nodes-mitrachat
npm run build

# 2. Restart n8n (Docker)
docker restart CONTAINER_ID

# 3. Or if using volume mount, just refresh n8n page
```

### Debugging

**Check if nodes are loaded:**

```bash
# In n8n container
docker exec CONTAINER_ID ls -la /home/node/.n8n/custom/
```

**Test API directly:**

```bash
# Test MitraChat API
curl http://localhost:3000/api/n8n/agents \
  -H "X-API-Key: mc_live_YOUR_KEY"

# Test webhook manually
curl http://localhost:5678/webhook-test/YOUR_PATH \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**View logs:**

```bash
# Docker logs
docker logs -f CONTAINER_ID

# n8n CLI with debug
n8n start --log-level=debug
```

**Check webhook delivery in MitraChat:**
Query the database:

```sql
SELECT * FROM n8n_webhook_logs
ORDER BY created_at DESC
LIMIT 10;
```

### Common Issues

| Issue                  | Cause          | Fix                             |
| ---------------------- | -------------- | ------------------------------- |
| "Cannot find module"   | Build missing  | Run `npm run build`             |
| Nodes not appearing    | Wrong path     | Check `/home/node/.n8n/custom/` |
| 401 Unauthorized       | Bad API key    | Regenerate in MitraChat         |
| Webhook not triggering | URL mismatch   | Verify webhook URL in provider  |
| "Connection refused"   | Backend down   | Start MitraChat first           |
| CORS errors            | Wrong Base URL | Use `host.docker.internal`      |

## License

MIT

## Support

- Documentation: https://docs.mitrachat.id/n8n
- Issues: https://github.com/mitrachat/n8n-nodes-mitrachat/issues
- Email: support@mitrachat.id
