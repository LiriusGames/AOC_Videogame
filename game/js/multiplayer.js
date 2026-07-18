// ============================================================================
// AGE OF COMICS — private tables: host-a-table lobby over the room relay.
// Share ?room=CODE; friends click it, type a name, and sit down. The host
// seats the table (2-4 publishers, bots fill empty desks) and opens the
// newsroom; every client then runs the identical lockstep engine.
// ============================================================================
"use strict";

const Multiplayer = (() => {
  let session = null;

  function roomCode() {
    const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0];
    return s;
  }
  function roomLink(room) { return location.origin + location.pathname + "?room=" + room; }

  function namePrompt(title, then) {
    let saved = "";
    try { saved = (JSON.parse(localStorage.getItem("aoc-net") || "null") || {}).name || ""; } catch (_e) {}
    openModal((m) => {
      m.appendChild(el("h2", "", title));
      m.appendChild(el("div", "modal-sub", "The name the other publishers will see at the table."));
      const wrap = el("label", "mp-field");
      wrap.appendChild(el("span", "", "YOUR NAME"));
      const inp = document.createElement("input");
      inp.id = "mp-name";
      inp.maxLength = 24;
      inp.value = saved;
      inp.autocomplete = "nickname";
      wrap.appendChild(inp);
      m.appendChild(wrap);
      modalButtons(m, [
        { label: "CANCEL", fn: () => closeModal() },
        { label: "SIT DOWN", cls: "btn-go", id: "mp-name-ok", fn: () => {
            const name = (inp.value || "").trim().slice(0, 24) || "Publisher";
            closeModal();
            then(name);
          } },
      ]);
      setTimeout(() => { try { inp.focus(); inp.select(); } catch (_e) {} }, 50);
    }, { width: "480px", onDismiss: () => {} });
  }

  function open(room) {
    namePrompt(room ? "JOIN THE TABLE " + room : "HOST A TABLE", (name) => {
      if (session) session.close();
      session = new RemoteSession({ room: room || roomCode(), name });
      try { history.replaceState(null, "", "?room=" + session.room); } catch (_e) {}
      wire(session);
      session.connect();
      lobbyModal(session);
    });
  }

  function leave() {
    if (session) { session.close(); session = null; }
    try { history.replaceState(null, "", location.pathname); } catch (_e) {}
    closeModal();
  }

  function wire(s) {
    s.addEventListener("lobby", () => { cfgSync(s); renderLobby(s); });
    s.addEventListener("start", () => {
      closeModal();
      Main.enterRemote(s);
      toast(s.seat >= 0 ? "The newsroom opens &mdash; good luck, publisher." : "The table is already playing &mdash; you are watching.");
    });
    s.addEventListener("applied", (ev) => {
      if (ev.detail.kind === "seat" && ev.detail.seat === s.seat)
        toast("You were away &mdash; an automated publisher runs your desk. Reload the link to reclaim it.");
      Main.remoteUpdated(s);
    });
    s.addEventListener("status", (ev) => {
      if (!s.engine) return;
      if (ev.detail === "disconnected") toast("Connection lost &mdash; rejoining the table&hellip;");
      else toast("Back at the table.");
    });
    s.addEventListener("desync", () => {
      toast("&#9888; Out of sync with the table &mdash; reload the page to rejoin this room.");
    });
  }

  // ---- host-managed seat plan (broadcast as cfg): arriving friends fill
  // open seats in join order; the host can turn any seat into a bot ----
  function cfgSync(s) {
    if (!s.isHost || s.engine || !s.roster) return;
    const players = (s.roster.players || []).filter((p) => p.on);
    const cfg = s.cfg && s.cfg.seats ? s.cfg : { n: 3, seats: [] };
    cfg.n = Math.max(2, Math.min(4, cfg.n || 3));
    while (cfg.seats.length < cfg.n) cfg.seats.push({ kind: "open" });
    cfg.seats.length = cfg.n;
    const on = {};
    players.forEach((p) => { on[p.pid] = true; });
    for (const seat of cfg.seats) if (seat.kind === "human" && !on[seat.pid]) { seat.kind = "open"; delete seat.pid; }
    const seated = new Set(cfg.seats.filter((x) => x.kind === "human").map((x) => x.pid));
    for (const p of players) {
      if (seated.has(p.pid)) continue;
      const openSeat = cfg.seats.find((x) => x.kind === "open");
      if (openSeat) { openSeat.kind = "human"; openSeat.pid = p.pid; seated.add(p.pid); }
    }
    s.sendCfg(cfg);
  }
  function cycleSeat(s, i) {
    const seat = s.cfg && s.cfg.seats[i];
    if (!seat) return;
    if (seat.kind === "human") { seat.kind = "bot"; delete seat.pid; }
    else if (seat.kind === "bot") seat.kind = "open";
    else seat.kind = "bot";
    s.sendCfg(s.cfg);
    cfgSync(s);
    renderLobby(s);
  }
  function setSize(s, n) {
    s.cfg = s.cfg && s.cfg.seats ? s.cfg : { n: 3, seats: [] };
    s.cfg.n = n;
    if (s.cfg.seats.length > n) s.cfg.seats.length = n; // freed humans re-seat via sync
    cfgSync(s);
    renderLobby(s);
  }
  function openTheInn(s) {
    const cfg = s.cfg;
    if (!s.isHost || !cfg || cfg.seats.some((x) => x.kind === "open")) return;
    const nameOf = {};
    ((s.roster && s.roster.players) || []).forEach((p) => { nameOf[p.pid] = p.name; });
    let bots = 0;
    const players = [], seats = [], pids = [];
    cfg.seats.forEach((seat, i) => {
      const color = PLAYER_COLORS[i];
      if (seat.kind === "human") {
        players.push({ color, human: true, name: nameOf[seat.pid] || "Publisher" });
        seats.push("human"); pids.push(seat.pid);
      } else {
        players.push({ color, human: false, name: PUBLISHERS[color].boss + (bots++ ? "" : "") });
        seats.push("bot"); pids.push(null);
      }
    });
    s.sendHello({
      seed: (Math.random() * 0x7fffffff) | 0,
      players, seats, pids,
      useRipoffs: true,
      difficulty: "normal",
    });
  }

  function renderLobby(s) {
    const body = document.querySelector("#modal-root .mp-lobby");
    if (!body) return;
    body.innerHTML = "";
    const link = roomLink(s.room);
    const row = el("div", "mp-invite");
    const inp = document.createElement("input");
    inp.readOnly = true;
    inp.value = link;
    inp.setAttribute("aria-label", "Table invitation link");
    const copy = el("button", "btn btn-small", "COPY LINK");
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = "COPIED"; }
      catch (_e) { inp.select(); document.execCommand("copy"); copy.textContent = "COPIED"; }
    };
    row.append(inp, copy);
    body.appendChild(row);
    body.appendChild(el("div", "modal-sub", "Send the link on WhatsApp &mdash; whoever opens it sits down at this table."));

    if (s.isHost) {
      const sizes = el("div", "choice-group mp-sizes");
      [2, 3, 4].forEach((n) => {
        const b = el("button", "choice" + ((s.cfg && s.cfg.n === n) ? " active" : ""), n + " SEATS");
        b.onclick = () => { SFX.play("click"); setSize(s, n); };
        sizes.appendChild(b);
      });
      body.appendChild(sizes);
    } else body.appendChild(el("div", "modal-sub", "The host is seating the table."));

    const nameOf = {};
    ((s.roster && s.roster.players) || []).forEach((p) => { nameOf[p.pid] = p; });
    const seats = (s.cfg && s.cfg.seats) || [];
    const list = el("div", "mp-seats");
    seats.forEach((seat, i) => {
      const rowEl = el("div", "mp-seat");
      rowEl.appendChild(el("span", "mp-seat-dot", sprHTML("idea_" + GENRES[i % GENRES.length], 0)));
      let label, cls = "";
      if (seat.kind === "human") {
        const inf = nameOf[seat.pid];
        label = (inf ? esc(inf.name) : "?") + (seat.pid === s.pid ? " (you)" : "") +
          (s.roster && s.roster.host === seat.pid ? " &middot; host" : "");
        cls = inf && inf.on ? "on" : "off";
      } else if (seat.kind === "bot") { label = PUBLISHERS[PLAYER_COLORS[i]].boss + " &middot; automated"; cls = "bot"; }
      else { label = "Waiting for a publisher&hellip;"; cls = "open"; }
      rowEl.appendChild(el("span", "mp-seat-name " + cls, label));
      if (s.isHost) {
        const b = el("button", "btn btn-small", seat.kind === "human" ? "&rarr; BOT" : seat.kind === "bot" ? "&rarr; EMPTY" : "+ BOT");
        b.onclick = () => { SFX.play("click"); cycleSeat(s, i); };
        rowEl.appendChild(b);
      }
      list.appendChild(rowEl);
    });
    body.appendChild(list);

    const foot = el("div", "mp-foot");
    if (s.isHost) {
      const ready = seats.length && !seats.some((x) => x.kind === "open");
      const go = el("button", "btn btn-go", "OPEN THE NEWSROOM");
      go.disabled = !ready;
      go.onclick = () => { SFX.play("click"); openTheInn(s); };
      foot.appendChild(go);
      foot.appendChild(el("div", "modal-sub", ready
        ? "Latecomers can still take over an automated desk mid-game."
        : "Every seat needs a publisher or a bot before the presses roll."));
    } else foot.appendChild(el("div", "modal-sub", "The host opens the newsroom when the table is full."));
    const bye = el("button", "btn btn-small", "LEAVE");
    bye.onclick = leave;
    foot.appendChild(bye);
    body.appendChild(foot);
  }

  function lobbyModal(s) {
    openModal((m) => {
      m.appendChild(el("h2", "", "A PRIVATE TABLE &mdash; " + s.room));
      m.appendChild(el("div", "mp-lobby"));
      renderLobby(s);
    }, { width: "620px", onDismiss: () => {} });
  }

  function init() {
    const btn = document.getElementById("btn-private-room");
    if (btn) btn.onclick = () => { SFX.unlock(); SFX.play("click"); SFX.startMusic(); open(null); };
    const room = (location.search.match(/[?&]room=([A-Za-z0-9]{4,8})/) || [])[1];
    if (room) open(room.toUpperCase());
  }

  return { init, open, get session() { return session; } };
})();
