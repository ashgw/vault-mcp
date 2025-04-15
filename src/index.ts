/**
 * HashiCorp Vault MCP Server Implementation
 *
 * This server provides a Model Context Protocol (MCP) interface to HashiCorp Vault,
 * allowing LLMs to interact with Vault's secret management and policy features.
 *
 * @module VaultMcpServer
 */

import vault from "node-vault"; // Import the Node Vault client for interacting with HashiCorp Vault
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Import the MCP server to expose our tools to LLMs
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; // Import a transport to communicate via stdio
import { z } from "zod"; // Import Zod for schema validation

/**
 * Define a Zod schema for configuration.
 *
 * This schema validates the Vault configuration to ensure:
 * - VAULT_ADDR is a valid URL
 * - VAULT_TOKEN has at least 3 characters and starts with "hsv."
 * - MCP_PORT is an optional valid number within port range (defaults to 3000 if omitted)
 */
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

/**
 * VaultMcpServer class
 *
 * Provides an MCP interface to HashiCorp Vault that exposes a set of tools,
 * resources, and prompts to interact with Vault's secret and policy management.
 *
 * Features exposed:
 * - secret/create  : Creates or updates a secret at a specified path in Vault.
 * - secret/read    : Retrieves a secret from a specified path in Vault.
 * - secret/delete  : Soft-deletes a secret from a specified path.
 * - policy/create  : Creates a new policy in Vault.
 *
 * Also exposes:
 * - Resources (vault://secrets, vault://policies) for listing secrets and policies.
 * - Prompts (generate-policy) for generating policy objects from user input.
 */
class VaultMcpServer {
  private server: McpServer; // MCP server instance to register tools and resources
  private vaultClient: any; // Node-Vault client for interacting with Vault's API
  private config: z.infer<typeof VaultConfigSchema>; // Parsed configuration from environment variables

