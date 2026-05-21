import type {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
} from "n8n-workflow";

interface AsyncCompleteBody {
  ok: true;
  data: unknown;
}

export class MitraChatToolResponse implements INodeType {
  description: INodeTypeDescription = {
    displayName: "MitraChat Tool Response",
    name: "mitraChatToolResponse",
    icon: "file:MitraChatToolResponse.svg",
    group: ["transform"],
    version: 1,
    description: "Return tool result to MitraChat (sync or async mode)",
    defaults: {
      name: "MitraChat Tool Response",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "mitraChatApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Response Mode",
        name: "responseMode",
        type: "options",
        options: [
          {
            name: "Sync (return inline)",
            value: "sync",
            description: "Return result directly to the AI agent",
          },
          {
            name: "Async (POST to complete endpoint)",
            value: "async",
            description: "POST result to MitraChat async completion endpoint",
          },
        ],
        default: "sync",
        required: true,
      },
      {
        displayName: "Invocation ID",
        name: "invocationId",
        type: "string",
        default: "={{ $json.invocation_id }}",
        description: "The X-Mitrachat-Invocation-Id from the incoming webhook",
        displayOptions: {
          show: {
            responseMode: ["async"],
          },
        },
        required: true,
      },
      {
        displayName: "Result Data (JSON)",
        name: "resultData",
        type: "json",
        default: "={{$json}}",
        description: "The tool result to return (must match output_schema)",
        required: true,
      },
      {
        displayName: "Fail on Schema Mismatch?",
        name: "validateSchema",
        type: "boolean",
        default: false,
        description: "Validate result against the tool's output_schema before sending",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("mitraChatApi");
    const baseUrl = (credentials.baseUrl as string) || "https://mitrachat.id";
    const apiKey = credentials.apiKey as string;

    for (let i = 0; i < items.length; i++) {
      const responseMode = this.getNodeParameter("responseMode", i) as string;
      const resultDataRaw = this.getNodeParameter("resultData", i) as string;
      const validateSchema = this.getNodeParameter("validateSchema", i) as boolean;

      let resultData: unknown;
      try {
        resultData = JSON.parse(resultDataRaw);
      } catch {
        resultData = resultDataRaw;
      }

      if (responseMode === "sync") {
        // Sync mode: just return the result as the node output
        // The HTTP response node before this should return 200
        returnData.push({
          json: {
            ok: true,
            data: resultData,
          } as any,
        });
        continue;
      }

      // Async mode: POST to /api/n8n/tools/:invocation_id/complete
      const invocationId = this.getNodeParameter("invocationId", i) as string;
      if (!invocationId) {
        throw new Error("Invocation ID is required for async mode");
      }

      const body: AsyncCompleteBody = {
        ok: true,
        data: resultData,
      };

      const response = await fetch(
        `${baseUrl}/api/n8n/tools/${encodeURIComponent(invocationId)}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `MitraChat async completion failed: ${response.status} ${text}`,
        );
      }

      returnData.push({
        json: {
          ok: true,
          asyncCompleted: true,
          invocationId,
        } as any,
      });
    }

    return [returnData];
  }
}
