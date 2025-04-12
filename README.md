# HashiCorp Vault MCP Server

A Model Context Protocol (MCP) server implementation that provides a secure interface to HashiCorp Vault, enabling LLMs and other MCP clients to interact with Vault's secret and policy management features.

## Overview

This allows:

- Secure secret management through structured API
- Policy creation and management
- Resource discovery and listing
- Automated policy generation

## Installation

There are many ways to go by this

# Cursor

Add this to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "vault": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "VAULT_ADDR=http://your-vault-server:8200",
        "-e",
        "VAULT_TOKEN=hvs.your-vault-token",
        "-e",
        "MCP_PORT=3000",
        "ashgw/mcp-vault"
      ]
    }
  }
}
```

You can also run the Vault MCP server either locally or using Docker.

### Local Installation

```bash
# Clone the repository
git clone https://github.com/ashgw/vault-mcp
cd vault-mcp

# Make sure you have bun tho
bun install

# Create .env file
cp .env.example .env

# Configure your environment variables
VAULT_ADDR=http://your-vault-server:8200
VAULT_TOKEN=hvs.your-vault-token
MCP_PORT=3000  # Optional, defaults to 3000

# Build and run
npm run build
npm start
```

Then pin point your client to wherever you set the server

### Docker Installation

Build and run locally (after you clone ofc):

```bash
# Build the Docker image
docker build -t vault-mcp .

# Run the container
docker run -d \
  --name vault-mcp \
  -e VAULT_ADDR=http://your-vault-server:8200 \
  -e VAULT_TOKEN=hvs.your-vault-token \
  -e MCP_PORT=3000 \
  -p 3000:3000 \
  vault-mcp
```

Or, you can quickly run the server using the pre-built Docker image:

```bash
docker run -d \
  --name vault-mcp \
  -e VAULT_ADDR=http://your-vault-server:8200 \
  -e VAULT_TOKEN=hvs.your-vault-token \
  -e MCP_PORT=3000 \
  -p 3000:3000 \
  ashgw/vault-mcp:latest
```

### Environment Variables

- `VAULT_ADDR`: Your HashiCorp Vault server address
- `VAULT_TOKEN`: Valid Vault token with appropriate permissions
- `MCP_PORT`: Port for the MCP server (default: 3000)

## Features in Detail

### Secret Management Tools

#### `secret/create`

Creates or updates a secret at specified path.

```typescript
// Example usage
await tool("secret/create", {
  path: "apps/myapp/config",
  data: {
    apiKey: "secret-key-123",
    environment: "production",
  },
});
```

#### `secret/read`

Retrieves a secret from specified path.

```typescript
await tool("secret/read", {
  path: "apps/myapp/config",
});
```

#### `secret/delete`

Soft-deletes a secret (versioned delete in KV v2).

```typescript
await tool("secret/delete", {
  path: "apps/myapp/config",
});
```

### Policy Management

#### `policy/create`

Creates a new Vault policy with specified permissions.

```typescript
await tool("policy/create", {
  name: "app-readonly",
  policy: `
    path "secret/data/apps/myapp/*" {
      capabilities = ["read", "list"]
    }
  `,
});
```

### Resources

#### `vault://secrets`

Lists all available secret paths in the KV store.

```typescript
{
  "keys": [
    "apps/",
    "databases/",
    "certificates/"
  ]
}
```

#### `vault://policies`

Lists all available Vault policies.

```typescript
{
  "policies": [
    "default",
    "app-readonly",
    "admin"
  ]
}
```

### Prompts

#### `generate-policy`

Generates a Vault policy from path and capabilities.

```typescript
await prompt("generate-policy", {
  path: "secret/data/apps/*",
  capabilities: "read,list"
});

{
  "path": {
    "secret/data/apps/*": {
      "capabilities": ["read", "list"]
    }
  }
}
```

## License

[MIT](/LICENSE)