  /**
   * Constructor for VaultMcpServer
   *
   * Validates the configuration using the VaultConfigSchema and initializes:
   * - The MCP server with metadata (name, version, description)
   * - The Vault client with endpoint and token from the configuration
   *
   * Then, it registers the MCP tools, resources, and prompts.
   *
   * @param vaultAddress - The URL endpoint of the Vault server
   * @param vaultToken - The authentication token for Vault access (must start with "hsv.")
   */
  constructor(vaultAddress: string, vaultToken: string) {
    // Validate and parse the configuration using Zod schema
    try {
      this.config = VaultConfigSchema.parse({
        VAULT_ADDR: vaultAddress,
        VAULT_TOKEN: vaultToken,
        MCP_PORT: process.env.MCP_PORT,
      });
    } catch (error) {
      // If a validation error occurs, print each issue and throw an error
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `- ${issue.path}: ${issue.message}`)
          .join("\n");
        throw new Error(`Invalid Vault configuration:\n${issues}`);
      }
      throw error;
    }

    // Initialize the MCP server with metadata
    this.server = new McpServer({
      name: "vault-mcp",
      version: "1.0.0",
      description: "MCP Server for HashiCorp Vault secret management",
    });

    // Initialize the Vault client using the endpoint and token from the configuration
    this.vaultClient = vault({
      endpoint: this.config.VAULT_ADDR,
      token: this.config.VAULT_TOKEN,
    });

    // Register the available tools, resources, and prompts with the MCP server
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  /**
   * Registers all available MCP tools.
   *
   * Each tool is documented with its usage details below:
   *
   * TOOL: secret/create
   * - Description: Creates or updates a secret in the Vault KV store.
   * - Expected Input: JSON with "path" (string) and "data" (object containing key-value pairs)
   * - Example Call:
   *   {
   *     "path": "env/dev",
   *     "data": {
   *       "NEXT_PUBLIC_API_URL": "http://localhost:3000",
   *       "DB_PASS": "devpass"
   *     }
   *   }
   *
   * TOOL: secret/read
   * - Description: Reads a secret from the Vault KV store at the specified path.
   * - Expected Input: JSON with "path" (string)
   *
   * TOOL: secret/delete
   * - Description: Soft-deletes a secret (versioned delete) at the specified path.
   * - Expected Input: JSON with "path" (string)
   *
   * TOOL: policy/create
   * - Description: Creates a new Vault policy.
   * - Expected Input: JSON with "name" (string) and "policy" (raw policy string)
   *
   * @private
   */
  private registerTools() {
    // Register the tool "secret/create" to write secrets to Vault
    this.server.tool(
      "secret/create",
      {
        path: z.string(), // "path" is a string representing the secret's storage path
        data: z.record(z.any()), // "data" is an object containing the secret key-value pairs
      },
      async ({ path, data }) => {
        // Call Vault's KV v2 write API with the provided path and data
        const result = await this.vaultClient.write(`secret/data/${path}`, {
          data,
        });
        return {
          content: [
            {
              type: "text",
              // Return a response message with the resulting Vault write operation output
              text: `Secret written at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Register the tool "secret/read" to fetch secrets from Vault
    this.server.tool(
      "secret/read",
      {
        path: z.string(), // Expect a "path" string input
      },
      async ({ path }) => {
        // Call Vault's KV v2 read API with the provided path
        const result = await this.vaultClient.read(`secret/data/${path}`);
        return {
          content: [
            {
              type: "text",
              // Return a response message with the resulting Vault read operation output
              text: `Secret read at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Register the tool "secret/delete" to perform a soft-delete of a secret in Vault
    this.server.tool(
      "secret/delete",
      {
        path: z.string(), // Expect a "path" input to identify the secret to delete
      },
      async ({ path }) => {
        // Call Vault's KV v2 delete API for the given secret path
        const result = await this.vaultClient.delete(`secret/data/${path}`);
        return {
          content: [
            {
              type: "text",
              // Return a response confirming deletion and include the Vault output
              text: `Secret deleted at: ${path}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );

    // Register the tool "policy/create" to write a new policy to Vault
    this.server.tool(
      "policy/create",
      {
        name: z.string(), // "name" is a string for the policy's name
        policy: z.string(), // "policy" is a raw string representing the policy configuration
      },
      async ({ name, policy }) => {
        // Use Vault's sys.addPolicy method to add a new policy
        const result = await this.vaultClient.sys.addPolicy({ name, policy });
        return {
          content: [
            {
              type: "text",
              // Return a response indicating that the policy has been created along with details
              text: `Policy '${name}' created.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );
  }

  /**
   * Registers all available MCP resources.
   *
   * Resources allow LLMs to query information about the state of Vault without directly performing actions.
   *
   * RESOURCE: vault://secrets
   * - Description: Lists all top-level secret keys in the KV store.
   * - This queries Vault's metadata endpoint to list available secret paths.
   *
   * RESOURCE: vault://policies
   * - Description: Lists all policies currently configured in Vault.
   *
   * @private
   */
  private registerResources() {
    // Register resource "vault-secrets" to list secret keys from Vault's metadata
    this.server.resource("vault-secrets", "vault://secrets", async () => {
      try {
        // Use Vault's list API to get metadata for secrets
        const result = await this.vaultClient.list("secret/metadata");
        return {
          contents: [
            {
              uri: "vault://secrets",
              // Return the secret keys as a JSON string
              text: JSON.stringify(result.data.keys || []),
            },
          ],
        };
      } catch (err) {
        // In case of error (e.g., no secrets available), return an empty list as JSON
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

    // Register resource "vault-policies" to list current Vault policies
    this.server.resource("vault-policies", "vault://policies", async () => {
      // Retrieve the list of policies using Vault's system method
      const result = await this.vaultClient.sys.listPolicies();
      return {
        contents: [
          {
            uri: "vault://policies",
            // Return the policies as a JSON string
            text: JSON.stringify(result),
          },
        ],
      };
    });
  }

  /**
   * Registers all available MCP prompts.
   *
   * Prompts provide interactive guidance for the LLM to generate configurations.
   *
   * PROMPT: generate-policy
   * - Description: Generates a Vault policy object based on a given path and a comma-separated list of capabilities.
   * - Expected Input: { path: string, capabilities: string }
   * - Output: An MCP-style prompt message containing a JSON representation of the policy.
   *
   * @private
   */
  private registerPrompts() {
    // Register prompt "generate-policy" to create a Vault policy from provided inputs
    this.server.prompt(
      "generate-policy",
      {
        path: z.string(), // The path where the policy applies
        capabilities: z.string(), // Comma-separated capabilities, e.g., "read, list"
      },
      async ({ path, capabilities }) => {
        // Split the capabilities string into an array and trim each value
        const capArray = capabilities.split(",").map((c) => c.trim());

        // Construct a policy object in JSON format
        const policy = {
          path: {
            [path]: {
              capabilities: capArray,
            },
          },
        };

        // Return the policy as an MCP prompt message
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
   * Starts the MCP server using the StdioServerTransport.
   *
   * This method connects the MCP server to standard I/O, so it can communicate with the calling LLM or client.
   *
   * @public
   */
  public async start() {
    // Create an instance of the StdioServerTransport for communication via standard I/O
    const transport = new StdioServerTransport();
    // Connect the MCP server to the transport channel
    await this.server.connect(transport);
    // Log to stderr that the server is running
    console.error("Vault MCP Server running via stdio");
  }
}

export default VaultMcpServer;

/**
 * Usage Example:
 *
 * This example demonstrates how to instantiate and start the VaultMcpServer.
 *
 * Make sure to set the environment variables VAULT_ADDR and VAULT_TOKEN before running.
 *
 * Example:
 *   const server = new VaultMcpServer("http://vault.example.com:8200", "vault-token-here");
 *   await server.start();
 *
 * Tool Usage Examples:
 * - Create a secret:
 *   await tool("secret/create", {
 *     path: "my/secret",
 *     data: { key: "value" }
 *   });
 *
 * - Read a secret:
 *   await tool("secret/read", { path: "my/secret" });
 *
 * - Create a policy:
 *   await tool("policy/create", {
 *     name: "read-only",
 *     policy: 'path "secret/*" { capabilities = ["read", "list"] }'
 *   });
 */

async function main() {
  // Retrieve Vault address and token from environment variables
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;

  // Ensure that the necessary environment variables are provided
  if (!vaultAddr || !vaultToken) {
    console.error(
      "Error: VAULT_ADDR and VAULT_TOKEN environment variables are required"
    );
    process.exit(1);
  }

  try {
    // Instantiate the VaultMcpServer with the provided Vault address and token
    const server = new VaultMcpServer(vaultAddr, vaultToken);
    // Start the MCP server (this will connect using stdio transport)
    await server.start(); // NOTE: This is done to address a bug in Cursor
  } catch (error) {
    // Log any errors that occur during server startup and exit
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run main() only if this module is executed directly
if (import.meta.url === new URL(import.meta.resolve("./index.ts")).href) {
  main();
}
