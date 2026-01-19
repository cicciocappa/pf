const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function drawPolygon(poly, color = "white", fill = false) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i].x, poly[i].y);
  }
  ctx.closePath();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (fill) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

function drawPoints(poly, color = "red") {
  ctx.fillStyle = color;
  for (const p of poly) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/*
const simpleConcave = [
  {x:100,y:100},
  {x:300,y:100},
  {x:350,y:200},
  {x:300,y:300},
  {x:200,y:250},
  {x:100,y:300}
];

clear();
drawPolygon(simpleConcave, "white");
drawPoints(simpleConcave);

const parts1 = bayazit(simpleConcave);
parts1.forEach(p =>
  drawPolygon(p, randomColor(), true)
);
*/

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h},70%,60%)`;
}

const outer = [
  {x:100,y:100},
  {x:500,y:100},
  {x:500,y:400},
  {x:100,y:400}
]; // CCW

const hole = [
  {x:250,y:150},
  {x:200,y:300},
  {x:350,y:300},
  {x:300,y:150}
]; // CW

clear();
drawPolygon(outer, "white");
drawPolygon(hole, "yellow");

const merged = mergeHoles(outer, [hole]);
drawPolygon(merged, "cyan");

const parts2 = bayazit(merged);
parts2.forEach(p =>
  drawPolygon(p, randomColor(), true)
);

/*
const monster = [
  {x:100,y:150},{x:180,y:100},{x:260,y:140},
  {x:320,y:100},{x:400,y:160},{x:380,y:240},
  {x:420,y:320},{x:300,y:350},{x:220,y:300},
  {x:140,y:360},{x:120,y:260}
];

clear();
drawPolygon(monster, "white");

const parts3 = bayazit(monster);
parts3.forEach(p =>
  drawPolygon(p, randomColor(), true)
);
*/