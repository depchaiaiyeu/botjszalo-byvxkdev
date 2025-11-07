import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

export function createHelpBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
  gradient.addColorStop(0, "#3A2A82");
  gradient.addColorStop(0.4, "#292569");
  gradient.addColorStop(0.7, "#1D3270");
  gradient.addColorStop(1, "#122040");
  ctx.fillStyle = gradient;
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

function toUpperCaseVietnamese(text) {
  return text.replace(/[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, (char) => {
    const lowerToUpper = {
      'à': 'À', 'á': 'Á', 'ạ': 'Ạ', 'ả': 'Ả', 'ã': 'Ã',
      'â': 'Â', 'ầ': 'Ầ', 'ấ': 'Ấ', 'ậ': 'Ậ', 'ẩ': 'Ẩ', 'ẫ': 'Ẫ',
      'ă': 'Ă', 'ằ': 'Ằ', 'ắ': 'Ắ', 'ặ': 'Ặ', 'ẳ': 'Ẳ', 'ẵ': 'Ẵ',
      'è': 'È', 'é': 'É', 'ẹ': 'Ẹ', 'ẻ': 'Ẻ', 'ẽ': 'Ẽ',
      'ê': 'Ê', 'ề': 'Ề', 'ế': 'Ế', 'ệ': 'Ệ', 'ể': 'Ể', 'ễ': 'Ễ',
      'ì': 'Ì', 'í': 'Í', 'ị': 'Ị', 'ỉ': 'Ỉ', 'ĩ': 'Ĩ',
      'ò': 'Ò', 'ó': 'Ó', 'ọ': 'Ọ', 'ỏ': 'Ỏ', 'õ': 'Õ',
      'ô': 'Ô', 'ồ': 'Ồ', 'ố': 'Ố', 'ộ': 'Ộ', 'ổ': 'Ổ', 'ỗ': 'Ỗ',
      'ơ': 'Ơ', 'ờ': 'Ờ', 'ớ': 'Ớ', 'ợ': 'Ợ', 'ở': 'Ở', 'ỡ': 'Ỡ',
      'ù': 'Ù', 'ú': 'Ú', 'ụ': 'Ụ', 'ủ': 'Ủ', 'ũ': 'Ũ',
      'ư': 'Ư', 'ừ': 'Ừ', 'ứ': 'Ứ', 'ự': 'Ự', 'ử': 'Ử', 'ữ': 'Ữ',
      'ỳ': 'Ỳ', 'ý': 'Ý', 'ỵ': 'Ỵ', 'ỷ': 'Ỷ', 'ỹ': 'Ỹ',
      'đ': 'Đ'
    };
    return lowerToUpper[char] || char.toUpperCase();
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function createInstructionsImage(helpContent, isAdminBox, width = 880) {
  const padding = 40;
  const commandBoxPadding = 20;
  const commandBoxMargin = 15;
  const borderRadius = 15;
  const titleHeight = 100;
  
  const ctxTemp = createCanvas(999, 999).getContext("2d");
  ctxTemp.font = "bold 24px BeVietnamPro";
  
  let totalHeight = titleHeight + 40;
  
  const allCommands = [];
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      allCommands.push(helpContent.allMembers[key]);
    }
  }
  
  const adminCommands = [];
  if (isAdminBox) {
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        adminCommands.push(helpContent.admin[key]);
      }
    }
  }
  
  const commandWidth = (width - padding * 2 - commandBoxMargin) / 2;
  
  totalHeight += Math.ceil(allCommands.length / 2) * 70;
  
  if (adminCommands.length > 0) {
    totalHeight += 80;
    totalHeight += Math.ceil(adminCommands.length / 2) * 70;
  }
  
  totalHeight += padding;
  
  const height = Math.max(totalHeight, 430);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  createHelpBackground(ctx, width, height);
  
  const titleText = toUpperCaseVietnamese(helpContent.title);
  ctx.font = "bold 36px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(titleText, width / 2, 60);
  
  const drawCommandBox = (command, description, x, y, w) => {
    roundRect(ctx, x, y, w, 55, borderRadius);
    ctx.fillStyle = "rgba(26, 58, 80, 0.6)";
    ctx.fill();
    
    ctx.strokeStyle = "rgba(100, 150, 200, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.textAlign = "left";
    ctx.font = "bold 24px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, w);
    ctx.fillText(command, x + commandBoxPadding, y + 35);
    
    ctx.textAlign = "right";
    ctx.font = "20px BeVietnamPro";
    ctx.fillStyle = "#E0E0E0";
    ctx.fillText(description, x + w - commandBoxPadding, y + 35);
  };
  
  let currentY = titleHeight + 40;
  
  for (let i = 0; i < allCommands.length; i++) {
    const cmd = allCommands[i];
    const commandText = `${cmd.icon} ${cmd.command}`;
    const descriptionText = cmd.description;
    
    const col = i % 2;
    const x = padding + col * (commandWidth + commandBoxMargin);
    
    drawCommandBox(commandText, descriptionText, x, currentY, commandWidth);
    
    if (col === 1 || i === allCommands.length - 1) {
      currentY += 70;
    }
  }
  
  if (adminCommands.length > 0) {
    currentY += 30;
    
    const adminTitleText = toUpperCaseVietnamese(helpContent.titleAdmin);
    ctx.font = "bold 32px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText(adminTitleText, width / 2, currentY);
    
    currentY += 50;
    
    for (let i = 0; i < adminCommands.length; i++) {
      const cmd = adminCommands[i];
      const commandText = `${cmd.icon} ${cmd.command}`;
      const descriptionText = cmd.description;
      
      const col = i % 2;
      const x = padding + col * (commandWidth + commandBoxMargin);
      
      drawCommandBox(commandText, descriptionText, x, currentY, commandWidth);
      
      if (col === 1 || i === adminCommands.length - 1) {
        currentY += 70;
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
