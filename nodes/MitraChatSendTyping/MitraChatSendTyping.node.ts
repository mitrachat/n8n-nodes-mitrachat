import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

export class MitraChatSendTyping implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Send Typing",
    name: "mitraChatSendTyping",
    icon: "file:MitraChatSendTyping.svg",
    group: ["output"],
    version: 1,
    description: "Send a typing indicator to a user via Telegram or WebChat",
    defaults: { name: "MitraChat Send Typing" },
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
        description: "Select the provider to send typing indicator via",
      },
      {
        displayName: "Chat ID",
        name: "chatId",
        type: "string",
        default: "={{ $json.chatId }}",
        required: true,
        description: "The chat/conversation ID to send typing indicator to",
      },
      {
        displayName: "Is Typing",
        name: "isTyping",
        type: "boolean",
        default: true,
        description:
          "Whether to show (true) or hide (false) the typing indicator. Telegram always shows typing and auto-expires after ~5 seconds. WebChat supports both show and hide.",
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
      const isTyping = this.getNodeParameter("isTyping", i) as boolean;

      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${credentials.baseUrl}/api/n8n/providers/${providerId}/typing`,
        headers: {
          "X-API-Key": credentials.apiKey as string,
        },
        body: { chatId, isTyping },
        json: true,
      });

      returnData.push({
        json: {
          success: response.success,
          providerId,
          chatId,
          isTyping,
        },
      });
    }

    return [returnData];
  }
}
