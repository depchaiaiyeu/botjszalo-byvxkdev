import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import axios from "axios";

function solarToLunar(dd, mm, yyyy) {
  const k = Math.floor((yyyy - 2000) * 12.3685);
  const jd = jdFromDate(dd, mm, yyyy);
  
  for (let i = k - 2; i < k + 3; i++) {
    const a11 = getNewMoonDay(i);
    const b11 = getNewMoonDay(i + 1);
    if (jd >= a11 && jd < b11) {
      const lunarDay = jd - a11 + 1;
      const lunarMonth = Math.floor((a11 - 2415021.076998695) / 29.530588853) % 12 + 1;
      let lunarYear = yyyy;
      
      if (mm < 3) {
        lunarYear = yyyy - 1;
      }
      
      return { 
        day: Math.floor(lunarDay), 
        month: lunarMonth > 12 ? lunarMonth - 12 : (lunarMonth < 1 ? lunarMonth + 12 : lunarMonth), 
        year: lunarYear, 
        leap: 0 
      };
    }
  }
  
  return { day: dd, month: mm, year: yyyy, leap: 0 };
}

function jdFromDate(dd, mm, yyyy) {
  const a = Math.floor((14 - mm) / 12);
  const y = yyyy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jd;
}

function getNewMoonDay(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = (Jd1 < 2299160) ? 0.001 : (Jd1 < 2382148) ? 0.001 : 0;
  const JdNew = Jd1 + C1 - deltat;
  return Math.floor(JdNew + 0.5);
}

function getSunLongitude(k, timeZone) {
  const T = k / 1236.85;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
  return Math.floor(L / Math.PI * 6);
}

function getCanChi(lunar) {
  const can = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
  const chi = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
  return `${can[(lunar.year + 6) % 10]} ${chi[(lunar.year + 8) % 12]}`;
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
  const gioNames = ["Dần (3:00-4:59)", "Thìn (7:00-8:59)", "Tỵ (9:00-10:59)", "Mùi (13:00-14:59)", "Thân (15:00-16:59)", "Tuất (19:00-20:59)", "Hợi (21:00-22:59)"];
  const all = ["Tý (23:00-0:59)", "Sửu (1:00-2:59)", "Dần (3:00-4:59)", "Mão (5:00-6:59)", "Thìn (7:00-8:59)", "Tỵ (9:00-10:59)", "Ngọ (11:00-12:59)", "Mùi (13:00-14:59)", "Thân (15:00-16:59)", "Dậu (17:00-18:59)", "Tuất (19:00-20:59)", "Hợi (21:00-22:59)"];
  return gioHacDao[chiOfDay].map(i => all[i]);
}

function getHuongXuatHanh(lunar) {
  const huongXH = [
    "Xuất hành hướng Tây Bắc để đón 'Hỷ Thần' Xuất hành hướng Tây Nam để đón 'Tài Thần' Tránh xuất hành hướng Chính Nam gặp Hạc Thần (xấu)",
    "Xuất hành hướng Tây Nam để đón 'Hỷ Thần' Xuất hành hướng Tây Nam để đón 'Tài Thần' Tránh xuất hành hướng Đông Nam gặp Hạc Thần (xấu)",
    "Xuất hành hướng Chính Nam để đón 'Hỷ Thần' Xuất hành hướng Chính Tây để đón 'Tài Thần' Tránh xuất hành hướng Chính Đông gặp Hạc Thần (xấu)",
    "Xuất hành hướng Đông Nam để đón 'Hỷ Thần' Xuất hành hướng Chính Tây để đón 'Tài Thần' Tránh xuất hành hướng Đông Bắc gặp Hạc Thần (xấu)",
    "Xuất hành hướng Đông Bắc để đón 'Hỷ Thần' Xuất hành hướng Chính Bắc để đón 'Tài Thần' Tránh xuất hành hướng Tây Bắc gặp Hạc Thần (xấu)",
    "Xuất hành hướng Tây Bắc để đón 'Hỷ Thần' Xuất hành hướng Đông Bắc để đón 'Tài Thần' Tránh xuất hành hướng Chính Tây gặp Hạc Thần (xấu)",
    "Xuất hành hướng Tây Nam để đón 'Hỷ Thần' Xuất hành hướng Đông Nam để đón 'Tài Thần' Tránh xuất hành hướng Chính Bắc gặp Hạc Thần (xấu)",
    "Xuất hành hướng Chính Nam để đón 'Hỷ Thần' Xuất hành hướng Đông Nam để đón 'Tài Thần' Tránh xuất hành hướng Tây Nam gặp Hạc Thần (xấu)",
    "Xuất hành hướng Đông Nam để đón 'Hỷ Thần' Xuất hành hướng Chính Nam để đón 'Tài Thần' Tránh xuất hành hướng Chính Nam gặp Hạc Thần (xấu)",
    "Xuất hành hướng Đông Bắc để đón 'Hỷ Thần' Xuất hành hướng Chính Bắc để đón 'Tài Thần' Tránh xuất hành hướng Đông Nam gặp Hạc Thần (xấu)"
  ];
  return huongXH[(lunar.year + 6) % 10];
}

