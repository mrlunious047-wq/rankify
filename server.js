/**
 * Rankify Matchmaking Server
 * ──────────────────────────
 * Pairs two players who queue for the same gamemode + server.
 *
 * Deploy on Railway:
 *   1. Upload this file + package.json to GitHub
 *   2. Connect repo to Railway
 *   3. Done — Railway auto runs: node server.js
 */

const WebSocket = require("ws");

// Railway provides PORT automatically — falls back to 8080 for local testing
const PORT = process.env.PORT || 8080;
const wss  = new WebSocket.Server({ port: PORT });

// queue[mode][server] = [ { ws, ign } ]
const queue = {};

console.log(`[Rankify] Matchmaking server started on port ${PORT}`);

wss.on("connection", (ws, req) => {
    const url    = new URL(req.url, `http://localhost`);
    const ign    = url.searchParams.get("ign")    || "Unknown";
    const mode   = url.searchParams.get("mode")   || "Unknown";
    const server = url.searchParams.get("server") || "Unknown";

    console.log(`[+] ${ign} queued | ${mode} | ${server}`);

    if (!queue[mode])         queue[mode]         = {};
    if (!queue[mode][server]) queue[mode][server] = [];

    const player = { ws, ign };
    queue[mode][server].push(player);

    safeSend(ws, "waiting");

    if (queue[mode][server].length >= 2) {
        const p1 = queue[mode][server].shift();
        const p2 = queue[mode][server].shift();

        console.log(`[⚔] Match: ${p1.ign} vs ${p2.ign} | ${mode} | ${server}`);

        // p1 = initiator (sends /duel)
        // p2 = acceptor  (sends /duel accept)
        safeSend(p1.ws, `matched:${p2.ign}:initiator`);
        safeSend(p2.ws, `matched:${p1.ign}:acceptor`);
    }

    ws.on("close", () => {
        console.log(`[-] ${ign} disconnected`);
        if (queue[mode]?.[server]) {
            queue[mode][server] = queue[mode][server].filter(p => p.ws !== ws);
        }
    });

    ws.on("error", err => {
        console.error(`[!] Error for ${ign}: ${err.message}`);
    });
});

// Keep alive ping every 30s so Railway doesn't kill the connection
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
}, 30000);

function safeSend(ws, message) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
}
