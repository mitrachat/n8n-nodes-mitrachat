import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class MitraChatApi implements ICredentialType {
  name = "mitraChatApi";
  displayName = "MitraChat API";
  documentationUrl = "https://docs.mitrachat.id/n8n";

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Your MitraChat API key (mc_live_...)",
    },
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "https://api.mitrachat.id",
      required: true,
      description: "Your MitraChat instance URL",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        "X-API-Key": "={{ $credentials.apiKey }}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{ $credentials.baseUrl }}",
      url: "/api/n8n/health",
    },
  };
}
