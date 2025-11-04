import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import { createHelpBackground } from "./help.js";
import * as cv from "./index.js";

function INT(x) {
  return Math.floor(x);
}

function jdFromDate(dd, mm, yyyy) {
  const a = INT((14 - mm) / 12);
  const y = yyyy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function jdToDate(jd) {
  let a, b, c, d, e, m, day, month, year;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  d = INT((4 * c + 3) / 1461);
  e = c - INT(1461 * d / 4);
  m = INT((5 * e + 2) / 153);
  day = e - INT((153 * m + 2) / 5) + 1;
  month = m + 3 - 12 * INT(m / 10);
  year = b * 100 + d - 4800 + INT(m / 10);
  return [day, month, year];
}

function getNewMoonDay(k, timeZone) {
  let T = k / 1236.85;
  let T2 = T * T;
  let T3 = T2 * T;
  let dr = Math.PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  let Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat;
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  let JdNew = Jd1 + C1 - deltat;
  return INT(JdNew + 0.5 + timeZone / 24);
}

function getSunLongitude(jdn, timeZone) {
  let T = (jdn - 2451545.5 - timeZone / 24) / 36525;
  let T2 = T * T;
  let dr = Math.PI / 180;
  let M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  let L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - Math.PI * 2 * (INT(L / (Math.PI * 2)));
  return INT(L / Math.PI * 6);
}

function getLunarMonth11(yy, timeZone) {
  let off = jdFromDate(31, 12, yy) - 2415021;
  let k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  let sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11, timeZone) {
  let k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc != last && i < 14);
  return i - 1;
}

function convertSolar2Lunar(dd, mm, yyyy, timeZone) {
  let dayNumber = jdFromDate(dd, mm, yyyy);
  let k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }
  let a11 = getLunarMonth11(yyyy, timeZone);
  let b11 = a11;
  if (a11 >= monthStart) {
    let lunarYear = yyyy;
    a11 = getLunarMonth11(yyyy - 1, timeZone);
  } else {
    let lunarYear = yyyy + 1;
    b11 = getLunarMonth11(yyyy + 1, timeZone);
  }
  let lunarDay = dayNumber - monthStart + 1;
  let diff = INT((monthStart - a11) / 29);
  let lunarLeap = 0;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    let leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff == leapMonthDiff) {
        lunarLeap = 1;
      }
    }
  }
  if (lunarMonth > 12) {
    lunarMonth = lunarMonth - 12;
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}

function convertLunar2Solar(lunarDay, lunarMonth, lunarYear, lunarLeap, timeZone) {
  let a11, b11, off, leapOff, leapMonth, monthStart;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone);
    b11 = getLunarMonth11(lunarYear, timeZone);
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone);
    b11 = getLunarMonth11(lunarYear + 1, timeZone);
  }
  off = lunarMonth - 11;
  if (off < 0) {
    off += 12;
  }
  if (b11 - a11 > 365) {
    leapOff = getLeapMonthOffset(a11, timeZone);
    leapMonth = leapOff - 2;
    if (leapMonth < 0) {
      leapMonth += 12;
    }
    if (lunarLeap != 0 && lunarMonth != leapMonth) {
      return [0, 0, 0];
    } else if (lunarLeap != 0 || off >= leapOff) {
      off += 1;
    }
  }
  let k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  monthStart = getNewMoonDay(k + off, timeZone);
  return jdToDate(monthStart + lunarDay - 1);
}

function solarToLunar(dd, mm, yyyy) {
  const timeZone = 7;
  const res = convertSolar2Lunar(dd, mm, yyyy, timeZone);
  const lunarDay = res[0];
  const lunarMonth = res[1];
  const lunarYear = res[2];
  const heavenlyStems = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
  const earthlyBranches = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
  const jd = jdFromDate(dd, mm, yyyy);
  const dayCanIndex = (jd + 9) % 10;
  const dayChiIndex = (jd + 1) % 12;
  const sexagenaryCycle = heavenlyStems[dayCanIndex] + earthlyBranches[dayChiIndex];
  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    heavenlyStems: heavenlyStems[dayCanIndex],
    earthlyBranches: earthlyBranches[dayChiIndex],
    sexagenaryCycle: sexagenaryCycle
  };
}

