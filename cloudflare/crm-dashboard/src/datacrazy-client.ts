// Cliente MCP do Data Crazy CRM (mcp.g1.datacrazy.io) — ver skill datacrazy-mcp
// (~/.claude/skills/datacrazy-mcp/SKILL.md) pra pegadinhas de schema/parâmetros.

const ENDPOINT = "https://mcp.g1.datacrazy.io/api/mcp";

export class DataCrazyError extends Error {}

export class DataCrazyClient {
  constructor(private token: string) {}

  async call(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });
    if (!res.ok) {
      throw new DataCrazyError(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    if (data.error) {
      throw new DataCrazyError(JSON.stringify(data.error));
    }
    const content = data.result?.content?.[0]?.text;
    if (data.result?.isError) {
      throw new DataCrazyError(content ?? "erro desconhecido");
    }
    return JSON.parse(content ?? "null");
  }

  /** business_list_by_attendant pagina em skip/limit — busca tudo. */
  async listBusinessesByAttendant(userId: string): Promise<any[]> {
    const all: any[] = [];
    let skip = 0;
    const limit = 100;
    for (;;) {
      const res = await this.call("business_list_by_attendant", { userId, skip, limit });
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < limit) break;
      skip += limit;
    }
    return all;
  }

  /** conversation_list pagina em skip/limit. */
  async listConversations(args: Record<string, unknown> = {}): Promise<any[]> {
    const all: any[] = [];
    let skip = 0;
    const limit = 100;
    for (;;) {
      const res = await this.call("conversation_list", { ...args, skip, limit, status: "all" });
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < limit) break;
      skip += limit;
    }
    return all;
  }

  async listMessages(conversationId: string, limit = 200): Promise<any[]> {
    const res = await this.call("conversation_messages_list", { id: conversationId, limit });
    return Array.isArray(res) ? res : [];
  }

  async updateLeadAttendant(leadId: string, userId: string): Promise<void> {
    await this.call("lead_update_attendant", { id: leadId, userId });
  }
}
