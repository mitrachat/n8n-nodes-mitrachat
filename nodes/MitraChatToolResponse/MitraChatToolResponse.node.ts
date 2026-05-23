import type {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
} from "n8n-workflow";
import { createHash, createHmac } from "crypto";

/**
 * Body shape accepted by `POST /api/n8n/tools/:invocation_id/complete`.
 *
 * Server validator (apps/server/routes/n8n.route.ts) requires:
 *   - status: 'completed' | 'failed'
 *   - output (optional, returned to the agent on success)
 *   - error  (optional, used when status='failed')
 *
 * If you change this shape, also update the server validator and the
 * canonical contract docs in docs/n8n-integration/ADR-002-ai-tool-invocation.md.
 */
interface AsyncCompleteBody {
  status: "completed" | "failed";
  output?: unknown;
  error?: string;
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
        displayName: "Status",
        name: "status",
        type: "options",
        options: [
          { name: "Completed", value: "completed" },
          { name: "Failed", value: "failed" },
        ],
        default: "completed",
        description: "Final status of the tool invocation",
        displayOptions: {
          show: {
            responseMode: ["async"],
          },
        },
      },
      {
        displayName: "Invocation ID",
        name: "invocationId",
        type: "string",
        default: "={{ $json.invocation_id }}",
        description:
          "The X-Mitrachat-Invocation-Id from the incoming webhook (or invocation_id from the body)",
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
        description:
          "Tool output to return on success (must match the tool's output_schema). Ignored when Status = Failed.",
        displayOptions: {
          show: {
            status: ["completed"],
          },
        },
      },
      {
        displayName: "Error Message",
        name: "errorMessage",
        type: "string",
        default: "",
        description: "Human-readable error message returned to the agent on failure",
        displayOptions: {
          show: {
            status: ["failed"],
          },
        },
      },
      {
        displayName: "Fail on Schema Mismatch?",
        name: "validateSchema",
        type: "boolean",
        default: false,
        description:
          "Validate result against the tool's output_schema before sending (not yet enforced server-side)",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("mitraChatApi");
    const baseUrl = (credentials.baseUrl as string) || "https://mitrachat.id";
    const apiKey = credentials.apiKey as string;
    const signingSecret = (credentials.signingSecret as string) || "";

    for (let i = 0; i < items.length; i++) {
      const responseMode = this.getNodeParameter("responseMode", i) as string;

      if (responseMode === "sync") {
        // Sync mode: return result as the node output. The HTTP response
        // node ahead of this in the n8n workflow is what speaks to MitraChat.
        const resultDataRaw = this.getNodeParameter("resultData", i) as string;
        let resultData: unknown;
        try {
          resultData = JSON.parse(resultDataRaw);
        } catch {
          resultData = resultDataRaw;
        }
        returnData.push({
          json: {
            ok: true,
            data: resultData,
          } as any,
        });
        continue;
      }

      // ----- Async mode -----
      const status = this.getNodeParameter("status", i, "completed") as
        | "completed"
        | "failed";
      const invocationId = this.getNodeParameter("invocationId", i) as string;
      if (!invocationId) {
        throw new Error("Invocation ID is required for async mode");
      }

      const body: AsyncCompleteBody = { status };
      if (status === "completed") {
        const resultDataRaw = this.getNodeParameter("resultData", i, "") as string;
        let resultData: unknown = undefined;
        if (resultDataRaw !== "" && resultDataRaw !== undefined) {
          try {
            resultData = JSON.parse(resultDataRaw);
          } catch {
            resultData = resultDataRaw;
          }
        }
        body.output = resultData;
      } else {
        const errorMessage = this.getNodeParameter("errorMessage", i, "") as string;
        body.error = errorMessage || "Tool reported failure";
      }

      const bodyString = JSON.stringify(body);
      const url = `${baseUrl}/api/n8n/tools/${encodeURIComponent(invocationId)}/complete`;
      const urlPath = new URL(url).pathname;
      const ts = String(Date.now());

      // Sign the response so the server can attribute it to the original
      // invocation. The signing secret comes from the credential and must
      // match the secret the server used when dispatching the invocation.
      // (Server stores `(invocation_id → tool.signing_secret)` and verifies.)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Mitrachat-Timestamp": ts,
        "X-Mitrachat-Signed-Path": urlPath,
        "X-Mitrachat-Invocation-Id": invocationId,
      };
      if (signingSecret) {
        const bodyHash = createHash("sha256")
          .update(bodyString, "utf8")
          .digest("hex");
        const signingString = `POST\n${urlPath}\n${ts}\n${bodyHash}`;
        const sig = createHmac("sha256", signingSecret)
          .update(signingString)
          .digest("hex");
        headers["X-Mitrachat-Signature"] = `sha256=${sig}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyString,
      });

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
          status,
        } as any,
      });
    }

    return [returnData];
  }
}
