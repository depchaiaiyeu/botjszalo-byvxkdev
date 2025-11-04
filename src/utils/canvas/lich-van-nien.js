import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import axios from "axios";
import { createHelpBackground } from "./help.js";
import * as cv from "./index.js";

async function solarToLunar(dd, mm, yyyy) {
  try {
    const response = await axios.post('https://open.oapi.vn/date/convert-to-lunar', {
      day: dd,
      month: mm,
      year: yyyy
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.code === 'success' && response.data.data) {
      const data = response.data.data;
      return {
        day: data.day,
        month: data.month,
        year: data.year,
        heavenlyStems: data.heavenlyStems,
        earthlyBranches: data.earthlyBranches,
        sexagenaryCycle: data.sexagenaryCycle
      };
    }
  } catch (error) {
    console.error("Error converting to lunar:", error);
  }
  return null;
}

async function lunarToSolar(dd, mm, yyyy) {
  try {
    const response = await axios.post('https://open.oapi.vn/date/convert-to-solar', {
      day: dd,
      month: mm,
      year: yyyy
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.code === 'success' && response.data.data) {
      const data = response.data.data;
      const dateParts = data.date.split('T')[0].split('-');
      return new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    }
  } catch (error) {
    console.error("Error converting to solar:", error);
  }
  return null;
}

function jdFromDate(dd, mm, yyyy) {
  const a = Math.floor((14 - mm) / 12);
  const y = yyyy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jd;
}

function getGioHoangDao(dd, mm, yyyy) {
  const chiOfDay = (jdFromDate(dd, mm, yyyy) + 1) % 12;
  const gioHD = [
    [0, 2, 4, 10],
    [1, 3, 9, 11],
    [0, 6, 8, 10],
    [1, 3, 7, 9],
    [2, 4, 8, 10],
    [1, 5, 7, 11],
    [0, 2, 6, 8],
    [3, 5, 9, 11],
    [0, 4, 6, 10],
    [1, 3, 7, 9],
    [2, 4, 8, 10],
    [1, 5, 7, 11]
  ];
  const gioNames = ["Tý (23:00-0:59)", "Sửu (1:00-2:59)", "Dần (3:00-4:59)", "Mão (5:00-6:59)", "Thìn (7:00-8:59)", "Tỵ (9:00-10:59)", "Ngọ (11:00-12:59)", "Mùi (13:00-14:59)", "Thân (15:00-16:59)", "Dậu (17:00-18:59)", "Tuất (19:00-20:59)", "Hợi (21:00-22:59)"];
  return gioHD[chiOfDay].map(i => gioNames[i]);
}

function getGioHacDao(dd, mm, yyyy) {
  const chiOfDay = (jdFromDate(dd, mm, yyyy) + 1) % 12;
  const gioHacDao = [
    [1, 3, 5, 6, 7, 8, 9, 11],
    [0, 2, 4, 5, 6, 7, 8, 10],
    [1, 2, 3, 5, 7, 9, 11],
    [0, 2, 4, 5, 6, 8, 10, 11],
    [0, 1, 3, 5, 6, 7, 9, 11],
    [0, 2, 3, 4, 6, 8, 9, 10],
    [1, 3, 4, 5, 7, 9, 10, 11],
    [0, 1, 2, 4, 6, 7, 8, 10],
    [1, 2, 3, 5, 7, 8, 9, 11],
    [0, 2, 4, 5, 6, 8, 10, 11],
    [0, 1, 3, 5, 6, 7, 9, 11],
    [0, 2, 3, 4, 6, 8, 9, 10]
  ];
  const all = ["Tý (23:00-0:59)", "Sửu (1:00-2:59)", "Dần (3:00-4:59)", "Mão (5:00-6:59)", "Thìn (7:00-8:59)", "Tỵ (9:00-10:59)", "Ngọ (11:00-12:59)", "Mùi (13:00-14:59)", "Thân (15:00-16:59)", "Dậu (17:00-18:59)", "Tuất (19:00-20:59)", "Hợi (21:00-22:59)"];
  return gioHacDao[chiOfDay].map(i => all[i]);
}

function getHuongXuatHanh(dd, mm, yyyy) {
  const chiOfDay = (jdFromDate(dd, mm, yyyy) + 1) % 12;
  const huongMap = [
    "Xuất hành hướng Chính Nam để đón 'Hỷ Thần' Xuất hành hướng Chính Đông để đón 'Tài Thần' Tránh xuất hành hướng Chính Tây gặp Hắc Thần (xấu)",
    "Xuất hành hướng Đông Nam để đón 'Hỷ Thần' Xuất hành hướng Nam để đón 'Tài Thần' Tránh xuất hành hướng Bắc gặp Hắc Thần (xấu)",
    "Xuất hành hướng Đông Bắc để đón 'Hỷ Thần' Xuất hành hướng Đông Nam để đón 'Tài Thần' Tránh xuất hành hướng Nam gặp Hắc Thần (xấu)",
    "Xuất hành hướng Tây Bắc để đón 'Hỷ Thần' Xuất hành hướng Đông để đón 'Tài Thần' Tránh xuất hành hướng Đông gặp Hắc Thần (xấu)",
    "Xuất hành hướng Tây Nam để đón 'Hỷ Thần' Xuất hành hướng Bắc để đón 'Tài Thần' Tránh xuất hành hướng Đông Nam gặp Hắc Thần (xấu)",
    "Xuất hành hướng Chính Nam để đón 'Hỷ Thần' Xuất hành hướng Chính Bắc để đón 'Tài Thần' Tránh xuất hành hướng Chính Bắc gặp Hắc Thần (xấu)",
    "Xuất hành hướng Đông Nam để đón 'Hỷ Thần' Xuất hành hướng Tây Nam để đón 'Tài Thần' Tránh xuất hành hướng Tây gặp Hắc Thần (xấu)",
    "Xuất hành hướng Đông Bắc để đón 'Hỷ Thần' Xuất hành hướng Nam để đón 'Tài Thần' Tránh xuất hành hướng Tây Bắc gặp Hắc Thần (xấu)",
    "Xuất hành hướng Tây Bắc để đón 'Hỷ Thần' Xuất hành hướng Đông Nam để đón 'Tài Thần' Tránh xuất hành hướng Tây Nam gặp Hắc Thần (xấu)",
    "Xuất hành hướng Tây Nam để đón 'Hỷ Thần' Xuất hành hướng Đông để đón 'Tài Thần' Tránh xuất hành hướng Nam gặp Hắc Thần (xấu)",
    "Xuất hành hướng Chính Nam để đón 'Hỷ Thần' Xuất hành hướng Bắc để đón 'Tài Thần' Tránh xuất hành hướng Đông gặp Hắc Thần (xấu)",
    "Xuất hành hướng Đông Nam để đón 'Hỷ Thần' Xuất hành hướng Tây Nam để đón 'Tài Thần' Tránh xuất hành hướng Đông Nam gặp Hắc Thần (xấu)"
  ];
  return huongMap[chiOfDay];
}

async function getVietnameseHolidays(year) {
  const holidays = [];
  
  holidays.push({ name: "Tết Dương lịch", date: new Date(year, 0, 1) });
  holidays.push({ name: "Ngày thành lập Đảng", date: new Date(year, 1, 3) });
  holidays.push({ name: "Ngày Giải phóng miền Nam", date: new Date(year, 3, 30) });
  holidays.push({ name: "Ngày Quốc tế Lao động", date: new Date(year, 4, 1) });
  holidays.push({ name: "Sinh nhật Bác Hồ", date: new Date(year, 4, 19) });
  holidays.push({ name: "Ngày Quốc khánh", date: new Date(year, 8, 2) });
  holidays.push({ name: "Ngày Phụ nữ Việt Nam", date: new Date(year, 9, 20) });
  holidays.push({ name: "Ngày Nhà giáo Việt Nam", date: new Date(year, 10, 20) });
  holidays.push({ name: "Ngày hội Quốc phòng Toàn dân", date: new Date(year, 11, 22) });
  holidays.push({ name: "Giáng sinh", date: new Date(year, 11, 25) });
  holidays.push({ name: "Ngày Quốc tế Phụ nữ", date: new Date(year, 2, 8) });
  holidays.push({ name: "Ngày Thương binh Liệt sĩ", date: new Date(year, 6, 27) });
  holidays.push({ name: "Ngày Gia đình Việt Nam", date: new Date(year, 5, 28) });
  
  const tetTrungThu = await lunarToSolar(15, 8, year);
  if (tetTrungThu) holidays.push({ name: "Tết Trung thu", date: tetTrungThu });
  
  const tetDoanNgo = await lunarToSolar(5, 5, year);
  if (tetDoanNgo) holidays.push({ name: "Tết Đoan Ngọ", date: tetDoanNgo });
  
  const ramThangGieng = await lunarToSolar(15, 1, year);
  if (ramThangGieng) holidays.push({ name: "Rằm tháng Giêng", date: ramThangGieng });
  
  const tetHanThuc = await lunarToSolar(3, 3, year);
  if (tetHanThuc) holidays.push({ name: "Tết Hàn thực", date: tetHanThuc });
  
  const vuLan = await lunarToSolar(15, 7, year);
  if (vuLan) holidays.push({ name: "Vu Lan", date: vuLan });
  
  const ongTao = await lunarToSolar(23, 12, year);
  if (ongTao) holidays.push({ name: "Ông Táo chầu trời", date: ongTao });
  
  const tetDate = await lunarToSolar(1, 1, year);
  if (tetDate) {
    holidays.push({ name: "Tết Nguyên Đán", date: tetDate });
    const tet2 = new Date(tetDate);
    tet2.setDate(tet2.getDate() + 1);
    holidays.push({ name: "Mùng 2 Tết", date: tet2 });
    const tet3 = new Date(tetDate);
    tet3.setDate(tet3.getDate() + 2);
    holidays.push({ name: "Mùng 3 Tết", date: tet3 });
  }
  
  return holidays.filter(h => h.date !== null);
}

async function getUpcomingHolidays(currentDate) {
  const year = currentDate.getFullYear();
  let holidays = await getVietnameseHolidays(year);
  const nextYearHolidays = await getVietnameseHolidays(year + 1);
  holidays = holidays.concat(nextYearHolidays);
  
  const upcoming = holidays
    .map(h => ({ ...h, days: Math.ceil((h.date - currentDate) / (1000 * 60 * 60 * 24)) }))
    .filter(h => h.days > 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  
  return upcoming;
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(month, year) {
  return new Date(year, month - 1, 1).getDay();
}

async function createMonthCalendarImage(month, year) {
  const width = 1300;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  createHelpBackground(ctx, width, height);

  const monthNames = ["THÁNG 1", "THÁNG 2", "THÁNG 3", "THÁNG 4", "THÁNG 5", "THÁNG 6", "THÁNG 7", "THÁNG 8", "THÁNG 9", "THÁNG 10", "THÁNG 11", "THÁNG 12"];
  const dayNames = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];

  ctx.fillStyle = "#4CAF50";
  ctx.fillRect(0, 0, width, 100);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 48px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${monthNames[month - 1]} - ${year}`, width / 2, 65);

  const startY = 130;
  const cellWidth = (width - 40) / 7;
  const cellHeight = 140;

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 20px 'BeVietnamPro', Arial";
  for (let i = 0; i < 7; i++) {
    ctx.fillText(dayNames[i], 20 + cellWidth * i + cellWidth / 2, startY);
  }

  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 2;

  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);
  const startDayIndex = firstDay === 0 ? 6 : firstDay - 1;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevMonth, prevYear);

  const holidays = await getVietnameseHolidays(year);
  const holidayMap = {};
  holidays.forEach(h => {
    const key = `${h.date.getDate()}-${h.date.getMonth() + 1}`;
    holidayMap[key] = h.name;
  });

  let currentRow = 0;
  let currentCol = 0;

  for (let i = 0; i < startDayIndex; i++) {
    const day = daysInPrevMonth - startDayIndex + i + 1;
    const x = 20 + currentCol * cellWidth;
    const y = startY + 20 + currentRow * cellHeight;

    ctx.strokeRect(x, y, cellWidth, cellHeight);

    ctx.fillStyle = "rgba(200, 200, 200, 0.5)";
    ctx.font = "bold 32px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(day, x + 15, y + 45);

    const lunar = await solarToLunar(day, prevMonth, prevYear);
    if (lunar) {
      ctx.fillStyle = "rgba(150, 150, 150, 0.7)";
      ctx.font = "16px 'BeVietnamPro', Arial";
      ctx.fillText(`${lunar.day}/${lunar.month}`, x + 15, y + 75);

      ctx.font = "14px 'BeVietnamPro', Arial";
      ctx.fillText(`Ngày ${lunar.sexagenaryCycle}`, x + 15, y + 95);
    }

    currentCol++;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const x = 20 + currentCol * cellWidth;
    const y = startY + 20 + currentRow * cellHeight;

    ctx.strokeRect(x, y, cellWidth, cellHeight);

    const isWeekend = currentCol === 5 || currentCol === 6;
    const holidayKey = `${day}-${month}`;
    const hasHoliday = holidayMap[holidayKey];

    ctx.fillStyle = hasHoliday || isWeekend ? "#FF0000" : "#000000";
    ctx.font = "bold 32px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(day, x + 15, y + 45);

    const lunar = await solarToLunar(day, month, year);
    if (lunar) {
      ctx.fillStyle = "#666666";
      ctx.font = "16px 'BeVietnamPro', Arial";
      ctx.fillText(`${lunar.day}/${lunar.month}`, x + 15, y + 75);

      ctx.font = "14px 'BeVietnamPro', Arial";
      ctx.fillText(`Ngày ${lunar.sexagenaryCycle}`, x + 15, y + 95);
    }

    if (hasHoliday) {
      ctx.fillStyle = "#FF0000";
      ctx.font = "bold 14px 'BeVietnamPro', Arial";
      const lines = wrapText(ctx, hasHoliday, cellWidth - 30);
      lines.forEach((line, idx) => {
        ctx.fillText(line, x + 15, y + 115 + idx * 16);
      });
    }

    currentCol++;
    if (currentCol === 7) {
      currentCol = 0;
      currentRow++;
    }
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let nextDay = 1;

  while (currentRow < 5) {
    const x = 20 + currentCol * cellWidth;
    const y = startY + 20 + currentRow * cellHeight;

    ctx.strokeRect(x, y, cellWidth, cellHeight);

    ctx.fillStyle = "rgba(200, 200, 200, 0.5)";
    ctx.font = "bold 32px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(nextDay, x + 15, y + 45);

    const lunar = await solarToLunar(nextDay, nextMonth, nextYear);
    if (lunar) {
      ctx.fillStyle = "rgba(150, 150, 150, 0.7)";
      ctx.font = "16px 'BeVietnamPro', Arial";
      ctx.fillText(`${lunar.day}/${lunar.month}`, x + 15, y + 75);

      ctx.font = "14px 'BeVietnamPro', Arial";
      ctx.fillText(`Ngày ${lunar.sexagenaryCycle}`, x + 15, y + 95);
    }

    nextDay++;
    currentCol++;
    if (currentCol === 7) {
      currentCol = 0;
      currentRow++;
    }
  }

  const filePath = path.resolve(`./assets/temp/calendar_month_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}

export async function createCalendarImage(month, isMonth) {
  if (isMonth && month) {
    const year = new Date().getFullYear();
    return await createMonthCalendarImage(month, year);
  }

  const width = 900;
  const height = 1600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  createHelpBackground(ctx, width, height);

  const now = new Date();
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
  
  const dayName = dayNames[now.getDay()];
  const dd = now.getDate();
  const mm = now.getMonth() + 1;
  const yyyy = now.getFullYear();
  const lunar = await solarToLunar(dd, mm, yyyy);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeStr = `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}`;

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.roundRect(45, 80, width - 90, 380, 20);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${dayName}, Ngày ${dd} ${monthNames[mm - 1]} Năm ${yyyy}`, width / 2, 140);

  ctx.font = "bold 120px 'BeVietnamPro', Arial";
  const timeGradient = ctx.createLinearGradient(200, 220, 700, 220);
  timeGradient.addColorStop(0, "#66FFCC");
  timeGradient.addColorStop(0.3, "#99FF99");
  timeGradient.addColorStop(0.5, "#99CCFF");
  timeGradient.addColorStop(0.7, "#FFFF99");
  timeGradient.addColorStop(1, "#FFCC99");
  ctx.fillStyle = timeGradient;
  ctx.fillText(timeStr, width / 2, 280);

  if (lunar) {
    ctx.font = "bold 28px 'BeVietnamPro', Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`Âm Lịch - ${lunar.day < 10 ? '0' : ''}${lunar.day}/${lunar.month < 10 ? '0' : ''}${lunar.month}/${lunar.year}`, width / 2, 340);

    ctx.font = "22px 'BeVietnamPro', Arial";
    const canChiText = `Ngày ${lunar.sexagenaryCycle}`;
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText(canChiText, width / 2, 390);
  }

  const holidays = await getUpcomingHolidays(now);
  let yPos = 520;
  
  holidays.forEach(holiday => {
    const boxH = 70;
    const radius = 12;
    
    ctx.beginPath();
    ctx.moveTo(45 + radius, yPos);
    ctx.lineTo(width - 45 - radius, yPos);
    ctx.quadraticCurveTo(width - 45, yPos, width - 45, yPos + radius);
    ctx.lineTo(width - 45, yPos + boxH - radius);
    ctx.quadraticCurveTo(width - 45, yPos + boxH, width - 45 - radius, yPos + boxH);
    ctx.lineTo(45 + radius, yPos + boxH);
    ctx.quadraticCurveTo(45, yPos + boxH, 45, yPos + boxH - radius);
    ctx.lineTo(45, yPos + radius);
    ctx.quadraticCurveTo(45, yPos, 45 + radius, yPos);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(45 + radius, yPos);
    ctx.lineTo(45 + 190, yPos);
    ctx.lineTo(45 + 190, yPos + boxH);
    ctx.lineTo(45 + radius, yPos + boxH);
    ctx.quadraticCurveTo(45, yPos + boxH, 45, yPos + boxH - radius);
    ctx.lineTo(45, yPos + radius);
    ctx.quadraticCurveTo(45, yPos, 45 + radius, yPos);
    ctx.closePath();
    ctx.fillStyle = "#FFA500";
    ctx.fill();
    
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px 'BeVietnamPro', Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${holiday.days} ngày nữa`, 140, yPos + 42);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(holiday.name, 250, yPos + 44);

    yPos += boxH + 12;
  });

  const gioHD = getGioHoangDao(dd, mm, yyyy);
  const gioHacDao = getGioHacDao(dd, mm, yyyy);

  yPos += 20;
  
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 140, 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fill();

  const hdGradient = ctx.createLinearGradient(0, yPos, width, yPos);
  hdGradient.addColorStop(0, "#FFE66D");
  hdGradient.addColorStop(0.5, "#4ECDC4");
  hdGradient.addColorStop(1, "#44CFCB");
  ctx.fillStyle = hdGradient;
  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText("Giờ Hoàng Đạo", width / 2, yPos + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  const gioHDText1 = `${gioHD[0]}    ${gioHD[1]}    ${gioHD[2]}`;
  const gioHDText2 = `${gioHD[3] || ''}`;
  ctx.fillText(gioHDText1, width / 2, yPos + 80);
  if (gioHD[3]) {
    ctx.fillText(gioHDText2, width / 2, yPos + 110);
  }

  yPos += 160;
  
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 160, 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fill();

  const hacGradient = ctx.createLinearGradient(0, yPos, width, yPos);
  hacGradient.addColorStop(0, "#FF6B6B");
  hacGradient.addColorStop(1, "#FF8E53");
  ctx.fillStyle = hacGradient;
  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText("Giờ Hắc Đạo", width / 2, yPos + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px 'BeVietnamPro', Arial";
  const gioHacText1 = `${gioHacDao[0]}  ${gioHacDao[1]}  ${gioHacDao[2]}`;
  const gioHacText2 = `${gioHacDao[3]}  ${gioHacDao[4]}  ${gioHacDao[5]}`;
  const gioHacText3 = `${gioHacDao[6] || ''}  ${gioHacDao[7] || ''}`;
  ctx.fillText(gioHacText1, width / 2, yPos + 75);
  ctx.fillText(gioHacText2, width / 2, yPos + 105);
  if (gioHacDao[6]) {
    ctx.fillText(gioHacText3, width / 2, yPos + 135);
  }

  yPos += 180;
  const huongXuatHanh = getHuongXuatHanh(dd, mm, yyyy);
  
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 180, 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fill();

  const huongGradient = ctx.createLinearGradient(0, yPos, width, yPos);
  huongGradient.addColorStop(0, "#FFD93D");
  huongGradient.addColorStop(1, "#FFAA33");
  ctx.fillStyle = huongGradient;
  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText("Hướng xuất hành", width / 2, yPos + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px 'BeVietnamPro', Arial";
  ctx.textAlign = "left";
  const maxWidth = width - 130;
  const lineHeight = 24;
  const words = huongXuatHanh.split(' ');
  let line = '';
  let y = yPos + 75;
  
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, 70, y);
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 70, y);

  const filePath = path.resolve(`./assets/temp/calendar_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function clearImagePath(pathFile) {
  try {
    await fsPromises.unlink(pathFile);
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}
