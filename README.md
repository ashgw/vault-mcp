# HashiCorp Vault MCP Server

This is a Model Context Protocol (MCP) server that provides an interface to HashiCorp Vault for secret management. It makes it easier to interact with Vault through MCP-compatible clients.

## Features

- Secret Management
  - Create, read, and delete secrets
  - List secret paths
- Policy Management
  - Create and manage Vault policies
  - List existing policies
- Prompts for common operations
  - Generate policy definitions
  - Secret rotation workflows

## Prerequisites

- Node.js 16 or higher
- A running HashiCorp Vault instance
- Vault token with appropriate permissions

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `VAULT_ADDR`: The address of your Vault server (default: http://localhost:8200)
- `VAULT_TOKEN`: Your Vault authentication token

You can create a `.env` file in the root directory:

```env
VAULT_ADDR=http://your-vault-server:8200
VAULT_TOKEN=your-vault-token
```

## Usage

1. Build the project:

```bash
npm run build
```

2. Start the server:

```bash
npm start
```

The MCP server will start on port 3000 by default.

## Available Tools

### Secret Management

- `secret/create`: Create a new secret

  ```typescript
  params: {
    path: string;
    data: Record<string, any>;
  }
  ```

- `secret/read`: Read a secret

  ```typescript
  params: {
    path: string;
  }
  ```

- `secret/delete`: Delete a secret
  ```typescript
  params: {
    path: string;
  }
  ```

### Policy Management

- `policy/create`: Create a new policy
  ```typescript
  params: {
    name: string;
    policy: string;
  }
  ```

## Available Resources

- `vault://secrets`: List of secret paths in Vault
- `vault://policies`: List of Vault policies

## Available Prompts

- `generate-policy`: Generate a Vault policy for specific path and capabilities
  ```typescript
  params: {
    path: string;
    capabilities: string[];
  }
  ```

## License

MIT
