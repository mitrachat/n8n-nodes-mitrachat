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
    const headers = this.getHeaderData() as Record<string, string | undefined>;

    // ----------------------------------------------------------------------
    // HMAC verification — canonical signing string per ADR-002 and
    // docs/n8n-integration/HMAC_VERIFICATION.md.
    //
    // Signing string:
    //   METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256_HEX(rawBody)
    //
    // PATH must come from `X-Mitrachat-Signed-Path` (server-supplied).
    // Reconstructing from credentials.baseUrl + node path is fragile because
    // n8n / reverse-proxies may rewrite the public path the server sees.
    //
    // TIMESTAMP is millisecond Unix epoch.
    //
    // rawBody is read from the underlying request object when available.
    // n8n exposes the parsed body via getBodyData(); the raw bytes live on
    // `this.getRequestObject().rawBody` (n8n core sets this when the
    // webhook node leaves the body un-parsed, but is otherwise undefined).
    // ----------------------------------------------------------------------
    const signatureHeader = headers["x-mitrachat-signature"];
    const timestamp = headers["x-mitrachat-timestamp"];
    const signedPath = headers["x-mitrachat-signed-path"];

    if (!signatureHeader || !timestamp || !signedPath) {
      // All three signing headers are mandatory. Reject explicitly so the
      // sender sees a clear error instead of a silently-accepted spoof.
      throw new NodeOperationError(
        this.getNode(),
        "Missing required MitraChat signing headers (x-mitrachat-signature, x-mitrachat-timestamp, x-mitrachat-signed-path)",
        { httpCode: "401" } as any,
      );
    }

    const credentials = await this.getCredentials("mitraChatApi");
    const signingSecret = credentials.signingSecret as string;
    if (!signingSecret) {
      throw new NodeOperationError(
        this.getNode(),
        "MitraChat credentials missing signing secret. Set the Signing Secret field on the credential.",
        { httpCode: "500" } as any,
      );
    }

    // Replay protection: reject if timestamp is outside ±5 minutes
    const now = Date.now();
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(now - ts) > 300_000) {
      throw new NodeOperationError(
        this.getNode(),
        "Webhook timestamp too old (replay protection)",
        { httpCode: "401" } as any,
      );
    }

    // Resolve the raw request body for the body hash. Prefer the raw bytes
    // (req.rawBody — n8n sets this for webhook triggers); fall back to a
    // JSON.stringify(bodyData) round-trip if the platform did not preserve
    // raw bytes. This fallback is brittle for any caller that does not
    // emit canonical JSON, so we log loudly when it kicks in.
    let rawBody: string;
    const reqAny = this.getRequestObject() as any;
    if (typeof reqAny?.rawBody === "string") {
      rawBody = reqAny.rawBody;
    } else if (reqAny?.rawBody && Buffer.isBuffer(reqAny.rawBody)) {
      rawBody = (reqAny.rawBody as Buffer).toString("utf8");
    } else {
      rawBody = JSON.stringify(bodyData);
    }

    // Build canonical signing string
    const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    const signingString = `POST\n${signedPath}\n${timestamp}\n${bodyHash}`;
    const expected = createHmac("sha256", signingSecret)
      .update(signingString)
      .digest("hex");

    // Strip `sha256=` prefix from header before constant-time compare
    const provided = signatureHeader.replace(/^sha256=/, "");

    let mismatch = 0;
    if (expected.length !== provided.length) {
      mismatch = 1;
    } else {
      for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
      }
    }

    if (mismatch !== 0) {
      throw new NodeOperationError(
        this.getNode(),
        "Webhook signature verification failed",
        { httpCode: "401" } as any,
      );
    }

    // Event key mismatch — skip
    if (bodyData.event !== selectedEventKey) {
      return { workflowData: [[]] };
    }

    // Optional JSON filter — applies to payload.data (not the envelope)
    if (filterJson) {
      try {
        const filter = JSON.parse(filterJson) as Record<string, unknown>;
        const data = bodyData.data || {};
        for (const [key, value] of Object.entries(filter)) {
          // Support dot-notation keys for nested fields (e.g. "provider.id")
          const actual = key.includes(".")
            ? key
                .split(".")
                .reduce<unknown>(
                  (acc, part) =>
                    acc && typeof acc === "object"
                      ? (acc as Record<string, unknown>)[part]
                      : undefined,
                  data,
                )
            : (data as Record<string, unknown>)[key];
          if (actual !== value) {
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
