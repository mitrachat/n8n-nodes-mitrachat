import type {
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

interface WebhookBody {
  providerId: string;
  providerType: string;
  chatId: string;
  message: string;
  userId?: number | string;
  username?: string;
  timestamp: string;
}

export class MitraChatProviderTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Provider Trigger",
    name: "mitraChatProviderTrigger",
    icon: "file:mitrachat-trigger.svg",
    group: ["trigger"],
    version: 1,
    description:
      "Triggers when a message is received from Telegram, WhatsApp, or WebChat",
    defaults: { name: "MitraChat Provider Trigger" },
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
        displayName: "Provider",
        name: "providerId",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getProviders",
        },
        default: "",
        required: true,
        description: "Select the provider to listen for messages",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getProviders(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials("mitraChatApi");
        const response = await this.helpers.httpRequest({
          method: "GET",
          url: `${credentials.baseUrl}/api/n8n/providers`,
          headers: { "X-API-Key": credentials.apiKey as string },
          json: true,
        });
        const providers = response.providers || [];
        return providers.map((p: any) => ({
          name: `${p.name} (${p.type})`,
          value: p.id,
        }));
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const bodyData = this.getBodyData() as unknown as WebhookBody;

    return {
      workflowData: [
        this.helpers.returnJsonArray({
          providerId: bodyData.providerId,
          providerType: bodyData.providerType,
          chatId: bodyData.chatId,
          message: bodyData.message,
          userId: bodyData.userId,
          username: bodyData.username,
          timestamp: bodyData.timestamp,
        }),
      ],
    };
  }
}
