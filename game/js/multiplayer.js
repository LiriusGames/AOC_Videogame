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
    const random = new Uint32Array(8);
    crypto.getRandomValues(random);
    let s = "";
    for (let i = 0; i < random.length; i++) s += A[random[i] % A.length];
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
    const roomBtn = document.getElementById("btn-room");
    if (roomBtn) roomBtn.hidden = true;
    try { history.replaceState(null, "", location.pathname); } catch (_e) {}
    closeModal();
  }

  function wire(s) {
    s.addEventListener("lobby", () => { cfgSync(s); renderLobby(s); renderRoomStatus(s); updateRoomButton(s); });
    s.addEventListener("start", () => {
      closeModal();
      Main.enterRemote(s);
      updateRoomButton(s);
      toast(s.seat >= 0 ? "The newsroom opens &mdash; good luck, publisher." : "The table is already playing &mdash; you are watching.");
    });
    s.addEventListener("applied", (ev) => {
      if (ev.detail.kind === "seat" && ev.detail.seat === s.formerSeat)
        toast("Your desk is automated. Open ROOM when you are ready to resume it.");
      if (ev.detail.kind === "claim" && ev.detail.seat === s.seat)
        toast("Your desk is yours again.");
      Main.remoteUpdated(s);
      renderRoomStatus(s);
      updateRoomButton(s);
    });
    s.addEventListener("status", (ev) => {
      if (!s.engine) return;
      if (ev.detail === "disconnected") toast("Connection lost &mdash; rejoining the table&hellip;");
      else if (ev.detail === "synced") toast("Back at the table.");
      updateRoomButton(s);
      renderRoomStatus(s);
    });
    s.addEventListener("desync", () => {
      toast("&#9888; Out of sync with the table &mdash; reload the page to rejoin this room.");
    });
    s.addEventListener("roomerror", (ev) => {
      const code = ev.detail;
      if (code === "TABLE_LOCKED") return blockingConnectionModal(
        "TABLE LOCKED", "This newsroom is no longer accepting new participants.", "BACK TO TITLE", leave);
      if (code === "ROOM_FULL") return blockingConnectionModal(
        "NEWSROOM FULL", "This room has reached its participant limit.", "BACK TO TITLE", leave);
      if (code === "REMOVED") return blockingConnectionModal(
        "REMOVED FROM TABLE", "The host removed this participant from the newsroom.", "LEAVE TABLE", leave);
      if (code === "BAD_CREDENTIAL") return blockingConnectionModal(
        "RESUME PASS EXPIRED", "This browser's private resume pass no longer belongs to this room.",
        "JOIN AS NEW", () => { try { localStorage.removeItem("aoc-net"); } catch (_e) {} location.reload(); });
      toast("The room rejected that message. Reopen ROOM or reload before trying again.");
      renderRoomStatus(s);
    });
    s.addEventListener("replaced", () => blockingConnectionModal(
      "DESK OPENED ELSEWHERE",
      "This player desk was opened in another tab or browser. That newer connection now controls it."
    ));
    s.addEventListener("versionerror", (ev) => blockingConnectionModal(
      "NEWSROOM UPDATED",
      `This tab runs ${esc(ev.detail.local)} but the table runs ${esc(ev.detail.remote)}. Reload before rejoining.`
    ));
  }

  function blockingConnectionModal(title, message, label = "RELOAD", fn = () => location.reload()) {
    openModal((m) => {
      m.appendChild(el("h2", "", title));
      m.appendChild(el("div", "modal-sub", message));
      modalButtons(m, [{ label, cls: "btn-go", fn }]);
    }, { width: "520px", onDismiss: () => {} });
  }

  function updateRoomButton(s) {
    const btn = document.getElementById("btn-room");
    if (!btn || !s.engine) return;
    btn.hidden = false;
    const offline = (s.roster && s.roster.players || []).filter((p) => !p.on && s.pids.includes(p.pid)).length;
    btn.textContent = offline ? `ROOM !${offline}` : "ROOM";
    btn.classList.toggle("mp-alert", offline > 0 || s.seat < 0);
    btn.onclick = () => { SFX.play("paper"); roomStatusModal(s); };
  }

  function appendInviteRow(body, s) {
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
  }

  function appendHostRoomControls(body, s) {
    if (!s.isHost || !s.roster) return;
    const row = el("div", "mp-invite");
    const locked = !!s.roster.locked;
    row.appendChild(el("div", "modal-sub", locked
      ? "TABLE LOCKED &mdash; known participants may reconnect; new visitors are refused."
      : "TABLE OPEN &mdash; anyone with the invitation may enter."));
    const toggle = el("button", "btn btn-small" + (locked ? " btn-go" : ""), locked ? "UNLOCK TABLE" : "LOCK TABLE");
    toggle.onclick = () => { toggle.disabled = true; s.setLocked(!locked); };
    row.appendChild(toggle);
    body.appendChild(row);
  }

  function removeButton(s, pid) {
    const button = el("button", "btn btn-small", "REMOVE");
    let armed = false;
    button.onclick = () => {
      if (!armed) {
        armed = true;
        button.textContent = "CONFIRM REMOVE";
        setTimeout(() => { if (button.isConnected) { armed = false; button.textContent = "REMOVE"; } }, 3000);
        return;
      }
      button.disabled = true;
      s.removeParticipant(pid);
    };
    return button;
  }

  function appendOtherParticipants(body, s, seatedPids) {
    const others = ((s.roster && s.roster.players) || []).filter((p) => !seatedPids.has(p.pid));
    if (!others.length) return;
    const list = el("div", "mp-seats");
    list.appendChild(el("div", "modal-sub", "OTHER VISITORS"));
    for (const visitor of others) {
      const row = el("div", "mp-seat");
      row.appendChild(el("span", "mp-seat-name " + (visitor.on ? "on" : "off"),
        `${esc(visitor.name)} &middot; ${visitor.on ? "watching" : "disconnected"}`));
      if (s.isHost && visitor.pid !== s.pid) row.appendChild(removeButton(s, visitor.pid));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderRoomStatus(s) {
    const body = document.querySelector("#modal-root .mp-room-live");
    if (!body || !s.engine) return;
    body.innerHTML = "";
    appendInviteRow(body, s);
    body.appendChild(el("div", "mp-trust-note",
      "TRUSTED TABLE &mdash; every player runs the full game locally. Share this link only with people you trust."));
    appendHostRoomControls(body, s);

    const online = {};
    ((s.roster && s.roster.players) || []).forEach((p) => { online[p.pid] = p.on; });
    const list = el("div", "mp-seats");
    s.seats.forEach((ctl, i) => {
      const row = el("div", "mp-seat");
      row.appendChild(el("span", "mp-seat-dot", sprHTML("idea_" + GENRES[i % GENRES.length], 0.45)));
      const player = s.engine.player(i);
      const pid = s.pids[i];
      const isMine = s.isLocalSeat(i);
      const connected = ctl === "human" && !!online[pid];
      let label = `${esc(player.pubName)} &middot; `;
      if (ctl === "bot") label += "automated";
      else label += (isMine ? "you &middot; " : esc(player.name) + " &middot; ") + (connected ? "online" : "disconnected");
      row.appendChild(el("span", "mp-seat-name " + (ctl === "bot" ? "bot" : connected ? "on" : "off"), label));

      if (ctl === "human" && !connected && s.isHost) {
        const hand = el("button", "btn btn-small", "HAND TO BOT");
        hand.onclick = () => { hand.disabled = true; s.replaceWithBot(i); };
        row.appendChild(hand);
      } else if (ctl === "bot" && s.seat < 0) {
        const ownDesk = s.formerSeat === i || pid === s.pid;
        const claim = el("button", "btn btn-small btn-go", ownDesk ? "RESUME MY DESK" : "TAKE THIS DESK");
        claim.onclick = () => { claim.disabled = true; s.claimSeat(i); };
        row.appendChild(claim);
      }
      if (s.isHost && pid && pid !== s.pid) row.appendChild(removeButton(s, pid));
      list.appendChild(row);
    });
    body.appendChild(list);
    appendOtherParticipants(body, s, new Set(s.pids.filter(Boolean)));
    body.appendChild(el("div", "modal-sub", s.isHost
      ? "As host, you can hand a disconnected desk to a bot. The player can reclaim it later from this panel."
      : "Disconnected desks stay reserved until the host hands them to a bot."));
  }

  function roomStatusModal(s) {
    openModal((m) => {
      m.appendChild(el("h2", "", "PRIVATE TABLE &mdash; " + s.room));
      m.appendChild(el("div", "mp-room-live"));
      // openModal appends the built panel after this callback returns.
      queueMicrotask(() => renderRoomStatus(s));
      modalButtons(m, [{ label: "BACK TO NEWSROOM", fn: () => closeModal() }]);
    }, { width: "660px", onDismiss: () => {} });
  }

  // ---- host-managed seat plan (broadcast as cfg): arriving friends fill
  // open seats in join order; the host can turn any seat into a bot ----
  function cfgSync(s) {
    if (!s.isHost || s.engine || !s.roster) return;
    const players = (s.roster.players || []).filter((p) => p.on);
    const before = s.cfg && s.cfg.seats ? JSON.stringify(s.cfg) : "";
    const cfg = s.cfg && s.cfg.seats ? structuredClone(s.cfg) : { n: 3, seats: [] };
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
    s.cfg = cfg;
    if (JSON.stringify(cfg) !== before) s.sendCfg(cfg);
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
    const players = [], seats = [], pids = [];
    cfg.seats.forEach((seat, i) => {
      const color = PLAYER_COLORS[i];
      if (seat.kind === "human") {
        players.push({ color, human: true, name: nameOf[seat.pid] || "Publisher" });
        seats.push("human"); pids.push(seat.pid);
      } else {
        players.push({ color, human: false, name: PUBLISHERS[color].boss });
        seats.push("bot"); pids.push(null);
      }
    });
    s.sendHello({
      build: AOC_BUILD_ID,
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
    appendInviteRow(body, s);
    appendHostRoomControls(body, s);
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
      rowEl.appendChild(el("span", "mp-seat-dot", sprHTML("idea_" + GENRES[i % GENRES.length], 0.45)));
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
      if (s.isHost && seat.kind === "human" && seat.pid !== s.pid) rowEl.appendChild(removeButton(s, seat.pid));
      list.appendChild(rowEl);
    });
    body.appendChild(list);
    appendOtherParticipants(body, s, new Set(seats.filter((x) => x.kind === "human").map((x) => x.pid)));

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