function getLunarDateFromSolar(targetYear, lunarMonth, lunarDay) {
  const startDate = new Date(targetYear - 1, 11, 1);
  const endDate = new Date(targetYear + 1, 1, 31);
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const lunar = solarToLunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
    if (lunar.month === lunarMonth && lunar.day === lunarDay) {
      return new Date(d);
    }
  }
  return null;
}

function getVietnameseHolidays(year) {
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
  holidays.push({ name: "Tết Trung thu", date: getLunarDateFromSolar(year, 8, 15) });
  holidays.push({ name: "Tết Đoan Ngọ", date: getLunarDateFromSolar(year, 5, 5) });
  holidays.push({ name: "Rằm tháng Giêng", date: getLunarDateFromSolar(year, 1, 15) });
  holidays.push({ name: "Tết Hàn thực", date: getLunarDateFromSolar(year, 3, 3) });
  holidays.push({ name: "Vu Lan", date: getLunarDateFromSolar(year, 7, 15) });
  holidays.push({ name: "Ông Táo chầu trời", date: getLunarDateFromSolar(year, 12, 23) });
  
  const tetDate = getLunarDateFromSolar(year, 1, 1);
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

function getUpcomingHolidays(currentDate) {
  const year = currentDate.getFullYear();
  let holidays = getVietnameseHolidays(year);
  holidays = holidays.concat(getVietnameseHolidays(year + 1));
  
  const upcoming = holidays
    .map(h => ({ ...h, days: Math.ceil((h.date - currentDate) / (1000 * 60 * 60 * 24)) }))
    .filter(h => h.days > 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  
  return upcoming;
}

async function getRandomLandscapeImage() {
  try {
    const response = await axios.get('https://vi.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        format: 'json',
        generator: 'random',
        grnnamespace: 6,
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: 1400,
        grnlimit: 10
      },
      timeout: 5000
    });
    
    const pages = response.data.query?.pages;
    if (pages) {
      const images = Object.values(pages)
        .filter(p => p.imageinfo && p.imageinfo[0].thumburl)
        .map(p => p.imageinfo[0].thumburl);
      
      if (images.length > 0) {
        return images[Math.floor(Math.random() * images.length)];
      }
    }
  } catch (error) {
    console.error("Error fetching Wikipedia image:", error);
  }
  return null;
}

