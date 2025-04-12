import vault from "node-vault";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

class VaultMcpServer {
  private server: McpServer;
  private vaultClient: any;

  constructor(vaultAddress: string, vaultToken: string) {
    this.server = new McpServer({
      name: "vault-mcp",
      version: "1.0.0",
      description: "MCP Server for HashiCorp Vault secret management",
    });

    this.vaultClient = vault({
      endpoint: vaultAddress,
      token: vaultToken,
    });

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  private registerTools() {
    // Exposes write API from Vault KV v2 as an MCP tool
    this.server.tool(
      "secret/create",
      {
        path: z.string(),
        data: z.record(z.any()),
      },
      async ({ path, data }) => {
        const result = await this.vaultClient.write(`secret/data/${path}`, {
          data,
        });
        return {
          content: [
            {
              type: "text",
              text: `Secret written at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Read a KV secret (raw vault response)
    this.server.tool(
      "secret/read",
      {
        path: z.string(),
      },
      async ({ path }) => {
        const result = await this.vaultClient.read(`secret/data/${path}`);
        return {
          content: [
            {
              type: "text",
              text: `Secret read at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Soft-deletes a secret (versioned delete at KV v2 path)
    this.server.tool(
      "secret/delete",
      {
        path: z.string(),
      },
      async ({ path }) => {
        const result = await this.vaultClient.delete(`secret/data/${path}`);
        return {
          content: [
            {
              type: "text",
              text: `Secret deleted at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Vault policy writer (policy = raw string, passed directly)
    this.server.tool(
      "policy/create",
      {
        name: z.string(),
        policy: z.string(),
      },
      async ({ name, policy }) => {
        const result = await this.vaultClient.sys.addPolicy({ name, policy });
        return {
          content: [
            {
              type: "text",
              text: `Policy '${name}' created.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );
  }

  private registerResources() {
    // Lists top-level KV secret paths from Vault metadata
    this.server.resource("vault-secrets", "vault://secrets", async () => {
      try {
        const result = await this.vaultClient.list("secret/metadata");
        return {
          contents: [
            {
              uri: "vault://secrets",
              text: JSON.stringify(result.data.keys || []),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: "vault://secrets",
              text: "[]",
            },
          ],
        };
      }
    });

    // Lists current policy names from Vault
    this.server.resource("vault-policies", "vault://policies", async () => {
      const result = await this.vaultClient.sys.listPolicies();
      return {
        contents: [
          {
            uri: "vault://policies",
            text: JSON.stringify(result),
          },
        ],
      };
    });
  }

  private registerPrompts() {
    // Generates a Vault policy object from comma-separated capability string.
    // Returned as MCP `prompt` format (messages[]) instead of `content[]`.
    this.server.prompt(
      "generate-policy",
      {
        path: z.string(),
        capabilities: z.string(),
      },
      async ({ path, capabilities }) => {
        const capArray = capabilities.split(",").map((c) => c.trim());

        const policy = {
          path: {
            [path]: {
              capabilities: capArray,
            },
          },
        };

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: JSON.stringify(policy, null, 2),
              },
            },
          ],
        };
      }
    );
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Vault MCP Server running via stdio");
  }
}

export default VaultMcpServer;
