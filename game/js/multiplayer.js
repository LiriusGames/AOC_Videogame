// ============================================================================
// AGE OF COMICS — private-room lobby and browser connection bootstrap
// ============================================================================
"use strict";

const Multiplayer = (() => {
  let active = null;

  function input(label, id, value) {
    const wrap = el("label", "mp-field");
    wrap.appendChild(el("span", "", label));
    const control = document.createElement("input");
    control.id = id;
    control.value = value;
    control.maxLength = 32;
    control.autocomplete = "nickname";
    wrap.appendChild(control);
    return wrap;
  }

  function openCreate() {
    openModal((m) => {
      m.appendChild(el("h2", "", "OPEN A PRIVATE NEWSROOM"));
      m.appendChild(el("div", "modal-sub",
        "Create a two-player room, then send its secret seat link directly to a friend. The room is not listed or searchable."));
      const form = el("div", "mp-form");
      form.appendChild(input("YOUR DISPLAY NAME", "mp-host-name", "Host"));
      form.appendChild(input("GUEST DISPLAY NAME", "mp-guest-name", "Guest"));
      m.appendChild(form);
      const status = el("div", "modal-sub mp-status", "");
      m.appendChild(status);
      modalButtons(m, [
        { label: "CANCEL", fn: closeModal },
        { label: "CREATE PRIVATE ROOM", cls: "btn-go", id: "mp-create", fn: async () => {
          const button = m.querySelector("#mp-create");
          button.disabled = true;
          status.textContent = "Opening the newsroom…";
          try {
            const response = await fetch("api/rooms", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                hostName: m.querySelector("#mp-host-name").value,
                guestName: m.querySelector("#mp-guest-name").value,
                hostColor: "teal",
                guestColor: "yellow",
                useRipoffs: true,
              }),
            });
            const room = await response.json();
            if (!response.ok) throw new Error(room.error || "Room creation failed");
            showInvite(m, room);
          } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
          }
        } },
      ]);
    }, { width: "660px" });
  }

  function showInvite(modal, room) {
    modal.innerHTML = "";
    modal.appendChild(el("h2", "", "PRIVATE ROOM READY"));
    modal.appendChild(el("div", "modal-sub",
      "Send this secret link to exactly one guest. Anyone holding it controls the guest seat, so do not post it publicly."));
    const row = el("div", "mp-invite");
    const link = document.createElement("input");
    link.readOnly = true;
    link.value = room.inviteUrl;
    link.setAttribute("aria-label", "Private guest invitation link");
    const copy = el("button", "btn btn-small", "COPY LINK");
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link.value); copy.textContent = "COPIED"; }
      catch (_error) { link.select(); document.execCommand("copy"); copy.textContent = "COPIED"; }
    };
    row.append(link, copy);
    modal.appendChild(row);
    modalButtons(modal, [
      { label: "ENTER ROOM", cls: "btn-go", fn: () => connect(room.roomId, room.ticket) },
    ]);
  }

  function connect(roomId, ticket) {
    if (active) active.close();
    const socketUrl = `api/rooms/${encodeURIComponent(roomId)}/socket`;
    const session = active = new RemoteSession({ roomId, ticket, humanId: 0, socketUrl });
    let entered = false;
    session.addEventListener("snapshot", () => {
      if (!entered) {
        entered = true;
        Main.enterRemote(session);
      } else Main.remoteUpdated(session);
    });
    session.addEventListener("status", (event) => {
      if (event.detail === "disconnected") toast("Connection lost — trying to rejoin the private room…");
      if (event.detail === "connected" && entered) toast("Reconnected to the private room.");
    });
    session.addEventListener("presence", (event) => {
      const other = session.humanId === 0 ? 1 : 0;
      toast(event.detail.connected[other] ? "Your guest is connected." : "Waiting for the other publisher to reconnect.");
    });
    session.connect();
  }

  function init() {
    document.getElementById("btn-private-room").onclick = () => {
      SFX.unlock(); SFX.play("click"); SFX.startMusic(); openCreate();
    };
    const params = new URLSearchParams(location.search);
    const roomId = params.get("room"), ticket = params.get("ticket");
    if (roomId && ticket) {
      history.replaceState({}, "", location.pathname + location.hash);
      openModal((m) => {
        m.appendChild(el("h2", "", "JOINING PRIVATE NEWSROOM"));
        m.appendChild(el("div", "modal-sub", "Checking your invitation and restoring the latest room state…"));
      }, { width: "580px" });
      connect(roomId, ticket);
    }
  }

  return { init, connect };
})();
