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
      {
        displayName: "Record To CRM",
        name: "recordToCrm",
        type: "boolean",
        default: true,
        description:
          "Whether to save the outbound message to MitraChat CRM history. Requires the provider to have CRM enabled.",
      },
      {
        displayName: "Reply To External Message ID",
        name: "replyToExternalMessageId",
        type: "string",
        default: "",
        description:
          "Optional external message ID to reply to (provider-dependent support)",
      },
      {
        displayName: "Reply Preview",
        name: "replyPreview",
        type: "json",
        default: '{}',
        description:
          "Optional reply preview object. Example: { sender_type: 'contact', sender_name: 'User', content: 'Hello' }",
      },
      {
        displayName: "Attachment Kind",
        name: "attachmentKind",
        type: "options",
        options: [
          { name: "Image", value: "image" },
          { name: "File", value: "file" },
        ],
        default: "image",
        displayOptions: {
          show: {
            "@version": [1],
          },
        },
        description: "Type of attachment to send",
      },
      {
        displayName: "Attachment Filename",
        name: "attachmentFilename",
        type: "string",
        default: "",
        description: "Filename for the attachment",
      },
      {
        displayName: "Attachment MIME Type",
        name: "attachmentMimeType",
        type: "string",
        default: "",
        description: "MIME type of the attachment (e.g. image/png, application/pdf)",
      },
      {
        displayName: "Attachment Size",
        name: "attachmentSize",
        type: "number",
        default: 0,
        description: "Size of the attachment in bytes",
      },
      {
        displayName: "Attachment Data URL",
        name: "attachmentDataUrl",
        type: "string",
        typeOptions: { rows: 2 },
        default: "",
        description:
          "Base64 data URL for the attachment (data:mime/type;base64,...). Either dataUrl or a server-side storagePath can be used.",
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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("mitraChatApi");

    for (let i = 0; i < items.length; i++) {
      const providerId = this.getNodeParameter("providerId", i) as string;
      const chatId = this.getNodeParameter("chatId", i) as string;
      const message = this.getNodeParameter("message", i) as string;
      const recordToCrm = this.getNodeParameter("recordToCrm", i, true) as boolean;
      const replyToExternalMessageId = this.getNodeParameter(
        "replyToExternalMessageId",
        i,
        "",
      ) as string;

      const body: Record<string, unknown> = {
        chatId,
        message,
        recordToCrm,
      };

      if (replyToExternalMessageId) {
        body.replyToExternalMessageId = replyToExternalMessageId;
      }

      const replyPreviewStr = this.getNodeParameter("replyPreview", i, "{}") as string;
      if (replyPreviewStr && replyPreviewStr.trim() !== "{}") {
        try {
          const replyPreview = JSON.parse(replyPreviewStr);
          if (replyPreview && typeof replyPreview === "object") {
            body.replyPreview = replyPreview;
          }
        } catch {
          throw new Error("Invalid replyPreview JSON");
        }
      }

      const attachmentKind = this.getNodeParameter("attachmentKind", i, "") as string;
      const attachmentFilename = this.getNodeParameter("attachmentFilename", i, "") as string;
      const attachmentMimeType = this.getNodeParameter("attachmentMimeType", i, "") as string;
      const attachmentSize = this.getNodeParameter("attachmentSize", i, 0) as number;
      const attachmentDataUrl = this.getNodeParameter("attachmentDataUrl", i, "") as string;

      if (attachmentKind && attachmentFilename && attachmentMimeType) {
        const attachment: Record<string, unknown> = {
          kind: attachmentKind,
          filename: attachmentFilename,
          mimeType: attachmentMimeType,
          size: attachmentSize,
        };
        if (attachmentDataUrl) {
          attachment.dataUrl = attachmentDataUrl;
        }
        body.attachment = attachment;
      }

      const response = await this.helpers.httpRequest({
        method: "POST",
        url: `${credentials.baseUrl}/api/n8n/providers/${providerId}/send`,
        headers: {
          "X-API-Key": credentials.apiKey as string,
          "Content-Type": "application/json",
        },
        body,
        json: true,
      });

      returnData.push({
        json: {
          success: response.success,
          providerId,
          chatId,
          externalMessageId: response.externalMessageId ?? null,
          recordedMessageId: response.recordedMessageId ?? null,
          crmRecordError: response.crmRecordError ?? null,
        },
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}
