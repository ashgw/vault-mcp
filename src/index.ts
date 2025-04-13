/**
 * HashiCorp Vault MCP Server Implementation
 *
 * This server provides a Model Context Protocol (MCP) interface to HashiCorp Vault,
 * allowing LLMs to interact with Vault's secret management and policy features.
 *
 * @module VaultMcpServer
 */

import vault from "node-vault";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * VaultMcpServer class provides MCP interface to HashiCorp Vault
 *
 * Features:
 * - Secret management (create, read, delete)
 * - Policy management
 * - Resource listing
 * - Policy generation helpers
 */

// Add this validation schema
const VaultConfigSchema = z.object({
  VAULT_ADDR: z.string().url({
    message:
      "VAULT_ADDR must be a valid URL (e.g., http://vault.example.com:8200)",
  }),
  VAULT_TOKEN: z.string().min(3).startsWith("hsv.", {
    message:
      "VAULT_TOKEN must start with 'hsv.' prefix for HashiCorp Vault tokens",
  }),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),
});

class VaultMcpServer {
  private server: McpServer;
  private vaultClient: any;
  private config: z.infer<typeof VaultConfigSchema>;

  /**
   * Creates a new VaultMcpServer instance
   *
   * @param vaultAddress - The URL of the Vault server
   * @param vaultToken - Authentication token for Vault access
   */
  constructor(vaultAddress: string, vaultToken: string) {
    // Validate config
    try {
      this.config = VaultConfigSchema.parse({
        VAULT_ADDR: vaultAddress,
        VAULT_TOKEN: vaultToken,
        MCP_PORT: process.env.MCP_PORT,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `- ${issue.path}: ${issue.message}`)
          .join("\n");
        throw new Error(`Invalid Vault configuration:\n${issues}`);
      }
      throw error;
    }

    this.server = new McpServer({
      name: "vault-mcp",
      version: "1.0.0",
      description: "MCP Server for HashiCorp Vault secret management",
    });

    this.vaultClient = vault({
      endpoint: this.config.VAULT_ADDR,
      token: this.config.VAULT_TOKEN,
    });

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  /**
   * Registers all available tools with the MCP server
   *
   * Tools:
   * - secret/create: Creates or updates a secret at specified path
   * - secret/read: Retrieves a secret from specified path
   * - secret/delete: Removes a secret (soft delete)
   * - policy/create: Creates a new Vault policy
   *
   * @private
   */
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

  /**
   * Registers all available resources with the MCP server
   *
   * Resources:
   * - vault://secrets: Lists all secret paths in the KV store
   * - vault://policies: Lists all available policies
   *
   * @private
   */
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

  /**
   * Registers all available prompts with the MCP server
   *
   * Prompts:
   * - generate-policy: Creates a policy object from path and capabilities
   *
   * @private
   */
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

  /**
   * Starts the MCP server using stdio transport
   *
   * @public
   */
  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Vault MCP Server running via stdio");
  }
}

export default VaultMcpServer;

/**
 * Usage Example:
 *
 * ```typescript
 * const server = new VaultMcpServer(
 *   "http://vault.example.com:8200",
 *   "vault-token-here"
 * );
 * await server.start();
 * ```
 *
 * Tool Usage:
 * ```typescript
 * // Create a secret
 * await tool("secret/create", {
 *   path: "my/secret",
 *   data: { key: "value" }
 * });
 *
 * // Read a secret
 * await tool("secret/read", {
 *   path: "my/secret"
 * });
 *
 * // Create a policy
 * await tool("policy/create", {
 *   name: "read-only",
 *   policy: 'path "secret/*" { capabilities = ["read", "list"] }'
 * });
 * ```
 */

async function main() {
  console.error("Starting Vault MCP Server...");

  // Load environment variables
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;

  if (!vaultAddr || !vaultToken) {
    console.error(
      "Error: VAULT_ADDR and VAULT_TOKEN environment variables are required"
    );
    process.exit(1);
  }

  try {
    const server = new VaultMcpServer(vaultAddr, vaultToken);
    console.error(`Connecting to Vault at: ${vaultAddr}`);
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Auto-start if this is the main module
if (import.meta.url === new URL(import.meta.resolve("./index.ts")).href) {
  main();
}
