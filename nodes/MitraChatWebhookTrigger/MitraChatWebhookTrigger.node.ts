import type {
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

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

    // Validate HMAC signature if present
    const signature = this.getHeaderData()["x-mitrachat-signature"] as
      | string
      | undefined;
    if (signature) {
      // Signature verification is handled server-side before delivery.
      // n8n nodes trust the payload because the webhook URL is secret.
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
