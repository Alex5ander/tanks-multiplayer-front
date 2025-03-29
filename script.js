import { io, Socket } from 'socket.io-client';
import parser from 'socket.io-msgpack-parser';
import sheet from './assets/sheet.json';
import sheet_tanks from './assets/sheet_tanks.png';

const ws = 'https://tanks-multiplayer-server.glitch.me/';
// const ws = 'http://localhost:3000'

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('canvas');
const WIDTH = 640;
const HEIGHT = 480;
const ASPECT_RATIO = WIDTH / HEIGHT;
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext('2d');
let spriteSheet, tanks, barrels, bullet, smoke, terrain, objects_sprites;

/** @type {Socket} */
let socket;

let players = {};
let shots = {};
let smokes = [];
let deadTime = 0;

let { PI, floor, cos, sin } = Math;

let keys = [];

const offcanvas = new OffscreenCanvas(canvas.width, canvas.height);
const offctx = offcanvas.getContext('2d');

const drawSprite = (sprite, rect, context = ctx) => {
  let mx = rect.x + rect.w / 2;
  let my = rect.y + rect.h / 2;
  context.save();
  context.translate(mx, my);
  context.rotate(rect.angle);
  context.translate(-mx, -my);
  context.drawImage(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height, rect.x, rect.y, rect.w, rect.h);
  context.restore();
}

const drawTerrain = (index, objects) => {
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    let x = i % canvas.width;
    let y = floor(i / canvas.width) % canvas.height;
    offctx.drawImage(spriteSheet, terrain[index].x, terrain[index].y, terrain[index].width, terrain[index].height, x * 64, y * 64, 64, 64);
  }
  objects.forEach(e => drawSprite(objects_sprites[e.index], e, offctx))
}

const draw = () => {
  ctx.drawImage(offcanvas, 0, 0);

  for (const id in players) {
    const player = players[id];
    let pmx = player.x + player.w / 2;
    let pmy = player.y + player.h / 2;

    if (player.id == socket.id) {

      if (player.life <= 0) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Renascer em ' + (3 - floor((Date.now() - deadTime) / 1000)), WIDTH / 2, HEIGHT / 2);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = '16px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText('Baixas: ' + player.kills, 8, 8);

      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Jogador', pmx, pmy - player.h);
      ctx.restore();
    }

    if (player.life > 0) {
      ctx.fillStyle = player.life > 50 ? '#00ff0088' : '#ff000088';
      ctx.fillRect(pmx - player.life / 100 * player.w / 2, pmy - player.h, player.life / 100 * player.w, 10);
      drawSprite(tanks[player.sprite], player);

      ctx.save();
      ctx.translate(pmx, pmy);
      ctx.rotate(player.angle + player.barrel.angle - PI);
      ctx.translate(-pmx, -pmy);
      drawSprite(barrels[player.barrel.sprite], { ...player.barrel, x: pmx - player.barrel.w / 2, y: pmy, angle: 0 });
      ctx.restore();
    }
  }

  for (const id in shots) {
    const shot = shots[id];
    shot.x += sin(shot.angle) * shot.speed;
    shot.y -= cos(shot.angle) * shot.speed;
    drawSprite(bullet, shot)
  }

  smokes.forEach(e => {
    let index = Math.min(floor((2 / 300) * (Date.now() - e.time)), 2);
    drawSprite(smoke[index], {
      x: e.x - smoke[index].width / 4,
      y: e.y - smoke[index].height / 4,
      w: smoke[index].width / 2,
      h: smoke[index].height / 2
    });
  });

  smokes = smokes.filter(e => Date.now() - e.time < 300);
}

const loop = () => {
  if (keys.length) {
    socket.volatile.emit('move', keys);
  }
  draw();
  setTimeout(loop, 1000 / 60);
}

const resize = () => {
  let asp = window.innerWidth / window.innerHeight;
  let v = asp > ASPECT_RATIO;
  canvas.style.width = v ? 'auto' : '100%';
  canvas.style.height = v ? '100%' : 'auto';
}

