// ============================================================================
// AGE OF COMICS — FX: slot-machine juice. Particle bursts, celebration cards
// with spinning rays, and covers that fly onto the chart. Pure DOM/CSS.
// ============================================================================
"use strict";

const FX = (() => {
  const root = () => document.getElementById("app");
  const z = () => parseFloat(root().style.zoom) || 1;

  // confetti burst at pre-zoom app coordinates
  function burst(x, y, colors = ["#f5c86e", "#d94f43", "#5ba59f", "#fff", "#e07f2e"], n = 16) {
    for (let i = 0; i < n; i++) {
      const p = el("div", "fxp");
      const ang = Math.random() * Math.PI * 2, dist = 45 + Math.random() * 95;
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--dy", Math.sin(ang) * dist - 34 + "px");
      p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
      root().appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }
  // burst centered on a DOM element (rect is in real px — convert to app units)
  function burstEl(elem, colors, n) {
    if (!elem) return;
    const r = elem.getBoundingClientRect();
    burst((r.left + r.width / 2) / z(), (r.top + r.height / 2) / z(), colors, n);
  }

  // big center-stage moment: rays + pop-in card + confetti
  function celebrate(o = {}) {
    const wrap = el("div", "fx-celebrate");
    if (o.hue) wrap.style.setProperty("--ch", o.hue);
    wrap.appendChild(el("div", "fx-rays"));
    const card = el("div", "fx-card");
    if (o.sprite) card.appendChild(spr(o.sprite, o.scale || 2.2));
    card.appendChild(el("div", "fx-title", o.title || ""));
    if (o.sub) card.appendChild(el("div", "fx-sub", o.sub));
    wrap.appendChild(card);
    root().appendChild(wrap);
    burst(innerWidth / 2 / z(), innerHeight / 2.4 / z(), o.colors, 22);
    const dur = o.dur || 1800;
    setTimeout(() => wrap.classList.add("out"), dur - 300);
    setTimeout(() => wrap.remove(), dur);
  }

  // a sprite launches from center stage and lands on the chart panel
  function flyToChart(sprite, scale = 1) {
    const target = document.getElementById("chart-panel");
    if (!target) return;
    const d = spr(sprite, scale, "fx-fly");
    d.style.left = innerWidth / 2 / z() - 20 + "px";
    d.style.top = innerHeight / 2.6 / z() + "px";
    root().appendChild(d);
    const r = target.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.style.left = (r.left + 50) / z() + "px";
      d.style.top = (r.top + 70) / z() + "px";
      d.style.transform = "scale(.3)";
      d.style.opacity = ".25";
    }));
    SFX.play("whoosh");
    setTimeout(() => d.remove(), 850);
  }

  // long confetti rain across the top (endgame)
  function confetti(ms = 2600) {
    const t0 = performance.now();
    (function rain() {
      if (performance.now() - t0 > ms) return;
      burst((0.1 + Math.random() * 0.8) * innerWidth / z(), 40 + Math.random() * 80, undefined, 8);
      setTimeout(rain, 180);
    })();
  }

  return { burst, burstEl, celebrate, flyToChart, confetti };
})();
