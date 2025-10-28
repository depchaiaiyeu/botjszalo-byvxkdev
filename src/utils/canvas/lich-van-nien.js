import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import axios from "axios";

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
  const lunar = await solarToLunar(dd, mm, yyyy);

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

  if (lunar) {
    ctx.font = "bold 28px 'BeVietnamPro', Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`Âm Lịch - ${lunar.day < 10 ? '0' : ''}${lunar.day}/${lunar.month < 10 ? '0' : ''}${lunar.month}/${lunar.year}`, width / 2, 340);

    ctx.font = "22px 'BeVietnamPro', Arial";
    const canChiText = `Ngày ${lunar.sexagenaryCycle}`;
    ctx.fillStyle = gradient;
    ctx.fillText(canChiText, width / 2, 390);
  }

  const holidays = await getUpcomingHolidays(now);
  let yPos = 520;
  
  holidays.forEach(holiday => {
    const boxH = 80;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(45, yPos, width - 90, boxH, 12);
    ctx.fill();

    ctx.fillStyle = "#FFA500";
    ctx.font = "bold 24px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${holiday.days} ngày nữa`, 70, yPos + 32);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px 'BeVietnamPro', Arial";
    ctx.textAlign = "left";
    ctx.fillText(holiday.name, 70, yPos + 65);

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
