import {
  type INodeType,
  type INodeTypeDescription,
  type IWebhookFunctions,
  type IWebhookResponseData,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  NodeOperationError,
} from "n8n-workflow";
import { createHash, createHmac } from "crypto";

interface WebhookEventBody {
  event: string;
  event_id: string;
  occurred_at: string;
  organization_id: string;
  data: Record<string, unknown>;
  links?: {
    self?: string;
    related?: Record<string, string>;
  };
}

export class MitraChatWebhookTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Webhook Trigger",
    name: "mitraChatWebhookTrigger",
    icon: "file:MitraChatProviderTrigger.svg",
    group: ["trigger"],
    version: 1,
    description:
      "Triggers on any MitraChat webhook event. Subscribe to events like contact.created, conversation.message.received, blast.campaign.completed, etc.",
    defaults: { name: "MitraChat Webhook Trigger" },
    inputs: [],
    outputs: ["main"],
    credentials: [{ name: "mitraChatApi", required: true }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Event",
        name: "eventKey",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getEventKeys",
        },
        default: "",
        required: true,
        description: "Select the webhook event to listen for",
      },
      {
        displayName: "Filter JSON",
        name: "filterJson",
        type: "string",
        typeOptions: {
          rows: 4,
        },
        default: "",
        description:
          'Optional JSON filter. Only trigger if payload matches all key-value pairs. Example: {"providerId": "abc-123"}',
      },
    ],
  };

  methods = {
    loadOptions: {
      async getEventKeys(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials("mitraChatApi");
        const response = await this.helpers.httpRequest({
          method: "GET",
          url: `${credentials.baseUrl}/api/n8n/webhooks/events`,
          headers: { "X-API-Key": credentials.apiKey as string },
          json: true,
        });
        const events = response.events || [];
        return events.map((e: any) => ({
          name: `${e.event_key} — ${e.description}`,
          value: e.event_key,
        }));
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const selectedEventKey = this.getNodeParameter("eventKey") as string;
    const filterJson = this.getNodeParameter("filterJson") as string;
    const bodyData = this.getBodyData() as unknown as WebhookEventBody;

    // Validate HMAC signature per ADR-002
    const signature = this.getHeaderData()["x-mitrachat-signature"] as
      | string
      | undefined;
    const timestamp = this.getHeaderData()["x-mitrachat-timestamp"] as
      | string
      | undefined;

    if (signature && timestamp) {
      const credentials = await this.getCredentials("mitraChatApi");
      const signingSecret = credentials.signingSecret as string;

      // Replay protection: reject if timestamp is outside ±5 minutes
      const now = Date.now();
      const ts = parseInt(timestamp, 10);
      if (Number.isNaN(ts) || Math.abs(now - ts) > 300_000) {
        throw new NodeOperationError(
          this.getNode(),
          "Webhook timestamp too old (replay protection)",
        );
      }

      // Build canonical signing string: METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256(body)
      const webhookUrl = new URL(credentials.baseUrl as string);
      const pathname = webhookUrl.pathname + (webhookUrl.pathname.endsWith("/") ? "" : "") + "/webhook";
      const bodyString = JSON.stringify(bodyData);
      const bodyHash = createHash("sha256").update(bodyString, "utf8").digest("hex");
      const signingString = `POST\n${pathname}\n${timestamp}\n${bodyHash}`;

      const expected = createHmac("sha256", signingSecret)
        .update(signingString)
        .digest("hex");

      // Timing-safe compare
      let mismatch = 0;
      if (expected.length !== signature.length) {
        mismatch = 1;
      } else {
        for (let i = 0; i < expected.length; i++) {
          mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
        }
      }

      if (mismatch !== 0) {
        throw new NodeOperationError(
          this.getNode(),
          "Webhook signature verification failed",
        );
      }
    }

    // Event key mismatch — skip
    if (bodyData.event !== selectedEventKey) {
      return { workflowData: [[]] };
    }

    // Optional JSON filter
    if (filterJson) {
      try {
        const filter = JSON.parse(filterJson) as Record<string, unknown>;
        const data = bodyData.data || {};
        for (const [key, value] of Object.entries(filter)) {
          if (data[key] !== value) {
            return { workflowData: [[]] };
          }
        }
      } catch {
        // Invalid filter JSON — ignore filter, still trigger
      }
    }

    return {
      workflowData: [
        this.helpers.returnJsonArray({
          event: bodyData.event,
          eventId: bodyData.event_id,
          occurredAt: bodyData.occurred_at,
          organizationId: bodyData.organization_id,
          data: bodyData.data,
          links: bodyData.links,
        }),
      ],
    };
  }
}