function lunarToSolar(dd, mm, yyyy) {
  const timeZone = 7;
  const leap = 0;
  const res = convertLunar2Solar(dd, mm, yyyy, leap, timeZone);
  if (res[0] === 0) return null;
  return new Date(res[2], res[1] - 1, res[0]);
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
  let tetTrungThu = lunarToSolar(15, 8, year);
  if (tetTrungThu) holidays.push({ name: "Tết Trung thu", date: tetTrungThu });
  let tetDoanNgo = lunarToSolar(5, 5, year);
  if (tetDoanNgo) holidays.push({ name: "Tết Đoan Ngọ", date: tetDoanNgo });
  let ramThangGieng = lunarToSolar(15, 1, year);
  if (ramThangGieng) holidays.push({ name: "Rằm tháng Giêng", date: ramThangGieng });
  let tetHanThuc = lunarToSolar(3, 3, year);
  if (tetHanThuc) holidays.push({ name: "Tết Hàn thực", date: tetHanThuc });
  let vuLan = lunarToSolar(15, 7, year);
  if (vuLan) holidays.push({ name: "Vu Lan", date: vuLan });
  let ongTao = lunarToSolar(23, 12, year);
  if (ongTao) holidays.push({ name: "Ông Táo chầu trời", date: ongTao });
  let tetDate = lunarToSolar(1, 1, year);
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
  const nextYearHolidays = getVietnameseHolidays(year + 1);
  holidays = holidays.concat(nextYearHolidays);
  const upcoming = holidays
    .map(h => ({ ...h, days: Math.ceil((h.date - currentDate) / (1000 * 60 * 60 * 24)) }))
    .filter(h => h.days > 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  return upcoming;
}

export async function createCalendarImage(month = null) {
  const width = 900;
  const height = 1600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  createHelpBackground(ctx, width, height);

  const now = new Date();
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

  if (month === null) {
    const dayName = dayNames[now.getDay()];
    const dd = now.getDate();
    const mm = now.getMonth() + 1;
    const yyyy = now.getFullYear();
    const lunar = solarToLunar(dd, mm, yyyy);

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

    const holidays = getUpcomingHolidays(now);
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
  } else {
    const year = now.getFullYear();
    const titleY = 80;
    ctx.fillStyle = "#4CAF50";
    ctx.beginPath();
    ctx.roundRect(45, titleY, width - 90, 60, 20);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px 'BeVietnamPro', Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${monthNames[month - 1]} - ${year}`, width / 2, titleY + 45);

    const headerY = titleY + 70;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.roundRect(45, headerY, width - 90, 50, 10);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.font = "bold 20px 'BeVietnamPro', Arial";
    const cellW = (width - 90) / 7;
    const dayHeaders = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
    for (let col = 0; col < 7; col++) {
      const x = 45 + col * cellW + cellW / 2;
      ctx.textAlign = "center";
      ctx.fillText(dayHeaders[col], x, headerY + 35);
    }

    const gridY = headerY + 60;
    const cellH = 220;
    const numRows = 6;

    const firstOfMonth = new Date(year, month - 1, 1);
    const dayOfWeek = firstOfMonth.getDay();
    const blanks = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prevMonthDaysNum = new Date(prevYear, prevMonth, 0).getDate();
    const startDayNum = prevMonthDaysNum - blanks + 1;
    let currentDate = new Date(prevYear, prevMonth - 1, startDayNum);

    let dates = [];
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < 7; col++) {
        const dateObj = new Date(currentDate);
        dates.push({
          date: dateObj,
          solarDay: dateObj.getDate(),
          solarMonth: dateObj.getMonth() + 1,
          solarYear: dateObj.getFullYear()
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    let holidays = getVietnameseHolidays(year);
    if (month === 1) {
      holidays = holidays.concat(getVietnameseHolidays(year - 1));
    }
    holidays = holidays.concat(getVietnameseHolidays(year + 1));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lunars = dates.map(d => solarToLunar(d.solarDay, d.solarMonth, d.solarYear));

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < 7; col++) {
        const idx = row * 7 + col;
        const cellDate = dates[idx].date;
        const isCurrentMonth = dates[idx].solarMonth === month;
        const isToday = cellDate.toDateString() === today.toDateString();
        const lunar = lunars[idx];
        const hasHoliday = holidays.some(h => h.date.toDateString() === cellDate.toDateString());
        const x = 45 + col * cellW;
        const y = gridY + row * cellH;

        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 10);
        let bgColor;
        if (!isCurrentMonth) {
          bgColor = "rgba(128, 128, 128, 0.2)";
        } else if (isToday) {
          bgColor = "#FFD700";
        } else if (hasHoliday) {
          bgColor = "#FFB6C1";
        } else {
          bgColor = "rgba(255, 255, 255, 0.05)";
        }
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isCurrentMonth ? "#000000" : "#666666";
        ctx.font = isCurrentMonth ? "bold 36px 'BeVietnamPro', Arial" : "24px 'BeVietnamPro', Arial";
        ctx.textAlign = "center";
        ctx.fillText(dates[idx].solarDay, x + cellW / 2, y + 50);

        if (lunar) {
          ctx.fillStyle = "#333333";
          ctx.font = "14px 'BeVietnamPro', Arial";
          const canChi = `Ngày ${lunar.sexagenaryCycle}`;
          ctx.fillText(canChi, x + cellW / 2, y + 80);

          ctx.fillStyle = "#FF0000";
          ctx.font = "bold 18px 'BeVietnamPro', Arial";
          const lunarStr = `${lunar.day < 10 ? '0' : ''}${lunar.day}/${lunar.month < 10 ? '0' : ''}${lunar.month}`;
          ctx.fillText(lunarStr, x + cellW / 2, y + 110);

          if (hasHoliday) {
            const holiday = holidays.find(h => h.date.toDateString() === cellDate.toDateString());
            ctx.fillStyle = "#000000";
            ctx.font = "12px 'BeVietnamPro', Arial";
            ctx.textAlign = "left";
            const maxW = cellW - 20;
            const words = holiday.name.split(' ');
            let line = '';
            let ly = y + 130;
            for (let w of words) {
              const test = line + w + ' ';
              if (ctx.measureText(test).width > maxW && line !== '') {
                ctx.fillText(line, x + 10, ly);
                line = w + ' ';
                ly += 15;
              } else {
                line = test;
              }
            }
            if (line) ctx.fillText(line, x + 10, ly);
          }
        }
      }
    }
  }

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
