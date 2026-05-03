import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class MitraChatConversation implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Conversation",
    name: "mitraChatConversation",
    icon: "file:MitraChatConversation.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: "Inspect and control MitraChat CRM conversations",
    defaults: { name: "MitraChat Conversation" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "mitraChatApi", required: true }],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Conversation",
            value: "conversation",
          },
        ],
        default: "conversation",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["conversation"],
          },
        },
        options: [
          {
            name: "Get",
            value: "get",
            description: "Resolve a conversation by providerId + chatId or chatroomId",
            action: "Get a conversation",
          },
          {
            name: "Get Messages",
            value: "getMessages",
            description: "Get recent messages for a conversation",
            action: "Get conversation messages",
          },
          {
            name: "Add Note",
            value: "addNote",
            description: "Add an internal note to the conversation contact",
            action: "Add a conversation note",
          },
          {
            name: "Set Tags",
            value: "setTags",
            description: "Replace all contact tags for the conversation",
            action: "Set conversation tags",
          },
          {
            name: "Add Tags",
            value: "addTags",
            description: "Append tags to the conversation contact",
            action: "Add conversation tags",
          },
          {
            name: "Remove Tags",
            value: "removeTags",
            description: "Remove tags from the conversation contact",
            action: "Remove conversation tags",
          },
          {
            name: "Set Control Mode",
            value: "setControlMode",
            description: "Set the conversation control mode",
            action: "Set conversation control mode",
          },
          {
            name: "Request Handover",
            value: "requestHandover",
            description: "Request admin handover for the conversation",
            action: "Request conversation handover",
          },
        ],
        default: "get",
      },
      {
        displayName: "Provider ID",
        name: "providerId",
        type: "string",
        default: '={{ $json.providerId }}',
        description: "MitraChat provider ID",
        displayOptions: {
          show: {
            operation: ["get", "getMessages", "addNote", "setTags", "addTags", "removeTags", "setControlMode", "requestHandover"],
          },
        },
      },
      {
        displayName: "Chat ID",
        name: "chatId",
        type: "string",
        default: '={{ $json.chatId }}',
        description: "External chat ID from the provider",
        displayOptions: {
          show: {
            operation: ["get", "getMessages", "addNote", "setTags", "addTags", "removeTags", "setControlMode", "requestHandover"],
          },
        },
      },
      {
        displayName: "Chatroom ID",
        name: "chatroomId",
        type: "string",
        default: "",
        description: "MitraChat chatroom ID (alternative to providerId + chatId). If empty, providerId + chatId will be used to resolve the conversation first.",
        displayOptions: {
          show: {
            operation: ["get", "getMessages", "addNote", "setTags", "addTags", "removeTags", "setControlMode", "requestHandover"],
          },
        },
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        default: 20,
        description: "Maximum number of messages to return",
        displayOptions: {
          show: {
            operation: ["getMessages"],
          },
        },
      },
      {
        displayName: "Offset",
        name: "offset",
        type: "number",
        default: 0,
        description: "Number of messages to skip",
        displayOptions: {
          show: {
            operation: ["getMessages"],
          },
        },
      },
      {
        displayName: "Content",
        name: "content",
        type: "string",
        typeOptions: { rows: 4 },
        default: "",
        description: "Note content",
        displayOptions: {
          show: {
            operation: ["addNote"],
          },
        },
      },
      {
        displayName: "Tags",
        name: "tags",
        type: "string",
        default: [],
        typeOptions: {
          multipleValues: true,
        },
        description: "Tags to set on the contact",
        displayOptions: {
          show: {
            operation: ["setTags", "addTags", "removeTags"],
          },
        },
      },
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        options: [
          { name: "AI Owned", value: "ai_owned" },
          { name: "Waiting Admin", value: "waiting_admin" },
          { name: "Human Owned", value: "human_owned" },
        ],
        default: "ai_owned",
        description: "Control mode for the conversation",
        displayOptions: {
          show: {
            operation: ["setControlMode"],
          },
        },
      },
      {
        displayName: "Reason",
        name: "reason",
        type: "string",
        default: "",
        description: "Optional reason for control mode change or handover",
        displayOptions: {
          show: {
            operation: ["setControlMode", "requestHandover"],
          },
        },
      },
      {
        displayName: "Controlled By",
        name: "controlledBy",
        type: "string",
        default: "",
        description: "Optional identifier of who controls the handover",
        displayOptions: {
          show: {
            operation: ["requestHandover"],
          },
        },
      },
      {
        displayName: "Controlled By Name",
        name: "controlledByName",
        type: "string",
        default: "",
        description: "Optional display name of the controller",
        displayOptions: {
          show: {
            operation: ["requestHandover"],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("mitraChatApi");

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter("operation", i) as string;
      const baseUrl = credentials.baseUrl as string;
      const apiKey = credentials.apiKey as string;

      let method = "GET";
      let url = "";
      let body: any;
      let qs: any;

      let chatroomId = this.getNodeParameter("chatroomId", i, "") as string;

      // Resolve chatroomId from providerId + chatId if not provided
      if (!chatroomId && operation !== "get") {
        const providerId = this.getNodeParameter("providerId", i, "") as string;
        const chatId = this.getNodeParameter("chatId", i, "") as string;
        if (providerId && chatId) {
          const resolved = await this.helpers.httpRequest({
            method: "GET",
            url: `${baseUrl}/api/n8n/conversations/resolve`,
            headers: {
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
            qs: { providerId, chatId },
            json: true,
          });
          chatroomId = resolved.chatroomId;
        }
        if (!chatroomId) {
          throw new Error("chatroomId or providerId + chatId is required");
        }
      }

      if (operation === "get") {
        method = "GET";
        url = `${baseUrl}/api/n8n/conversations/resolve`;
        if (chatroomId) {
          qs = { chatroomId };
        } else {
          qs = {
            providerId: this.getNodeParameter("providerId", i, "") as string,
            chatId: this.getNodeParameter("chatId", i, "") as string,
          };
        }
      } else if (operation === "getMessages") {
        method = "GET";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/messages`;
        qs = {
          limit: this.getNodeParameter("limit", i, 20) as number,
          offset: this.getNodeParameter("offset", i, 0) as number,
        };
      } else if (operation === "addNote") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/note`;
        body = { content: this.getNodeParameter("content", i) as string };
      } else if (operation === "setTags") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/tags`;
        body = { tags: this.getNodeParameter("tags", i) as string[] };
      } else if (operation === "addTags") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/tags/add`;
        body = { tags: this.getNodeParameter("tags", i) as string[] };
      } else if (operation === "removeTags") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/tags/remove`;
        body = { tags: this.getNodeParameter("tags", i) as string[] };
      } else if (operation === "setControlMode") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/control-mode`;
        body = {
          mode: this.getNodeParameter("mode", i) as string,
          reason: this.getNodeParameter("reason", i, "") as string || undefined,
        };
      } else if (operation === "requestHandover") {
        method = "POST";
        url = `${baseUrl}/api/n8n/conversations/${chatroomId}/request-handover`;
        body = {
          reason: this.getNodeParameter("reason", i, "") as string || undefined,
          controlledBy: this.getNodeParameter("controlledBy", i, "") as string || undefined,
          controlledByName: this.getNodeParameter("controlledByName", i, "") as string || undefined,
        };
      }

      const response = await this.helpers.httpRequest({
        method: method as any,
        url,
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body,
        qs,
        json: true,
      });

      returnData.push({
        json: response,
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}
