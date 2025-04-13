# HashiCorp Vault MCP Server

A Model Context Protocol (MCP) server implementation that provides a secure interface to HashiCorp Vault which enables LLMs and other MCP clients to interact with Vault's secret and policy management features.

## Overview

This allows you to prompt an LLM to:

- Secure secret management through structured API
- Policy creation and management
- Resource discovery and listing
- Automated policy generation

## Installation

There are multiple ways to use this server depending on your setup.

### Cursor (recommended)

Add this to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "Vault MCP": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "VAULT_ADDR=https://your-vault-server:8200",
        "-e",
        "VAULT_TOKEN=hvs.your-vault-token",
        "ashgw/vault-mcp"
      ]
    }
  }
}
```

Once added, you can use prompts like:

> "Read the secret at path `apps/myapp/config` from Vault"

Cursor will route that request through the MCP server automatically.

Check if it works, it should be green

---

### Docker (manual)

If you're running Vault MCP manually via Docker:

```bash
docker run -d \
  --name vault-mcp \
  -e VAULT_ADDR=https://your-vault-server:8200 \
  -e VAULT_TOKEN=hvs.your-vault-token \
  -p 3000:3000 \
  ashgw/vault-mcp
```

This uses the pre-built image published at [ashgw/vault-mcp](https://hub.docker.com/repository/docker/ashgw/vault-mcp).

---

### Environment Variables

These are required to run the MCP Vault server:

- `VAULT_ADDR`: Your HashiCorp Vault server address
- `VAULT_TOKEN`: A valid Vault token with read/write permissions
- `MCP_PORT`: Optional. Defaults to 3000. Not required for Cursor.

---

## Features in Detail

### Secret Management Tools

#### `secret/create`

Creates or updates a secret at specified path.

```ts
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

```ts
await tool("secret/read", {
  path: "apps/myapp/config",
});
```

#### `secret/delete`

Soft-deletes a secret (versioned delete in KV v2).

```ts
await tool("secret/delete", {
  path: "apps/myapp/config",
});
```

---

### Policy Management

#### `policy/create`

Creates a new Vault policy with specified permissions.

```ts
await tool("policy/create", {
  name: "app-readonly",
  policy: `
    path "secret/data/apps/myapp/*" {
      capabilities = ["read", "list"]
    }
  `,
});
```

---

### Resources

#### `vault://secrets`

Lists all available secret paths in the KV store.

```json
{
  "keys": ["apps/", "databases/", "certificates/"]
}
```

#### `vault://policies`

Lists all available Vault policies.

```json
{
  "policies": ["default", "app-readonly", "admin"]
}
```

---

### Prompts

#### `generate-policy`

Generates a Vault policy from path and capabilities.

```ts
await prompt("generate-policy", {
  path: "secret/data/apps/*",
  capabilities: "read,list",
});
```

Returns:

```json
{
  "path": {
    "secret/data/apps/*": {
      "capabilities": ["read", "list"]
    }
  }
}
```

---

## License

[MIT](/LICENSE)
