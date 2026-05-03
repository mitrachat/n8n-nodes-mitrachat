import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

function safeParseJson(value: string): Record<string, unknown> {
  if (!value || value.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Metadata must be a JSON object");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid metadata JSON: ${message}`);
  }
}

export class MitraChatContact implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Contact",
    name: "mitraChatContact",
    icon: "file:MitraChatContact.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: "Enrich and sync MitraChat contact records",
    defaults: { name: "MitraChat Contact" },
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
            name: "Contact",
            value: "contact",
          },
        ],
        default: "contact",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["contact"],
          },
        },
        options: [
          {
            name: "Get",
            value: "get",
            description: "Resolve a contact by ID, phone, or email",
            action: "Get a contact",
          },
          {
            name: "Upsert",
            value: "upsert",
            description: "Create or update a contact",
            action: "Upsert a contact",
          },
          {
            name: "Add Tags",
            value: "addTags",
            description: "Add tags to a contact",
            action: "Add contact tags",
          },
          {
            name: "Remove Tags",
            value: "removeTags",
            description: "Remove tags from a contact",
            action: "Remove contact tags",
          },
          {
            name: "Add Note",
            value: "addNote",
            description: "Add a note to a contact",
            action: "Add a contact note",
          },
          {
            name: "Update Metadata",
            value: "updateMetadata",
            description: "Merge metadata into a contact",
            action: "Update contact metadata",
          },
        ],
        default: "get",
      },
      {
        displayName: "Contact ID",
        name: "contactId",
        type: "string",
        default: '={{ $json.contactId }}',
        description: "MitraChat contact ID",
        displayOptions: {
          show: {
            operation: ["get", "addTags", "removeTags", "addNote", "updateMetadata"],
          },
        },
      },
      {
        displayName: "Phone",
        name: "phone",
        type: "string",
        default: '={{ $json.phone }}',
        description: "Contact phone number",
        displayOptions: {
          show: {
            operation: ["get"],
          },
        },
      },
      {
        displayName: "Email",
        name: "email",
        type: "string",
        default: '={{ $json.email }}',
        description: "Contact email address",
        displayOptions: {
          show: {
            operation: ["get"],
          },
        },
      },
      {
        displayName: "Provider ID",
        name: "providerId",
        type: "string",
        default: '={{ $json.providerId }}',
        description: "Optional provider ID for phone/email lookup",
        displayOptions: {
          show: {
            operation: ["get"],
          },
        },
      },
      {
        displayName: "Name",
        name: "name",
        type: "string",
        default: "",
        description: "Contact name",
        displayOptions: {
          show: {
            operation: ["upsert"],
          },
        },
      },
      {
        displayName: "Phone",
        name: "upsertPhone",
        type: "string",
        default: "",
        description: "Contact phone number",
        displayOptions: {
          show: {
            operation: ["upsert"],
          },
        },
      },
      {
        displayName: "Email",
        name: "upsertEmail",
        type: "string",
        default: "",
        description: "Contact email address",
        displayOptions: {
          show: {
            operation: ["upsert"],
          },
        },
      },
      {
        displayName: "Metadata",
        name: "metadata",
        type: "json",
        default: '{}',
        description: "JSON metadata object",
        displayOptions: {
          show: {
            operation: ["upsert", "updateMetadata"],
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
        description: "Tags to add or remove",
        displayOptions: {
          show: {
            operation: ["addTags", "removeTags"],
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

      const contactId = this.getNodeParameter("contactId", i, "") as string;

      if (operation === "get") {
        method = "GET";
        url = `${baseUrl}/api/n8n/contacts/resolve`;
        if (contactId) {
          qs = { contactId };
        } else {
          qs = {
            phone: this.getNodeParameter("phone", i, "") as string || undefined,
            email: this.getNodeParameter("email", i, "") as string || undefined,
            providerId: this.getNodeParameter("providerId", i, "") as string || undefined,
          };
        }
      } else if (operation === "upsert") {
        method = "POST";
        url = `${baseUrl}/api/n8n/contacts/upsert`;
        const metadataStr = this.getNodeParameter("metadata", i, "{}") as string;
        body = {
          name: this.getNodeParameter("name", i) as string,
          phone: this.getNodeParameter("upsertPhone", i, "") as string || undefined,
          email: this.getNodeParameter("upsertEmail", i, "") as string || undefined,
          metadata: safeParseJson(metadataStr),
        };
      } else if (operation === "addTags") {
        method = "POST";
        url = `${baseUrl}/api/n8n/contacts/${contactId}/tags/add`;
        body = { tags: this.getNodeParameter("tags", i) as string[] };
      } else if (operation === "removeTags") {
        method = "POST";
        url = `${baseUrl}/api/n8n/contacts/${contactId}/tags/remove`;
        body = { tags: this.getNodeParameter("tags", i) as string[] };
      } else if (operation === "addNote") {
        method = "POST";
        url = `${baseUrl}/api/n8n/contacts/${contactId}/note`;
        body = { content: this.getNodeParameter("content", i) as string };
      } else if (operation === "updateMetadata") {
        method = "PATCH";
        url = `${baseUrl}/api/n8n/contacts/${contactId}/metadata`;
        const metadataStr = this.getNodeParameter("metadata", i, "{}") as string;
        body = { metadata: safeParseJson(metadataStr) };
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