export async function createCalendarImage() {
  const width = 900;
  const height = 1400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgImageUrl = await getRandomLandscapeImage();
  if (bgImageUrl) {
    try {
      const bgImage = await loadImage(bgImageUrl);
      ctx.drawImage(bgImage, 0, 0, width, height);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, width, height);
    } catch {
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#0F2027");
      bg.addColorStop(0.5, "#203A43");
      bg.addColorStop(1, "#2C5364");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0F2027");
    bg.addColorStop(0.5, "#203A43");
    bg.addColorStop(1, "#2C5364");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  const now = new Date();
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
  
  const dayName = dayNames[now.getDay()];
  const dd = now.getDate();
  const mm = now.getMonth() + 1;
  const yyyy = now.getFullYear();
  const lunar = solarToLunar(dd, mm, yyyy);
  const canChi = getCanChi(lunar);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeStr = `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}`;

  const boxGradient = ctx.createLinearGradient(0, 80, 0, 460);
  boxGradient.addColorStop(0, "rgba(0, 0, 0, 0.7)");
  boxGradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = boxGradient;
  ctx.beginPath();
  ctx.roundRect(45, 80, width - 90, 380, 20);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${dayName}, Ngày ${dd} ${monthNames[mm - 1]} Năm ${yyyy}`, width / 2, 140);

  ctx.font = "bold 120px 'BeVietnamPro', Arial";
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#4ECB71");
  gradient.addColorStop(1, "#1E90FF");
  ctx.fillStyle = gradient;
  ctx.fillText(timeStr, width / 2, 280);

  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`Âm Lịch - ${lunar.day < 10 ? '0' : ''}${lunar.day}/${lunar.month < 10 ? '0' : ''}${lunar.month}/${lunar.year}`, width / 2, 340);

  ctx.font = "22px 'BeVietnamPro', Arial";
  const canChiText = `Ngày ${canChi}`;
  ctx.fillStyle = gradient;
  ctx.fillText(canChiText, width / 2, 390);

  const holidays = getUpcomingHolidays(now);
  let yPos = 520;
  
  holidays.forEach(holiday => {
    const boxH = 75;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(45, yPos, width - 90, boxH, 12);
    ctx.fill();

    ctx.fillStyle = "#FFA500";
    ctx.font = "bold 24px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${holiday.days} ngày nữa`, 70, yPos + 35);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(holiday.name, 70, yPos + 63);

    yPos += boxH + 15;
  });

  const gioHD = getGioHoangDao(dd, mm, yyyy);
  const gioHacDao = getGioHacDao(dd, mm, yyyy);

  yPos += 20;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 180, 12);
  ctx.fill();

  const hdGradient = ctx.createLinearGradient(0, yPos, width, yPos);
  hdGradient.addColorStop(0, "#4ECB71");
  hdGradient.addColorStop(1, "#1E90FF");
  ctx.fillStyle = hdGradient;
  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText("Giờ Hoàng Đạo", width / 2, yPos + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  const gioHDText1 = `${gioHD[0]}    ${gioHD[1]}`;
  const gioHDText2 = `${gioHD[2]}    ${gioHD[3] || ''}`;
  ctx.fillText(gioHDText1, width / 2, yPos + 80);
  ctx.fillText(gioHDText2, width / 2, yPos + 110);

  yPos += 200;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 200, 12);
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
  const gioHacText3 = `${gioHacDao[6] || ''}`;
  ctx.fillText(gioHacText1, width / 2, yPos + 80);
  ctx.fillText(gioHacText2, width / 2, yPos + 110);
  ctx.fillText(gioHacText3, width / 2, yPos + 140);

  yPos += 220;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(45, yPos, width - 90, 140, 12);
  ctx.fill();

  const xuatHanhGradient = ctx.createLinearGradient(0, yPos, width, yPos);
  xuatHanhGradient.addColorStop(0, "#FFD700");
  xuatHanhGradient.addColorStop(1, "#FFA500");
  ctx.fillStyle = xuatHanhGradient;
  ctx.font = "bold 28px 'BeVietnamPro', Arial";
  ctx.textAlign = "center";
  ctx.fillText("Hướng xuất hành", width / 2, yPos + 40);

  const huongXH = getHuongXuatHanh(lunar);
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px 'BeVietnamPro', Arial";
  ctx.textAlign = "left";
  const lines = huongXH.split(' Xuất hành');
  let lineY = yPos + 75;
  lines.forEach((line, idx) => {
    if (idx > 0) line = 'Xuất hành' + line;
    if (line.trim()) {
      ctx.fillText(line.trim(), 70, lineY);
      lineY += 25;
    }
  });

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
