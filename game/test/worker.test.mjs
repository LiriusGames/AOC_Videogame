import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function socketMessage(socket, wanted) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${wanted}`)), 3000);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type !== wanted) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

async function createRoom() {
  const response = await SELF.fetch("https://example.test/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ hostName: "Ada", guestName: "Grace" }),
  });
  expect(response.status).toBe(201);
  return response.json();
}

async function connect(roomId, ticket) {
  const response = await SELF.fetch(`https://example.test/api/rooms/${roomId}/socket`, {
    headers: { upgrade: "websocket", "sec-websocket-protocol": `aoc-v1, ticket.${ticket}` },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  socket.accept();
  return socket;
}

describe("private GameRoom", () => {
  it("creates an unlisted room and rejects the wrong seat secret", async () => {
    const room = await createRoom();
    expect(room.roomId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(room.inviteUrl).toContain(`room=${room.roomId}`);
    const rejected = await SELF.fetch(`https://example.test/api/rooms/${room.roomId}/join?ticket=not-a-ticket-at-all-000000`);
    expect(rejected.status).toBe(401);
  });

  it("persists a command and restores a redacted, revisioned view on reconnect", async () => {
    const room = await createRoom();
    const guestTicket = new URL(room.inviteUrl).searchParams.get("ticket");
    const host = await connect(room.roomId, room.ticket);
    const first = await socketMessage(host, "snapshot");
    expect(first.revision).toBe(0);
    expect(first.seatId).toBe(0);
    expect(first.view.decks.comics.every((card) => card === null)).toBe(true);
    expect(first.view.players[1].hand.every((card) => card === null)).toBe(true);

    host.send(JSON.stringify({
      type: "command", v: 1, commandId: "founding-host-1", expectedRevision: 0,
      kind: "starting_picks", payload: { genre: "crime", ideas: ["crime", "crime"] },
    }));
    const accepted = await socketMessage(host, "accepted");
    expect(accepted.revision).toBe(1);
    await socketMessage(host, "snapshot");
    host.close();

    const rejoined = await connect(room.roomId, room.ticket);
    const restored = await socketMessage(rejoined, "snapshot");
    expect(restored.revision).toBe(1);
    expect(restored.view.players[0].startingPicks).toBeUndefined();

    const guest = await connect(room.roomId, guestTicket);
    const guestView = await socketMessage(guest, "snapshot");
    expect(guestView.seatId).toBe(1);
    expect(guestView.view.players[0].hand.every((card) => card === null)).toBe(true);
    rejoined.close();
    guest.close();
  });
});
