import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

export class MitraChatSendMessage implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Send Message",
    name: "mitraChatSendMessage",
    icon: "file:MitraChatSendMessage.svg",
    group: ["output"],
    version: 1,
    description: "Send a message to a user via Telegram, WhatsApp, or WebChat",
    defaults: { name: "MitraChat Send Message" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "mitraChatApi", required: true }],
    properties: [
      {
        displayName: "Provider",
        name: "providerId",
        type: "options",
        typeOptions: { loadOptionsMethod: "getProviders" },
        default: "",
        required: true,
        description: "Select the provider to send via",
      },
      {
        displayName: "Chat ID",
        name: "chatId",
        type: "string",
        default: "={{ $json.chatId }}",
        required: true,
        description: "The chat/conversation ID to send to",
      },
      {
        displayName: "Message",
        name: "message",
        type: "string",
        typeOptions: { rows: 4 },
        default: "={{ $json.response }}",
        required: true,
        description: "The message to send",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getProviders(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials("mitraChatApi");
        const response = await this.helpers.request({
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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("mitraChatApi");

    for (let i = 0; i < items.length; i++) {
      const providerId = this.getNodeParameter("providerId", i) as string;
      const chatId = this.getNodeParameter("chatId", i) as string;
      const message = this.getNodeParameter("message", i) as string;

      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${credentials.baseUrl}/api/n8n/providers/${providerId}/send`,
        headers: {
          "X-API-Key": credentials.apiKey as string,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId, message }),
        json: true,
      });

      returnData.push({
        json: {
          success: response.success,
          providerId,
          chatId,
        },
      });
    }

    return [returnData];
  }
}
