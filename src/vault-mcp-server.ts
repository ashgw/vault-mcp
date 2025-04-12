import {
  McpServer,
  Tool,
  Resource,
  Prompt,
} from "@modelcontextprotocol/typescript-sdk";
import vault from "node-vault";

class VaultMcpServer {
  private server: McpServer;
  private vaultClient: any; // Will be properly typed with Vault client

  constructor(vaultAddress: string, vaultToken: string) {
    this.server = new McpServer({
      name: "vault-mcp",
      version: "1.0.0",
      description: "MCP Server for HashiCorp Vault secret management",
    });

    // Initialize Vault client
    this.vaultClient = vault({
      endpoint: vaultAddress,
      token: vaultToken,
    });

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  private registerTools() {
    // Secret management tools
    this.server.registerTool(
      new Tool("secret/create", async (params) => {
        const { path, data } = params;
        return await this.vaultClient.write(`secret/data/${path}`, { data });
      })
    );

    this.server.registerTool(
      new Tool("secret/read", async (params) => {
        const { path } = params;
        return await this.vaultClient.read(`secret/data/${path}`);
      })
    );

    this.server.registerTool(
      new Tool("secret/delete", async (params) => {
        const { path } = params;
        return await this.vaultClient.delete(`secret/data/${path}`);
      })
    );

    // Policy management tools
    this.server.registerTool(
      new Tool("policy/create", async (params) => {
        const { name, policy } = params;
        return await this.vaultClient.sys.addPolicy({
          name,
          policy,
        });
      })
    );
  }

  private registerResources() {
    // Register secret paths as resources
    this.server.registerResource(
      new Resource(
        "vault://secrets",
        "secrets",
        "List of secret paths in Vault",
        async () => {
          return await this.vaultClient.list("secret/metadata");
        }
      )
    );

    // Register policies as resources
    this.server.registerResource(
      new Resource(
        "vault://policies",
        "policies",
        "List of Vault policies",
        async () => {
          return await this.vaultClient.sys.policies();
        }
      )
    );
  }

  private registerPrompts() {
    // Register common secret management prompts
    this.server.registerPrompt(
      new Prompt(
        "generate-policy",
        "Generate a Vault policy for specific path and capabilities",
        async (params) => {
          const { path, capabilities } = params;
          return {
            path: {
              [path]: {
                capabilities: capabilities,
              },
            },
          };
        }
      )
    );
  }

  public async start(port: number = 3000) {
    await this.server.start(port);
    console.log(`Vault MCP Server running on port ${port}`);
  }
}

export default VaultMcpServer;
