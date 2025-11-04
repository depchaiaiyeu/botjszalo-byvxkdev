import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

export function createHelpBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
  gradient.addColorStop(0, "#2E1E66");
  gradient.addColorStop(0.4, "#1E1B4B");
  gradient.addColorStop(0.7, "#172554");
  gradient.addColorStop(1, "#0F172A");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glowGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  glowGradient.addColorStop(0, "rgba(80, 120, 255, 0.25)");
  glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);

  const numNodes = Math.floor(Math.random() * 51) + 50;
  const nodes = [];
  for (let i = 0; i < numNodes; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5 + 0.5;
    const opacity = Math.random() * 0.4 + 0.1;
    nodes.push({ x, y, radius, opacity });
  }

  const maxDistance = 100;
  ctx.lineWidth = 0.5;

  for (let i = 0; i < numNodes; i++) {
    for (let j = i + 1; j < numNodes; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];
      const dist = Math.sqrt(Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2));

      if (dist < maxDistance) {
        ctx.beginPath();
        ctx.moveTo(node1.x, node1.y);
        ctx.lineTo(node2.x, node2.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 * (1 - dist / maxDistance)})`;
        ctx.stroke();
      }
    }
  }

  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
    ctx.shadowColor = `rgba(255, 255, 255, ${node.opacity * 1.5})`;
    ctx.shadowBlur = node.radius * 2;
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

export async function createInstructionsImage(helpContent, isAdminBox, width = 800) {
  const ctxTemp = createCanvas(999, 999).getContext("2d");
  const space = 36;
  let yTemp = 60;
  ctxTemp.font = "bold 28px BeVietnamPro";
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
      const labelWidth = ctxTemp.measureText(keyHelpContent).width;
      const valueHelpContent = " -> " + helpContent.allMembers[key].description;
      const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
      if (lineWidth > width) yTemp += 52;
      yTemp += 52;
    }
  }
  yTemp += 60;
  if (isAdminBox) {
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
        const labelWidth = ctxTemp.measureText(keyHelpContent).width;
        const valueHelpContent = " -> " + helpContent.admin[key].description;
        const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
        if (lineWidth > width) yTemp += 52;
        yTemp += 52;
      }
    }
    yTemp += 60;
  }
  const height = yTemp > 430 ? yTemp : 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  createHelpBackground(ctx, width, height);
  let y = 60;
  ctx.textAlign = "left";
  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(helpContent.title, space, y);
  y += 50;
  ctx.textAlign = "left";
  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = "#FFFFFF";
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      ctx.fillStyle = cv.getRandomGradient(ctx, width);
      const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
      const labelWidth = ctx.measureText(keyHelpContent).width;
      ctx.fillText(keyHelpContent, space, y);
      ctx.fillStyle = "#FFFFFF";
      const valueHelpContent = " -> " + helpContent.allMembers[key].description;
      const lineWidth = labelWidth + space + ctx.measureText(valueHelpContent).width;
      if (lineWidth > width) {
        y += 52;
        ctx.fillText(valueHelpContent, space + 20, y);
      } else {
        ctx.fillText(valueHelpContent, space + labelWidth, y);
      }
      y += 52;
    }
  }
  if (isAdminBox) {
    if (Object.keys(helpContent.admin).length > 0) {
      y += 30;
      ctx.textAlign = "left";
      ctx.font = "bold 28px BeVietnamPro";
      ctx.fillStyle = cv.getRandomGradient(ctx, width);
      ctx.fillText(helpContent.titleAdmin, space, y);
      y += 50;
      for (const key in helpContent.admin) {
        if (helpContent.admin.hasOwnProperty(key)) {
          ctx.fillStyle = cv.getRandomGradient(ctx, width);
          const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
          const labelWidth = ctx.measureText(keyHelpContent).width;
          ctx.fillText(keyHelpContent, space, y);
          ctx.fillStyle = "#FFFFFF";
          const valueHelpContent = " -> " + helpContent.admin[key].description;
          const lineWidth = labelWidth + space + ctx.measureText(valueHelpContent).width;
          if (lineWidth > width) {
            y += 52;
            ctx.fillText(valueHelpContent, space + 20, y);
          } else {
            ctx.fillText(valueHelpContent, space + labelWidth, y);
          }
          y += 52;
        }
      }
    }
  }
  const filePath = path.resolve(`./assets/temp/help_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
