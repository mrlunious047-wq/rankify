/**
 * Rankify Matchmaking Server v2
 * Handles: queue, match, forfeit notification
 */
const WebSocket = require("ws");
const PORT = process.env.PORT || 8080;
const wss  = new WebSocket.Server({ port: PORT });

// queue[mode][server] = [ { ws, ign } ]
const queue   = {};
// active matches: ign → opponent ws
const matches = {};

console.log(`[Rankify] Server started on port ${PORT}`);

wss.on("connection", (ws, req) => {
    const url    = new URL(req.url, "http://localhost");
    const ign    = url.searchParams.get("ign")    || "Unknown";
    const mode   = url.searchParams.get("mode")   || "Unknown";
    const server = url.searchParams.get("server") || "Unknown";

    ws.ign = ign;
    console.log(`[+] ${ign} queued | ${mode} | ${server}`);

    if (!queue[mode])         queue[mode]         = {};
    if (!queue[mode][server]) queue[mode][server] = [];

    queue[mode][server].push({ ws, ign });
    safeSend(ws, "waiting");

    if (queue[mode][server].length >= 2) {
        const p1 = queue[mode][server].shift();
        const p2 = queue[mode][server].shift();
        console.log(`[⚔] Match: ${p1.ign} vs ${p2.ign} | ${mode} | ${server}`);

        // Store active match so forfeit can notify opponent
        matches[p1.ign] = p2.ws;
        matches[p2.ign] = p1.ws;

        safeSend(p1.ws, `matched:${p2.ign}:initiator`);
        safeSend(p2.ws, `matched:${p1.ign}:acceptor`);
    }

    // Handle messages from client (forfeit)
    ws.on("message", (data) => {
        const msg = data.toString();
        console.log(`[MSG] ${ign}: ${msg}`);

        // forfeit:<opponentIGN>
        if (msg.startsWith("forfeit:")) {
            const oppIgn = msg.split(":")[1];
            const oppWs  = matches[ign];
            if (oppWs) {
                safeSend(oppWs, "opponent_forfeited");
                console.log(`[✗] ${ign} forfeited vs ${oppIgn}`);
            }
            // Clean up match
            delete matches[ign];
            delete matches[oppIgn];
        }
    });

    ws.on("close", () => {
        console.log(`[-] ${ign} disconnected`);
        // Remove from queue
        if (queue[mode]?.[server]) {
            queue[mode][server] = queue[mode][server].filter(p => p.ws !== ws);
        }
        // If in active match, notify opponent
        const oppWs = matches[ign];
        if (oppWs) {
            safeSend(oppWs, "opponent_forfeited");
            delete matches[ign];
        }
    });

    ws.on("error", err => console.error(`[!] ${ign}: ${err.message}`));
});

// Keep alive ping every 30s
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
}, 30000);

function safeSend(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(message);
}
