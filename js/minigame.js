// minigame.js — Scrummer Sidebar Mini Runner (tiny dino-style)

(() => {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: false });

  // --- Sizing (fits left nav) ---
  const W = canvas.width;
  const H = canvas.height;

  // --- Theme helpers (pull from CSS vars if present) ---
  const cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  const COLORS = {
    bgLight: "#ffffff",
    bgDark: "#0f172a",
    ground: "rgba(148,163,184,0.45)", // slate-ish
    player: cssVar("--accent-primary", "#0b57d0"),
    danger: "#ef4444",
    text: "rgba(148,163,184,0.9)",
    textStrong: "rgba(226,232,240,0.95)",
  };

  const isDark = () =>
    document.body.classList.contains("dark-mode") ||
    document.documentElement.getAttribute("data-theme") === "neon";

  // --- Game state ---
  const groundY = Math.floor(H * 0.82); // baseline for running
  const gravity = 0.55;

  const player = {
    x: 18,
    y: groundY - 16,
    w: 14,
    h: 14,
    vy: 0,
    jumpPower: -8.4,
    onGround: true,
    // tiny leg animation
    stepT: 0,
  };

  let obstacles = [];
  let particles = [];

  let score = 0;
  let best = Number(localStorage.getItem("scrummer_mini_best") || 0);

  let speed = 2.2;
  let spawnTimer = 0;
  let spawnEvery = 70; // frames-ish

  let running = false;
  let gameOver = false;

  // Input buffering (jump a little before landing still works)
  let jumpQueuedFrames = 0; // counts down

  // --- Utilities ---
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function reset(runImmediately = false) {
    obstacles = [];
    particles = [];
    score = 0;
    speed = 2.2;
    spawnTimer = 0;
    spawnEvery = 70;
    gameOver = false;

    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;

    if (runImmediately) running = true;
  }

  function queueJump() {
    // buffer jump for a short time
    jumpQueuedFrames = 8;
    if (!running && !gameOver) running = true;
    if (gameOver) {
      reset(true);
    }
  }

  function doJumpIfPossible() {
    if (jumpQueuedFrames > 0 && player.onGround && !gameOver) {
      player.vy = player.jumpPower;
      player.onGround = false;
      jumpQueuedFrames = 0;

      // tiny particles for premium feel
      for (let i = 0; i < 7; i++) {
        particles.push({
          x: player.x + player.w * 0.6,
          y: groundY - 2,
          vx: rand(-0.7, -1.8),
          vy: rand(-0.8, -2.2),
          life: rand(16, 28),
        });
      }
    }
    if (jumpQueuedFrames > 0) jumpQueuedFrames--;
  }

  function spawnObstacle() {
    // small “bug” blocks with slight size variation
    const size = Math.random() < 0.35 ? 12 : 10;
    const gap = Math.random() < 0.2 ? 14 : 0; // occasional low-high variation (still single obstacle)
    obstacles.push({
      x: W + 10,
      y: groundY - size + gap,
      w: size,
      h: size - gap,
      passed: false,
    });
  }

  function collide(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // --- Draw helpers ---
  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    // background
    ctx.fillStyle = isDark() ? COLORS.bgDark : COLORS.bgLight;
    ctx.fillRect(0, 0, W, H);

    // subtle top fade (premium)
    ctx.fillStyle = isDark() ? "rgba(0,0,0,0.10)" : "rgba(15,23,42,0.04)";
    ctx.fillRect(0, 0, W, 18);

    // ground line
    ctx.strokeStyle = COLORS.ground;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();

    // HUD
    ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = isDark() ? COLORS.textStrong : "rgba(15,23,42,0.65)";
    ctx.fillText(`SP: ${score}`, 8, 13);
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.fillText(`Best: ${best}`, 70, 13);

    // Player (tiny “S” runner)
    ctx.fillStyle = COLORS.player;
    drawRoundedRect(player.x, player.y, player.w, player.h, 3);

    // tiny "legs" when running on ground
    if (running && player.onGround && !gameOver) {
      player.stepT += 1;
      const leg = (player.stepT % 10) < 5 ? 1 : 0;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(player.x + 3 + leg * 3, groundY - 2, 3, 2);
      ctx.fillRect(player.x + 8 - leg * 3, groundY - 2, 3, 2);
    }

    // Obstacles
    obstacles.forEach((ob) => {
      ctx.fillStyle = COLORS.danger;
      drawRoundedRect(ob.x, ob.y, ob.w, ob.h, 2);
    });

    // Particles
    ctx.fillStyle = isDark() ? "rgba(226,232,240,0.35)" : "rgba(15,23,42,0.18)";
    particles.forEach((p) => {
      ctx.fillRect(p.x, p.y, 2, 2);
    });

    // Overlay messages
    if (!running && !gameOver) {
      ctx.fillStyle = isDark() ? "rgba(226,232,240,0.85)" : "rgba(15,23,42,0.72)";
      ctx.font = "bold 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Tap / Space to Start", 66, Math.floor(H * 0.55));
    }

    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = isDark() ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.92)";
      ctx.font = "800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Game Over", 78, Math.floor(H * 0.45));
      ctx.font = "bold 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(148,163,184,0.95)";
      ctx.fillText("Tap / Space to retry", 66, Math.floor(H * 0.62));
    }
  }

  function update() {
    doJumpIfPossible();

    if (running && !gameOver) {
      // speed ramps gently
      speed = Math.min(5.3, speed + 0.0009 * (1 + score * 0.05));
      spawnEvery = clamp(70 - Math.floor(score / 6), 38, 70);

      // player physics
      player.vy += gravity;
      player.y += player.vy;

      if (player.y >= groundY - player.h) {
        player.y = groundY - player.h;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }

      // spawn obstacles
      spawnTimer++;
      if (spawnTimer > spawnEvery) {
        spawnTimer = 0;
        // avoid double spawns too close
        if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < W - 70) {
          spawnObstacle();
        }
      }

      // move obstacles, score, collision
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        ob.x -= speed;

        if (!ob.passed && ob.x + ob.w < player.x) {
          ob.passed = true;
          score += 1;
          if (score > best) {
            best = score;
            localStorage.setItem("scrummer_mini_best", String(best));
          }
        }

        if (collide(player, ob)) {
          gameOver = true;
          running = false;
        }

        if (ob.x + ob.w < -10) obstacles.splice(i, 1);
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life -= 1;
        if (p.life <= 0) particles.splice(i, 1);
      }
    } else {
      // idle particles decay
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].life -= 1.5;
        if (particles[i].life <= 0) particles.splice(i, 1);
      }
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Inputs ---
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      queueJump();
    }
  });

  canvas.addEventListener("mousedown", () => queueJump());
  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); queueJump(); }, { passive: false });

  // start
  reset(false);
  loop();
})();