(async () => {
  tanks = [
    sheet.tankBeige,
    sheet.tankBlack,
    sheet.tankBlue,
    sheet.tankGreen,
    sheet.tankRed,
    sheet.tankBeige_outline,
    sheet.tankBlack_outline,
    sheet.tankBlue_outline,
    sheet.tankGreen_outline,
    sheet.tankRed_outline
  ];
  barrels = [
    sheet.barrelBeige,
    sheet.barrelBlack,
    sheet.barrelBlue,
    sheet.barrelGreen,
    sheet.barrelRed,
    sheet.barrelBeige_outline,
    sheet.barrelBlack_outline,
    sheet.barrelBlue_outline,
    sheet.barrelGreen_outline,
    sheet.barrelRed_outline
  ];
  bullet = sheet.bulletBeigeSilver_outline;

  terrain = [sheet.sand, sheet.grass, sheet.dirt];

  objects_sprites = [sheet.treeSmall, sheet.treeLarge, sheet.barrelGreen_up, sheet.barrelGrey_up, sheet.barrelRed_up];

  smoke = [sheet.smokeGrey3, sheet.smokeGrey2, sheet.smokeGrey1];

  spriteSheet = new Image();
  spriteSheet.src = sheet_tanks;
  spriteSheet.onload = () => {

    socket = io(ws, { parser });

    socket.on('join', e => {
      players = e.players;
      shots = e.shots;
      drawTerrain(e.terrain, e.objects);
    });

    socket.on('respawn', player => {
      players[player.id] = player;
    })

    socket.on('updatePlayerLife', ([id, life]) => {
      players[id].life = life;
      if (id == socket.id) {
        deadTime = Date.now()
      }
    })

    socket.on('createBullet', bullet => {
      shots[bullet.id] = bullet;
      smokes.push({
        x: bullet.x,
        y: bullet.y,
        time: Date.now(),
      })
    })

    socket.on('removeBullet', bulletId => {
      smokes.push({
        x: shots[bulletId].x,
        y: shots[bulletId].y,
        time: Date.now(),
      })
      delete shots[bulletId];
    })

    socket.on('playerMoved', player => {
      players[player.id] = player;
    })

    socket.on('newPlayer', player => {
      players[player.id] = player;
    });

    socket.on('playerDisconnected', playerId => {
      delete players[playerId];
    });

    socket.on('disconnect', () => {
      players = {};
      shots = {};
    });
    resize();
    loop();
  };
})()

window.addEventListener('resize', resize);

window.addEventListener('keydown', e => {
  if (!keys.includes(e.code)) {
    keys.push(e.code);
  }
});

window.addEventListener('keyup', e => {
  keys = keys.filter(key => key != e.code);
});
const dpad = document.createElement('div');
dpad.style.position = 'absolute';
dpad.style.bottom = '10px';
dpad.style.left = '10px';
dpad.style.display = 'grid';
dpad.style.gridTemplateColumns = '50px 50px 50px';
dpad.style.gridTemplateRows = '50px 50px 50px';
dpad.style.gap = '5px';
dpad.style.zIndex = '10';

document.body.appendChild(dpad);

const directions = [
  [null, 'KeyW', null],
  ['KeyA', null, 'KeyD'],
  [null, 'KeyS', null]
];

const keysMap = {
  'KeyW': '↑',
  'KeyS': '↓',
  'KeyA': '←',
  'KeyD': '→'
};

directions.forEach(row => {
  row.forEach(dir => {
    const btn = document.createElement('button');
    btn.style.width = '50px';
    btn.style.height = '50px';
    btn.style.fontSize = '16px';
    btn.style.borderRadius = '10px';
    btn.style.textAlign = 'center';
    btn.style.background = dir ? '#555' : 'transparent';
    btn.style.border = 'none';
    btn.style.userSelect = 'none';
    btn.style.color = '#fff';
    btn.textContent = dir ? keysMap[dir] : '';
    dpad.appendChild(btn);

    if (dir) {
      btn.addEventListener('touchstart', () => {
        if (!keys.includes(dir)) keys.push(dir);
      });
      btn.addEventListener('touchend', () => {
        keys = keys.filter(k => k !== dir);
      });
    } else {
      btn.style.visibility = 'hidden'
    }
  });
});

const fireBtn = document.createElement('button');
fireBtn.textContent = 'Fire';
fireBtn.style.position = 'absolute';
fireBtn.style.bottom = '20px';
fireBtn.style.right = '20px';
fireBtn.style.width = '80px';
fireBtn.style.height = '80px';
fireBtn.style.fontSize = '18px';
fireBtn.style.userSelect = 'none';
fireBtn.style.borderRadius = '50%';
fireBtn.style.background = '#f00';
fireBtn.style.color = '#fff';
fireBtn.style.border = 'none';
document.body.appendChild(fireBtn);

fireBtn.addEventListener('touchstart', () => {
  keys.push('Space');
});


fireBtn.addEventListener('touchend', () => {
  keys = keys.filter(k => k !== 'Space')
});
