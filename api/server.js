const ADDRESS = "51.75.44.14:2219";

export default async function handler(_request, response) {
  const updatedAt = new Date().toISOString();
  const send = (data, cache) => {
    response.setHeader("Cache-Control", cache);
    response.status(200).json(data);
  };

  try {
    const custom = process.env.MONITOR_API_URL;
    if (custom) {
      const result = await fetch(custom, { signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw new Error("Monitor unavailable");
      const data = await result.json();
      if (
        data.status !== "online" || data.address !== ADDRESS ||
        !Number.isInteger(data.players) || !Number.isInteger(data.maxPlayers) ||
        data.players < 0 || data.maxPlayers < 1 || data.players > data.maxPlayers
      ) throw new Error("No verified status");
      return send(
        { ...data, source: "direct-query", updatedAt: data.updatedAt ?? updatedAt },
        "public, max-age=30, s-maxage=30",
      );
    }

    const result = await fetch("https://api.open.mp/servers", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!result.ok) throw new Error("Monitoring provider unavailable");
    const servers = await result.json();
    if (!Array.isArray(servers)) throw new Error("Invalid provider response");
    const server = servers.find((item) => item?.ip === ADDRESS);
    if (!server || !Number.isInteger(server.pc) || !Number.isInteger(server.pm) || server.pc < 0 || server.pm <= 0) {
      throw new Error("Server not indexed");
    }
    return send(
      { status: "online", address: ADDRESS, name: server.hn, players: server.pc, maxPlayers: server.pm, source: "open.mp", updatedAt },
      "public, max-age=30, s-maxage=60",
    );
  } catch {
    return send(
      { status: "unavailable", address: ADDRESS, source: "open.mp", updatedAt },
      "public, max-age=15, s-maxage=30",
    );
  }
}
