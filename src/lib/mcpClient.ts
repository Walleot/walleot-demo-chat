import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ElicitRequest, ElicitRequestSchema, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";


export async function getMcpClient({elicitationHandler}:{elicitationHandler:(req:ElicitRequest)=>Promise<ElicitResult>}): Promise<Client> {

    const url = process.env.MCP_TOOL_URL!;
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const mcpClient = new Client({
        name: "next-proxy",
        version: "0.0.1"
    },{ capabilities: { elicitation: {} } });

    try {
        await mcpClient.connect(transport, {});


        mcpClient.setRequestHandler(ElicitRequestSchema, elicitationHandler);



        return mcpClient;
    } catch (err) {
        console.log("Error connecting to MCP", err, url);
        throw err;
    }
}