'use client';

import { useEffect, useRef, useState } from 'react';

type Vec2 = { x: number; y: number };

const MAP = [
  '1111111111111111',
  '1S000010000000E1',
  '1011100101111101',
  '1000100001000001',
  '1010111111011101',
  '1010000000010001',
  '1011110111010101',
  '1000000100010101',
  '1110111101010101',
  '1000100001010001',
  '1011101111011101',
  '1000001000000001',
  '1111111111111111',
];

const TILE = 64;
const FOV = Math.PI / 3;
const MAX_DEPTH = 950;
const MOVE_SPEED = 150;
const TURN_SPEED = 2.1;

function isWall(worldX: number, worldY: number) {
  const mapX = Math.floor(worldX / TILE);
  const mapY = Math.floor(worldY / TILE);
  if (mapY < 0 || mapY >= MAP.length || mapX < 0 || mapX >= MAP[0].length) {
    return true;
  }
  return MAP[mapY][mapX] === '1';
}

function getStartAndExit() {
  let start: Vec2 = { x: TILE * 1.5, y: TILE * 1.5 };
  let exit: Vec2 = { x: TILE * 13.5, y: TILE * 1.5 };

  MAP.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      if (cell === 'S') {
        start = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
      }
      if (cell === 'E') {
        exit = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
      }
    });
  });

  return { start, exit };
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState('Clique dans la scène puis survive...');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { start, exit } = getStartAndExit();

    const state = {
      player: { ...start, angle: Math.PI / 8 },
      enemy: { x: TILE * 11.5, y: TILE * 10.5 },
      keys: new Set<string>(),
      flashlight: true,
      noise: 0,
      jumpscareAlpha: 0,
      won: false,
      lost: false,
      last: performance.now(),
    };

    const wallTexture = document.createElement('canvas');
    wallTexture.width = 128;
    wallTexture.height = 128;
    const wt = wallTexture.getContext('2d');
    if (wt) {
      wt.fillStyle = '#1a1a20';
      wt.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 8) {
        for (let x = 0; x < 128; x += 8) {
          const v = 20 + ((x * 13 + y * 7) % 40);
          wt.fillStyle = `rgb(${v}, ${v * 0.9}, ${v * 1.1})`;
          wt.fillRect(x, y, 8, 8);
        }
      }
      wt.strokeStyle = 'rgba(102, 67, 52, 0.6)';
      wt.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        wt.beginPath();
        wt.moveTo(0, i * 16 + 4);
        wt.lineTo(128, i * 16 + 8);
        wt.stroke();
      }
    }

    const floorTexture = document.createElement('canvas');
    floorTexture.width = 64;
    floorTexture.height = 64;
    const ft = floorTexture.getContext('2d');
    if (ft) {
      ft.fillStyle = '#0e1116';
      ft.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 180; i++) {
        ft.fillStyle = `rgba(30, 45, 40, ${Math.random() * 0.8})`;
        ft.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5);
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        state.flashlight = !state.flashlight;
      } else {
        state.keys.add(e.key.toLowerCase());
      }
    };
    const onKeyUp = (e: KeyboardEvent) => state.keys.delete(e.key.toLowerCase());

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === gameContainerRef.current && !state.won && !state.lost) {
        state.player.angle += e.movementX * 0.002;
      }
    };

    const lockPointer = () => {
      gameContainerRef.current?.requestPointerLock();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    gameContainerRef.current?.addEventListener('click', lockPointer);

    const rayCast = (angle: number) => {
      const step = 3;
      let d = 0;
      while (d < MAX_DEPTH) {
        const x = state.player.x + Math.cos(angle) * d;
        const y = state.player.y + Math.sin(angle) * d;
        if (isWall(x, y)) {
          return { d, hitX: x, hitY: y };
        }
        d += step;
      }
      return { d: MAX_DEPTH, hitX: 0, hitY: 0 };
    };

    const tryMove = (dx: number, dy: number) => {
      const nextX = state.player.x + dx;
      const nextY = state.player.y + dy;
      if (!isWall(nextX, state.player.y)) state.player.x = nextX;
      if (!isWall(state.player.x, nextY)) state.player.y = nextY;
    };

    const loop = (now: number) => {
      const dt = Math.min((now - state.last) / 1000, 0.05);
      state.last = now;

      if (!state.won && !state.lost) {
        const forward = (state.keys.has('z') || state.keys.has('w') ? 1 : 0) - (state.keys.has('s') ? 1 : 0);
        const strafe = (state.keys.has('d') ? 1 : 0) - (state.keys.has('q') || state.keys.has('a') ? 1 : 0);
        const turn = (state.keys.has('arrowright') ? 1 : 0) - (state.keys.has('arrowleft') ? 1 : 0);

        state.player.angle += turn * TURN_SPEED * dt;

        const forwardDX = Math.cos(state.player.angle) * forward * MOVE_SPEED * dt;
        const forwardDY = Math.sin(state.player.angle) * forward * MOVE_SPEED * dt;
        const strafeDX = Math.cos(state.player.angle + Math.PI / 2) * strafe * MOVE_SPEED * 0.7 * dt;
        const strafeDY = Math.sin(state.player.angle + Math.PI / 2) * strafe * MOVE_SPEED * 0.7 * dt;
        tryMove(forwardDX + strafeDX, forwardDY + strafeDY);

        const toPlayerX = state.player.x - state.enemy.x;
        const toPlayerY = state.player.y - state.enemy.y;
        const enemyDist = Math.hypot(toPlayerX, toPlayerY);
        const enemySpeed = enemyDist < 180 ? 95 : 60;
        const enemyStepX = (toPlayerX / (enemyDist || 1)) * enemySpeed * dt;
        const enemyStepY = (toPlayerY / (enemyDist || 1)) * enemySpeed * dt;

        if (!isWall(state.enemy.x + enemyStepX, state.enemy.y)) state.enemy.x += enemyStepX;
        if (!isWall(state.enemy.x, state.enemy.y + enemyStepY)) state.enemy.y += enemyStepY;

        if (enemyDist < 35) {
          state.lost = true;
          setMessage('Le monstre vous a attrapé... Appuyez sur F5 pour recommencer.');
        }

        if (distance(state.player, exit) < 50) {
          state.won = true;
          setMessage('Vous avez trouvé la sortie ! Vous survivez cette nuit.');
        }
      }

      ctx.fillStyle = '#030408';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const horizon = canvas.height * 0.52;
      const floorPattern = ctx.createPattern(floorTexture, 'repeat');
      if (floorPattern) {
        ctx.fillStyle = floorPattern;
        ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);
      }
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, '#060709');
      skyGrad.addColorStop(1, '#141018');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, horizon);

      const rayCount = Math.floor(canvas.width / 2);
      for (let i = 0; i < rayCount; i++) {
        const rayRatio = i / rayCount;
        const rayAngle = state.player.angle - FOV / 2 + rayRatio * FOV;
        const hit = rayCast(rayAngle);
        const corrected = hit.d * Math.cos(rayAngle - state.player.angle);
        const wallHeight = Math.min((TILE / Math.max(1, corrected)) * canvas.height * 0.9, canvas.height);
        const x = rayRatio * canvas.width;
        const y = horizon - wallHeight / 2;

        const textureX = Math.abs(Math.floor((hit.hitX + hit.hitY) % wallTexture.width));
        ctx.drawImage(wallTexture, textureX, 0, 1, wallTexture.height, x, y, canvas.width / rayCount + 1, wallHeight);

        const brightness = state.flashlight
          ? Math.max(0.08, 1 - corrected / 400)
          : Math.max(0.03, 1 - corrected / 800);
        const edgeDark = Math.abs(rayRatio - 0.5) * 1.1;

        ctx.fillStyle = `rgba(0, 0, 0, ${1 - brightness + edgeDark})`;
        ctx.fillRect(x, y, canvas.width / rayCount + 1, wallHeight);
      }

      const dx = state.enemy.x - state.player.x;
      const dy = state.enemy.y - state.player.y;
      const enemyAngle = Math.atan2(dy, dx);
      const angleDiff = Math.atan2(Math.sin(enemyAngle - state.player.angle), Math.cos(enemyAngle - state.player.angle));
      const enemyDist = Math.hypot(dx, dy);

      if (Math.abs(angleDiff) < FOV * 0.55 && enemyDist > 20) {
        const size = Math.min((TILE / enemyDist) * canvas.height * 0.9, canvas.height * 0.8);
        const screenX = ((angleDiff + FOV / 2) / FOV) * canvas.width;
        const screenY = horizon - size * 0.4;
        const alpha = Math.max(0.2, 1 - enemyDist / 500);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#1a0202';
        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(screenX - size * 0.13, screenY + size * 0.06, size * 0.26, size * 0.52);
        ctx.fillStyle = '#bc1d2a';
        ctx.fillRect(screenX - size * 0.07, screenY - size * 0.02, size * 0.03, size * 0.03);
        ctx.fillRect(screenX + size * 0.04, screenY - size * 0.02, size * 0.03, size * 0.03);
        ctx.restore();
      }

      const exitDx = exit.x - state.player.x;
      const exitDy = exit.y - state.player.y;
      const exitAngle = Math.atan2(exitDy, exitDx);
      const exitDiff = Math.atan2(Math.sin(exitAngle - state.player.angle), Math.cos(exitAngle - state.player.angle));
      const exitDist = Math.hypot(exitDx, exitDy);
      if (Math.abs(exitDiff) < FOV / 2 && exitDist > 20) {
        const glowX = ((exitDiff + FOV / 2) / FOV) * canvas.width;
        const glowR = Math.max(8, 1700 / exitDist);
        const glow = ctx.createRadialGradient(glowX, horizon, 0, glowX, horizon, glowR * 2.5);
        glow.addColorStop(0, 'rgba(86, 198, 255, 0.6)');
        glow.addColorStop(1, 'rgba(86, 198, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(glowX - glowR * 2, horizon - glowR * 2, glowR * 4, glowR * 4);
      }

      if (state.lost) {
        state.jumpscareAlpha = Math.min(1, state.jumpscareAlpha + dt * 1.1);
      }
      if (state.jumpscareAlpha > 0) {
        ctx.fillStyle = `rgba(120, 0, 0, ${state.jumpscareAlpha * 0.45})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      state.noise += dt * 20;
      for (let i = 0; i < 90; i++) {
        const n = (Math.sin(state.noise + i) + 1) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${n * 0.025})`;
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      gameContainerRef.current?.removeEventListener('click', lockPointer);
    };
  }, []);

  return (
    <div ref={gameContainerRef} className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/20 bg-black/50 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-300">Maison des Murmures</p>
        <p className="mt-1 text-xs text-white/80">ZQSD / WASD pour bouger • Souris pour regarder • F pour lampe</p>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-cyan-200/30 bg-black/55 px-4 py-2 text-center text-sm text-cyan-100 backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
}
