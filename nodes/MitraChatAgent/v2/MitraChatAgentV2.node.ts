import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";

/**
 * Parse the standardized error envelope from MitraChat API v2.
 */
function parseErrorEnvelope(response: any): string {
  if (response && response.ok === false && response.error) {
    const code = response.error.code || "unknown";
    const message = response.error.message || "Unknown error";
    if (code === "auth.missing_scope") {
      const requiredScope = response.error.details?.required_scope || "unknown";
      return `This API key needs scope \`${requiredScope}\`. Please regenerate your API key with the required scope.`;
    }
    return `[${code}] ${message}`;
  }
  return "Unknown API error";
}

export class MitraChatAgentV2 implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Agent",
    name: "mitraChatAgent",
    icon: "file:../MitraChatAgent.svg",
    group: ["transform"],
    version: 2,
    description:
      "Calls a selected MitraChat agent directly for an AI response. Supports v2 error envelope.",
    defaults: { name: "MitraChat Agent" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "mitraChatApi", required: true }],
    properties: [
      {
        displayName: "Agent",
        name: "agentId",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getAgents",
        },
        default: "",
        required: true,
        description: "Select the AI agent to use",
      },
      {
        displayName: "Message",
        name: "message",
        type: "string",
        typeOptions: { rows: 4 },
        default: "={{ $json.message }}",
        required: true,
        description: "The message to send to the agent",
      },
      {
        displayName: "Thread ID",
        name: "threadId",
        type: "string",
        default: "={{ $json.chatId }}",
        description: "Conversation thread ID for memory (optional)",
      },
      {
        displayName: "Provider ID",
        name: "providerId",
        type: "string",
        default: "={{ $json.providerId }}",
        description: "Provider ID for context (optional)",
      },
      {
        displayName: "Chat ID",
        name: "chatId",
        type: "string",
        default: "={{ $json.chatId }}",
        description: "Chat ID for logging (optional)",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getAgents(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials("mitraChatApi");
        const response = await this.helpers.httpRequest({
          method: "GET",
          url: `${credentials.baseUrl}/api/n8n/agents`,
          headers: { "X-API-Key": credentials.apiKey as string },
          json: true,
        });
        // v2 envelope: { ok: true, data: { agents: [...] } }
        const agents = response.ok === true ? (response.data?.agents || []) : (response.agents || []);
        return agents.map((a: any) => ({
          name: `${a.name}${a.model ? ` (${a.model})` : ""}`,
          value: a.id,
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("mitraChatApi");

    for (let i = 0; i < items.length; i++) {
      const agentId = this.getNodeParameter("agentId", i) as string;
      const message = this.getNodeParameter("message", i) as string;
      const threadId = this.getNodeParameter("threadId", i, "") as string;
      const providerId = this.getNodeParameter("providerId", i, "") as string;
      const chatId = this.getNodeParameter("chatId", i, "") as string;

      try {
        const response = await this.helpers.httpRequest({
          method: "POST",
          url: `${credentials.baseUrl}/api/n8n/agents/${agentId}/generate`,
          headers: {
            "X-API-Key": credentials.apiKey as string,
            "Content-Type": "application/json",
          },
          body: {
            message,
            threadId: threadId || undefined,
            providerId: providerId || undefined,
            chatId: chatId || undefined,
          },
          json: true,
        });

        // Handle v2 error envelope
        if (response.ok === false) {
          throw new Error(`MitraChat Agent API error: ${parseErrorEnvelope(response)}`);
        }

        // v2 envelope: { ok: true, data: { text, model, creditsDeducted } }
        const data = response.data || response;

        returnData.push({
          json: {
            response: data.text,
            model: data.model,
            creditsDeducted: data.creditsDeducted,
          },
          pairedItem: { item: i },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`MitraChat Agent API error: ${message}`);
      }
    }

    return [returnData];
  }
}
