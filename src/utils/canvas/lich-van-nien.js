import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import fsPromises from "fs/promises";
import axios from "axios";
import { createHelpBackground } from "./help.js";
import * as cv from "./index.js";

async function solarToLunar(dd, mm, yyyy) {
  try {
    const res = await axios.post("https://open.oapi.vn/date/convert-to-lunar", { day: dd, month: mm, year: yyyy }, { timeout: 5000, headers: { "Content-Type": "application/json" } });
    if (res.data?.code === "success" && res.data.data) return res.data.data;
  } catch {}
  return null;
}

async function lunarToSolar(dd, mm, yyyy) {
  try {
    const res = await axios.post("https://open.oapi.vn/date/convert-to-solar", { day: dd, month: mm, year: yyyy }, { timeout: 5000, headers: { "Content-Type": "application/json" } });
    if (res.data?.code === "success" && res.data.data) {
      const d = res.data.data.date.split("T")[0].split("-");
      return new Date(+d[0], +d[1] - 1, +d[2]);
    }
  } catch {}
  return null;
}

function jdFromDate(dd, mm, yyyy) {
  const a = Math.floor((14 - mm) / 12);
  const y = yyyy + 4800 - a;
  const m = mm + 12 * a - 3;
  return dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function getGioHoangDao(dd, mm, yyyy) {
  const chi = (jdFromDate(dd, mm, yyyy) + 1) % 12;
  const hd = [[0,2,4,10],[1,3,9,11],[0,6,8,10],[1,3,7,9],[2,4,8,10],[1,5,7,11],[0,2,6,8],[3,5,9,11],[0,4,6,10],[1,3,7,9],[2,4,8,10],[1,5,7,11]];
  const n = ["Tý (23:00-0:59)","Sửu (1:00-2:59)","Dần (3:00-4:59)","Mão (5:00-6:59)","Thìn (7:00-8:59)","Tỵ (9:00-10:59)","Ngọ (11:00-12:59)","Mùi (13:00-14:59)","Thân (15:00-16:59)","Dậu (17:00-18:59)","Tuất (19:00-20:59)","Hợi (21:00-22:59)"];
  return hd[chi].map(i => n[i]);
}

function getGioHacDao(dd, mm, yyyy) {
  const chi = (jdFromDate(dd, mm, yyyy) + 1) % 12;
  const hd = [[1,3,5,6,7,8,9,11],[0,2,4,5,6,7,8,10],[1,2,3,5,7,9,11],[0,2,4,5,6,8,10,11],[0,1,3,5,6,7,9,11],[0,2,3,4,6,8,9,10],[1,3,4,5,7,9,10,11],[0,1,2,4,6,7,8,10],[1,2,3,5,7,8,9,11],[0,2,4,5,6,8,10,11],[0,1,3,5,6,7,9,11],[0,2,3,4,6,8,9,10]];
  const n = ["Tý (23:00-0:59)","Sửu (1:00-2:59)","Dần (3:00-4:59)","Mão (5:00-6:59)","Thìn (7:00-8:59)","Tỵ (9:00-10:59)","Ngọ (11:00-12:59)","Mùi (13:00-14:59)","Thân (15:00-16:59)","Dậu (17:00-18:59)","Tuất (19:00-20:59)","Hợi (21:00-22:59)"];
  return hd[chi].map(i => n[i]);
}

async function getVietnameseHolidays(year) {
  const h = [
    { name: "Tết Dương lịch", date: new Date(year, 0, 1) },
    { name: "Ngày thành lập Đảng", date: new Date(year, 1, 3) },
    { name: "Ngày Giải phóng miền Nam", date: new Date(year, 3, 30) },
    { name: "Ngày Quốc tế Lao động", date: new Date(year, 4, 1) },
    { name: "Sinh nhật Bác Hồ", date: new Date(year, 4, 19) },
    { name: "Ngày Quốc khánh", date: new Date(year, 8, 2) },
    { name: "Ngày Phụ nữ Việt Nam", date: new Date(year, 9, 20) },
    { name: "Ngày Nhà giáo Việt Nam", date: new Date(year, 10, 20) },
    { name: "Ngày hội Quốc phòng Toàn dân", date: new Date(year, 11, 22) },
    { name: "Giáng sinh", date: new Date(year, 11, 25) },
    { name: "Ngày Quốc tế Phụ nữ", date: new Date(year, 2, 8) },
    { name: "Ngày Thương binh Liệt sĩ", date: new Date(year, 6, 27) },
    { name: "Ngày Gia đình Việt Nam", date: new Date(year, 5, 28) }
  ];
  const lunarDays = [
    [15,8,"Tết Trung thu"],
    [5,5,"Tết Đoan Ngọ"],
    [15,1,"Rằm tháng Giêng"],
    [3,3,"Tết Hàn thực"],
    [15,7,"Vu Lan"],
    [23,12,"Ông Táo chầu trời"],
    [1,1,"Tết Nguyên Đán"]
  ];
  for (const [d,m,n] of lunarDays) {
    const solar = await lunarToSolar(d,m,year);
    if (solar) h.push({ name: n, date: solar });
    if (n === "Tết Nguyên Đán" && solar) {
      for (let i=1;i<=2;i++) {
        const d2=new Date(solar);d2.setDate(d2.getDate()+i);
        h.push({ name:`Mùng ${i+1} Tết`, date:d2 });
      }
    }
  }
  return h.filter(v=>v.date);
}

async function getUpcomingHolidays(currentDate) {
  const year = currentDate.getFullYear();
  let h = await getVietnameseHolidays(year);
  h = h.concat(await getVietnameseHolidays(year + 1));
  return h.map(v=>({...v,days:Math.ceil((v.date-currentDate)/86400000)})).filter(v=>v.days>0).sort((a,b)=>a.days-b.days).slice(0,5);
}

export async function createCalendarImage() {
  const width = 900, height = 1400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  createHelpBackground(ctx, width, height);

  const now = new Date();
  const days = ["Chủ Nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"];
  const months = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
  const dayName = days[now.getDay()];
  const dd = now.getDate(), mm = now.getMonth()+1, yyyy = now.getFullYear();
  const lunar = await solarToLunar(dd, mm, yyyy);
  const timeStr = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;

  ctx.fillStyle="rgba(0,0,0,0.5)";
  ctx.roundRect(45,80,width-90,380,20);ctx.fill();

  ctx.textAlign="center";
  ctx.font="bold 32px BeVietnamPro";
  ctx.fillStyle=cv.getRandomGradient(ctx,width);
  ctx.fillText(`${dayName}, Ngày ${dd} ${months[mm-1]} Năm ${yyyy}`,width/2,140);

  ctx.font="bold 120px BeVietnamPro";
  ctx.fillStyle=cv.getRandomGradient(ctx,width);
  ctx.fillText(timeStr,width/2,280);

  if(lunar){
    ctx.font="bold 28px BeVietnamPro";
    ctx.fillStyle="#fff";
    ctx.fillText(`Âm lịch - ${lunar.day}/${lunar.month}/${lunar.year}`,width/2,340);
    ctx.font="22px BeVietnamPro";
    ctx.fillStyle=cv.getRandomGradient(ctx,width);
    ctx.fillText(`Ngày ${lunar.sexagenaryCycle}`,width/2,390);
  }

  const holidays=await getUpcomingHolidays(now);
  let yPos=520;
  for(const v of holidays){
    ctx.fillStyle="rgba(0,0,0,0.6)";
    ctx.roundRect(45,yPos,width-90,80,12);ctx.fill();
    ctx.textAlign="left";
    ctx.fillStyle="#FFA500";ctx.font="bold 24px BeVietnamPro";
    ctx.fillText(`${v.days} ngày nữa`,70,yPos+32);
    ctx.fillStyle="#fff";ctx.font="bold 28px BeVietnamPro";
    ctx.fillText(v.name,70,yPos+65);
    yPos+=95;
  }

  const gioHD=getGioHoangDao(dd,mm,yyyy);
  const gioHacDao=getGioHacDao(dd,mm,yyyy);

  ctx.fillStyle="rgba(0,0,0,0.6)";
  ctx.roundRect(45,yPos,width-90,180,12);ctx.fill();
  ctx.textAlign="center";
  ctx.font="bold 28px BeVietnamPro";
  ctx.fillStyle=cv.getRandomGradient(ctx,width);
  ctx.fillText("Giờ Hoàng Đạo",width/2,yPos+40);
  ctx.fillStyle="#fff";ctx.font="18px BeVietnamPro";
  ctx.fillText(`${gioHD[0]}    ${gioHD[1]}`,width/2,yPos+80);
  ctx.fillText(`${gioHD[2]}    ${gioHD[3]||""}`,width/2,yPos+110);

  yPos+=200;
  ctx.fillStyle="rgba(0,0,0,0.6)";
  ctx.roundRect(45,yPos,width-90,200,12);ctx.fill();
  ctx.textAlign="center";
  ctx.font="bold 28px BeVietnamPro";
  ctx.fillStyle=cv.getRandomGradient(ctx,width);
  ctx.fillText("Giờ Hắc Đạo",width/2,yPos+40);
  ctx.fillStyle="#fff";ctx.font="16px BeVietnamPro";
  ctx.fillText(`${gioHacDao.slice(0,3).join("  ")}`,width/2,yPos+80);
  ctx.fillText(`${gioHacDao.slice(3,6).join("  ")}`,width/2,yPos+110);
  ctx.fillText(`${gioHacDao[6]||""}`,width/2,yPos+140);

  const filePath=path.resolve(`./assets/temp/calendar_${Date.now()}.png`);
  const out=fs.createWriteStream(filePath);
  const stream=canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve,reject)=>{out.on("finish",()=>resolve(filePath));out.on("error",reject);});
}

export async function clearImagePath(pathFile){try{await fsPromises.unlink(pathFile);}catch{}}
