import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../info-service/user-info.js";
import { admins } from "../../../index.js";

const playerDataMap = new Map();
const lastCommandMap = new Map();

const REALMS = [
  { level: 1, name: "Luyện Hóa Thành Tiên", minExp: 0, maxExp: 1000, health: 50, damage: 5 },
  { level: 2, name: "Tiên Nhân Sơ Kỳ", minExp: 1000, maxExp: 3000, health: 100, damage: 15 },
  { level: 3, name: "Tiên Nhân Trung Kỳ", minExp: 3000, maxExp: 6000, health: 150, damage: 25 },
  { level: 4, name: "Tiên Nhân Hậu Kỳ", minExp: 6000, maxExp: 10000, health: 200, damage: 35 },
  { level: 5, name: "Thiên Tiên", minExp: 10000, maxExp: 15000, health: 300, damage: 50 },
  { level: 6, name: "Đại Lộ Tiên", minExp: 15000, maxExp: 25000, health: 400, damage: 70 },
  { level: 7, name: "Thánh Tiên", minExp: 25000, maxExp: 40000, health: 500, damage: 100 }
];

const TECHNIQUES = [
  { id: 1, name: "Kinh Điển Vô Cực", price: 1000, expBonus: 10, dmg: 0, hp: 0, emoji: "📜" },
  { id: 2, name: "Kinh Điển Thuyền Sơn", price: 5000, expBonus: 25, dmg: 5, hp: 0, emoji: "📜" },
  { id: 3, name: "Kinh Điển Tiên Võng", price: 15000, expBonus: 50, dmg: 10, hp: 10, emoji: "📜" },
  { id: 4, name: "Kinh Điển Võ Trí", price: 50000, expBonus: 100, dmg: 25, hp: 25, emoji: "📜" }
];

const PILLS = [
  { id: 1, name: "Linh Khí Đan", price: 500, hp: 50, dmg: 0, emoji: "🔴" },
  { id: 2, name: "Tăng Công Đan", price: 2000, hp: 0, dmg: 10, emoji: "🟠" },
  { id: 3, name: "Thần Bát Đan", price: 8000, hp: 100, dmg: 20, emoji: "🟡" },
  { id: 4, name: "Tiên Nhân Đan", price: 30000, hp: 200, dmg: 40, emoji: "🌟" }
];

const EQUIPMENT = [
  { id: 1, name: "Kiếm Phàm Sắt", type: "weapon", price: 2000, dmg: 10, emoji: "⚔️" },
  { id: 2, name: "Kiếm Huyền Thiết", type: "weapon", price: 8000, dmg: 30, emoji: "⚔️" },
  { id: 3, name: "Kiếm Tiên Khí", type: "weapon", price: 25000, dmg: 60, emoji: "✨⚔️" },
  { id: 4, name: "Pháp Cây Thanh Tre", type: "weapon", price: 50000, dmg: 100, emoji: "🌿" },
  { id: 5, name: "Áo Lụa Thiêu Sơn", type: "armor", price: 3000, hp: 50, emoji: "👔" },
  { id: 6, name: "Áo Gấm Tiên Kiều", type: "armor", price: 12000, hp: 100, emoji: "👗" },
  { id: 7, name: "Chiêu Tinh Ban", type: "armor", price: 40000, hp: 200, emoji: "🛡️" }
];

const DEMONS = [
  { id: 1, name: "Tinh Quỷ Sơ Cấp", minLv: 1, maxLv: 2, hp: 30, dmg: 5, exp: 50, gold: 100, emoji: "👹" },
  { id: 2, name: "Quỷ Tướng", minLv: 2, maxLv: 3, hp: 50, dmg: 15, exp: 150, gold: 300, emoji: "👹" },
  { id: 3, name: "Độc Quỷ", minLv: 3, maxLv: 4, hp: 100, dmg: 30, exp: 300, gold: 600, emoji: "👺" },
  { id: 4, name: "Ma Đầu", minLv: 4, maxLv: 5, hp: 150, dmg: 50, exp: 600, gold: 1200, emoji: "👺" },
  { id: 5, name: "Đại Ma Vương", minLv: 5, maxLv: 7, hp: 250, dmg: 80, exp: 1000, gold: 2000, emoji: "😈" }
];

const PLACES = [
  { name: "thien long co tran", normalized: "thienlongcotran", emoji: "⛰️", desc: "Hang Động Thiên Long", type: "fight", demons: [1, 2] },
  { name: "siuu pham pho", normalized: "sieuphampho", emoji: "🏘️", desc: "Chợ Siêu Phẩm", type: "shop", demons: [] },
  { name: "thanh vu duong", normalized: "thanhvuduong", emoji: "🌊", desc: "Đường Thanh Vũ", type: "fight", demons: [2, 3] },
  { name: "phuong y cung", normalized: "phuongyicung", emoji: "🏯", desc: "Cung Phương Y", type: "shop", demons: [] },
  { name: "am phuong duong", normalized: "amphuongduong", emoji: "🌲", desc: "Đường Âm Phương", type: "fight", demons: [3, 4] },
  { name: "tien canh dien", normalized: "tiencanhd", emoji: "💫", desc: "Thiên Cánh Điền", type: "fight", demons: [4, 5] }
];

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function findPlace(input) {
  const norm = normalizeText(input);
  return PLACES.find(p => normalizeText(p.name) === norm || p.normalized === norm);
}

function getPlayerData(threadId, userId) {
  const key = `tutien_${threadId}_${userId}`;
  if (!playerDataMap.has(key)) {
    playerDataMap.set(key, {
      gold: 5000,
      exp: 0,
      level: 1,
      maxHp: 50,
      currentHp: 50,
      baseDmg: 5,
      techniques: [],
      inventory: {},
      equipment: { weapon: null, armor: null },
      location: null,
      lastDaily: 0,
      totalKilled: 0,
      inBattle: false,
      battleData: null
    });
  }
  return playerDataMap.get(key);
}

function getRealm(lv) {
  return REALMS.find(r => r.level === lv) || REALMS[0];
}

function calcDmg(pData) {
  const realm = getRealm(pData.level);
  let dmg = realm.damage + pData.baseDmg;
  
  pData.techniques.forEach(tId => {
    const t = TECHNIQUES.find(x => x.id === tId);
    if (t) dmg += t.dmg;
  });
  
  if (pData.equipment.weapon) {
    const w = EQUIPMENT.find(x => x.id === pData.equipment.weapon && x.type === "weapon");
    if (w) dmg += w.dmg;
  }
  
  return dmg;
}

function calcHp(pData) {
  const realm = getRealm(pData.level);
  let hp = realm.health + pData.maxHp;
  
  pData.techniques.forEach(tId => {
    const t = TECHNIQUES.find(x => x.id === tId);
    if (t) hp += t.hp;
  });
  
  if (pData.equipment.armor) {
    const a = EQUIPMENT.find(x => x.id === pData.equipment.armor && x.type === "armor");
    if (a) hp += a.hp;
  }
  
  return hp;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleTuTienCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  const args = content.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  if (cmd !== `${prefix}tutien`) return;

  const subCmd = args[1]?.toLowerCase();

  if (!subCmd) {
    await sendMessageFromSQL(api, message, 
      { message: `✨ HỆ THỐNG TU TIÊN PHÀM NHÂN\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 LỆNH CƠ BẢN:\n` +
      `→ ${prefix}tutien join: Bắt đầu tu luyện\n` +
      `→ ${prefix}tutien leave: Thoát khỏi tu viện\n\n` +
      `📌 LỆNH CHÍNH:\n` +
      `→ daily: Điểm danh nhận phần thưởng\n` +
      `→ duahang [tên]: Di chuyển đến địa điểm\n` +
      `→ datrau [số]: Đả quỷ\n` +
      `→ tuluyen: Tu luyện tăng exp\n` +
      `→ hanghi: Nghỉ ngơi hồi phục máu\n` +
      `→ product: Xem hành trang\n` +
      `→ sell [index] [số]: Bán đồ\n` +
      `→ shop: Xem cửa hàng\n` +
      `→ buy [index] [số]: Mua đồ\n` +
      `→ equip [index]: Trang bị\n` +
      `→ info: Thông tin nhân vật\n` +
      `→ rank: Bảng xếp hạng\n\n` +
      `━━━━━━━━━━━━━━━━━━━━`, success: true }, true, 3600000
    );
    return;
  }

  if (subCmd === "join") {
    const pData = getPlayerData(threadId, senderId);
    const realm = getRealm(pData.level);

    await sendMessageFromSQL(api, message,
      { message: `✨ Chào mừng đến với Thế Giới Tu Tiên!\n\n` +
      `💫 Cấp độ: ${pData.level} - ${realm.name}\n` +
      `❤️ Máu: ${pData.currentHp}/${calcHp(pData)}\n` +
      `⚡ Sức Công: ${calcDmg(pData)}\n` +
      `💰 Linh Thạch: ${pData.gold.toLocaleString()}\n` +
      `💡 Kinh Nghiệm: ${pData.exp}/${getRealm(pData.level).maxExp}\n\n` +
      `Hãy dùng lệnh "daily" để điểm danh!\n` +
      `Dùng "duahang [nơi]" để bắt đầu phiêu lưu!`, success: true }, true, 3600000
    );
    return;
  }

  if (subCmd === "leave") {
    await sendMessageFromSQL(api, message, { message: "Bạn đã rời khỏi tu viện. Dữ liệu được lưu lại!", success: true }, true, 3600000);
    return;
  }
}

export async function handleTuTienMessage(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  if (typeof content !== "string") return;

  const contentStr = String(content).trim();
  if (contentStr.startsWith(prefix)) return;

  const args = contentStr.split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  const validCmds = ["daily", "duahang", "datrau", "tuluyen", "hanghi", "product", "sell", "shop", "buy", "equip", "info", "rank", "buff"];
  if (!validCmds.includes(cmd)) return;

  const cmdKey = `${threadId}_${senderId}`;
  const now = Date.now();
  const lastCmd = lastCommandMap.get(cmdKey);
  
  if (lastCmd && now - lastCmd < 500) return;
  lastCommandMap.set(cmdKey, now);

  const pData = getPlayerData(threadId, senderId);

  if (cmd === "buff") {
    if (!admins.includes(senderId)) return;

    const mentions = message.data.mentions;
    const amt = parseInt(args[1]);

    if (!amt || amt < 1) {
      await sendMessageFromSQL(api, message, { message: "Cú pháp: buff [số tiền] hoặc buff [số tiền] @mentions", success: false }, true, 3600000);
      return;
    }

    if (!mentions || mentions.length === 0) {
      pData.gold += amt;
      await sendMessageFromSQL(api, message,
        { message: `✨ BUFF THÀNH CÔNG!\n\n` +
        `💰 Đã cộng: +${amt.toLocaleString()} Linh Thạch\n` +
        `💰 Tổng: ${pData.gold.toLocaleString()}`, success: true }, true, 3600000
      );
      return;
    }

    let res = [];
    for (const m of mentions) {
      const tId = m.uid;
      const tName = content.substring(m.pos, m.pos + m.len).replace("@", "");
      const tData = getPlayerData(threadId, tId);
      tData.gold += amt;
      res.push(`${tName}: +${amt.toLocaleString()} Linh Thạch`);
    }

    await sendMessageFromSQL(api, message,
      { message: `✨ BUFF THÀNH CÔNG!\n\n${res.join("\n")}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "rank") {
    const all = [];
    
    for (const [key, data] of playerDataMap.entries()) {
      if (key.startsWith(`${threadId}_`)) {
        const uId = key.split('_')[1];
        all.push({
          uId: uId,
          level: data.level,
          exp: data.exp,
          gold: data.gold,
          killed: data.totalKilled,
          dmg: calcDmg(data),
          hp: calcHp(data)
        });
      }
    }

    all.sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.exp - a.exp;
    });

    if (all.length === 0) {
      await sendMessageFromSQL(api, message, { message: "Chưa có cao thủ nào!", success: false }, true, 3600000);
      return;
    }

    const top10 = all.slice(0, 10);
    const names = await Promise.all(top10.map(async (p) => {
      try {
        const info = await getUserInfoData(api, p.uId);
        return info.name || p.uId.slice(-4);
      } catch {
        return p.uId.slice(-4);
      }
    }));

    const lst = top10.map((p, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const realm = getRealm(p.level);
      return `${medal} ${names[i]}\n   🔮 ${realm.name} | 💫 Exp: ${p.exp} | ⚔️ ${p.killed} quỷ | 💪 ${p.dmg}`;
    }).join("\n\n");

    await sendMessageFromSQL(api, message,
      { message: `🏆 BẢNG XẾP HẠNG TU TIÊN\n\n━━━━━━━━━━━━━━━━━━━━\n${lst}\n━━━━━━━━━━━━━━━━━━━━`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "daily") {
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - pData.lastDaily < oneDay) {
      const left = oneDay - (now - pData.lastDaily);
      const h = Math.floor(left / (60 * 60 * 1000));
      const m = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000));
      await sendMessageFromSQL(api, message, { message: `⏰ Đã điểm danh rồi!\nThời gian còn lại: ${h}h ${m}m`, success: false }, true, 3600000);
      return;
    }

    pData.lastDaily = now;
    const goldRw = 1000;
    const expRw = 200;
    pData.gold += goldRw;
    pData.exp += expRw;

    if (pData.exp >= getRealm(pData.level).maxExp && pData.level < 7) {
      pData.level++;
      pData.maxHp = calcHp(pData);
      pData.currentHp = pData.maxHp;
      pData.baseDmg = calcDmg(pData);
      const newRealm = getRealm(pData.level);
      await sendMessageFromSQL(api, message,
        { message: `✅ ĐIỂM DANH THÀNH CÔNG!\n\n🎁 Phần thưởng:\n+${goldRw.toLocaleString()} Linh Thạch\n+${expRw} Kinh Nghiệm\n\n🌟 NÂNG CẤP LÊN CẤP ${pData.level}!\n🔮 ${newRealm.name}\n❤️ Máu tối đa: ${pData.maxHp}\n⚡ Sức Công: ${calcDmg(pData)}`, success: true }, true, 3600000
      );
      return;
    }

    await sendMessageFromSQL(api, message,
      { message: `✅ ĐIỂM DANH THÀNH CÔNG!\n\n🎁 Phần thưởng:\n+${goldRw.toLocaleString()} Linh Thạch\n+${expRw} Kinh Nghiệm\n\n💰 Tổng: ${pData.gold.toLocaleString()}\n💫 Exp: ${pData.exp}/${getRealm(pData.level).maxExp}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "duahang") {
    const plInput = args.slice(1).join(" ");
    if (!plInput) {
      const lst = PLACES.map((p, i) => `${i + 1}. ${p.emoji} ${p.name} - ${p.desc}`).join("\n");
      await sendMessageFromSQL(api, message,
        { message: `🌍 DANH SÁCH ĐỊA ĐIỂM\n\n━━━━━━━━━━━━━━━━━━━━\n${lst}\n━━━━━━━━━━━━━━━━━━━━\n\nDùng: duahang [tên]`, success: true }, true, 3600000
      );
      return;
    }

    const pl = findPlace(plInput);
    if (!pl) {
      await sendMessageFromSQL(api, message, { message: "🚫 Không tìm thấy địa điểm!", success: false }, true, 3600000);
      return;
    }

    pData.location = pl.name;
    if (pl.type === "shop") {
      await sendMessageFromSQL(api, message,
        { message: `${pl.emoji} Bạn đã tới: ${pl.name}\n📝 ${pl.desc}\n\n🏪 Đây là khu buôn bán siêu phẩm!\n\nDùng lệnh "shop" để xem hàng hóa!`, success: true }, true, 3600000
      );
    } else {
      const dmLst = pl.demons.map(dId => {
        const d = DEMONS.find(x => x.id === dId);
        return `${d.emoji} ${d.name}`;
      }).join("\n");
      await sendMessageFromSQL(api, message,
        { message: `${pl.emoji} Bạn đã tới: ${pl.name}\n📝 ${pl.desc}\n\n👹 Quỷ có thể gặp:\n${dmLst}\n\nDùng lệnh "datrau [số lần]" để chiến đấu!`, success: true }, true, 3600000
      );
    }
    return;
  }

  if (cmd === "datrau") {
    if (!pData.location) {
      await sendMessageFromSQL(api, message, { message: "Chưa chọn địa điểm! Dùng 'duahang [nơi]'", success: false }, true, 3600000);
      return;
    }

    const pl = findPlace(pData.location);
    if (!pl || pl.type !== "fight") {
      await sendMessageFromSQL(api, message, { message: "Nơi này không có quỷ để đả!", success: false }, true, 3600000);
      return;
    }

    const times = parseInt(args[1]) || 1;
    if (times < 1 || times > 10) {
      await sendMessageFromSQL(api, message, { message: "Số lần đả phải từ 1 đến 10!", success: false }, true, 3600000);
      return;
    }

    const delayTime = Math.floor(Math.random() * 3000) + 2000;
    
    await sendMessageFromSQL(api, message, { message: `⚔️ Chuẩn bị chiến đấu...`, success: true }, true, delayTime);
    
    await delay(delayTime);

    let results = [];
    let totalExpGain = 0;
    let totalGoldGain = 0;
    let playerHpLost = 0;

    for (let i = 0; i < times; i++) {
      const demonId = pl.demons[Math.floor(Math.random() * pl.demons.length)];
      const demon = DEMONS.find(x => x.id === demonId);
      
      let demonHp = demon.hp;
      let playerDmg = calcDmg(pData);
      let demonDmg = demon.dmg;
      let roundCount = 0;

      while (demonHp > 0 && roundCount < 50) {
        demonHp -= playerDmg;
        if (demonHp > 0) {
          playerHpLost += Math.max(1, demonDmg - Math.floor(calcHp(pData) / 20));
        }
        roundCount++;
      }

      if (demonHp <= 0) {
        pData.totalKilled++;
        totalExpGain += demon.exp;
        totalGoldGain += demon.gold;
        results.push(`✅ ${demon.emoji} ${demon.name} (${roundCount} vòng)`);
      } else {
        results.push(`❌ ${demon.emoji} ${demon.name} (Quỷ chạy trốn)`);
      }
    }

    pData.currentHp = Math.max(1, pData.currentHp - playerHpLost);
    pData.exp += totalExpGain;
    pData.gold += totalGoldGain;

    let levelUp = false;
    while (pData.exp >= getRealm(pData.level).maxExp && pData.level < 7) {
      pData.level++;
      pData.maxHp = calcHp(pData);
      pData.currentHp = pData.maxHp;
      pData.baseDmg = calcDmg(pData);
      levelUp = true;
    }

    const resultText = results.join("\n");
    const lvMsg = levelUp ? `\n\n🌟 NÂNG CẤP LÊN CẤP ${pData.level}!\n🔮 ${getRealm(pData.level).name}` : "";

    await sendMessageFromSQL(api, message,
      { message: `⚔️ KẾT QUẢ CHIẾN ĐẤU\n\n━━━━━━━━━━━━━━━━━━━━\n${resultText}\n━━━━━━━━━━━━━━━━━━━━\n\n💫 Exp: +${totalExpGain}\n💰 Linh Thạch: +${totalGoldGain.toLocaleString()}\n❤️ Máu: ${pData.currentHp}/${calcHp(pData)}${lvMsg}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "tuluyen") {
    const expGain = Math.floor(Math.random() * 50) + 30;
    const hpRegen = Math.floor(Math.random() * 20) + 10;
    
    pData.exp += expGain;
    pData.currentHp = Math.min(calcHp(pData), pData.currentHp + hpRegen);

    let levelUp = false;
    while (pData.exp >= getRealm(pData.level).maxExp && pData.level < 7) {
      pData.level++;
      pData.maxHp = calcHp(pData);
      pData.currentHp = pData.maxHp;
      pData.baseDmg = calcDmg(pData);
      levelUp = true;
    }

    const lvMsg = levelUp ? `\n\n🌟 NÂNG CẤP LÊN CẤP ${pData.level}!\n🔮 ${getRealm(pData.level).name}` : "";

    await sendMessageFromSQL(api, message,
      { message: `🧘 TU LUYỆN THÀNH CÔNG!\n\n💫 Kinh Nghiệm: +${expGain}\n❤️ Máu hồi: +${hpRegen}\n\n💫 Tổng Exp: ${pData.exp}/${getRealm(pData.level).maxExp}\n❤️ Máu: ${pData.currentHp}/${calcHp(pData)}${lvMsg}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "hanghi") {
    const hpRecovered = calcHp(pData) - pData.currentHp;
    pData.currentHp = calcHp(pData);

    await sendMessageFromSQL(api, message,
      { message: `😴 NGHỈ NGƠI\n\n❤️ Máu hồi phục: +${hpRecovered}\n❤️ Máu hiện tại: ${pData.currentHp}/${calcHp(pData)}\n\n✨ Bạn đã hoàn toàn khỏe mạnh!`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "product") {
    if (Object.keys(pData.inventory).length === 0) {
      await sendMessageFromSQL(api, message, { message: "Hành trang trống!", success: false }, true, 3600000);
      return;
    }

    const invList = Object.entries(pData.inventory)
      .filter(([_, count]) => count > 0)
      .map(([itemId, count], i) => {
        const iId = parseInt(itemId);
        const technique = TECHNIQUES.find(t => t.id === iId);
        const pill = PILLS.find(p => p.id === iId);
        const equip = EQUIPMENT.find(e => e.id === iId);
        
        if (technique) {
          return `${i + 1}. ${technique.emoji} ${technique.name} x${count} (${technique.price.toLocaleString()} mỗi)`;
        }
        if (pill) {
          return `${i + 1}. ${pill.emoji} ${pill.name} x${count} (${pill.price.toLocaleString()} mỗi)`;
        }
        if (equip) {
          return `${i + 1}. ${equip.emoji} ${equip.name} x${count} (${equip.price.toLocaleString()} mỗi)`;
        }
        return `${i + 1}. Vật phẩm x${count}`;
      }).join("\n");

    await sendMessageFromSQL(api, message,
      { message: `🎒 HÀNH TRANG\n\n━━━━━━━━━━━━━━━━━━━━\n${invList}\n━━━━━━━━━━━━━━━━━━━━\n\nDùng: sell [index] [số lượng]`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "sell") {
    if (args[1] === "all") {
      let totalMoney = 0;
      let soldItems = [];

      for (const [itemId, count] of Object.entries(pData.inventory)) {
        if (count > 0) {
          const iId = parseInt(itemId);
          const technique = TECHNIQUES.find(t => t.id === iId);
          const pill = PILLS.find(p => p.id === iId);
          const equip = EQUIPMENT.find(e => e.id === iId);
          
          let price = 0;
          let name = "Vật phẩm";
          let emoji = "📦";
          
          if (technique) {
            price = technique.price;
            name = technique.name;
            emoji = technique.emoji;
          } else if (pill) {
            price = pill.price;
            name = pill.name;
            emoji = pill.emoji;
          } else if (equip) {
            price = equip.price;
            name = equip.name;
            emoji = equip.emoji;
          }
          
          const earned = price * count;
          totalMoney += earned;
          soldItems.push(`${emoji} ${name} x${count}`);
          pData.inventory[itemId] = 0;
        }
      }

      if (totalMoney === 0) {
        await sendMessageFromSQL(api, message, { message: "Không có gì để bán!", success: false }, true, 3600000);
        return;
      }

      pData.gold += totalMoney;
      await sendMessageFromSQL(api, message,
        { message: `💰 ĐÃ BÁN TẤT CẢ!\n\n${soldItems.join("\n")}\n\n💵 Thu về: +${totalMoney.toLocaleString()} Linh Thạch\n💰 Số dư: ${pData.gold.toLocaleString()}`, success: true }, true, 3600000
      );
      return;
    }

    const idx = parseInt(args[1]);
    const amount = parseInt(args[2]);

    if (!idx || !amount || amount < 1) {
      await sendMessageFromSQL(api, message, { message: "Cú pháp: sell [index] [số lượng]", success: false }, true, 3600000);
      return;
    }

    const invArr = Object.entries(pData.inventory).filter(([_, count]) => count > 0);
    if (idx < 1 || idx > invArr.length) {
      await sendMessageFromSQL(api, message, { message: "Index không hợp lệ! Dùng 'product'", success: false }, true, 3600000);
      return;
    }

    const [itemId, currentCount] = invArr[idx - 1];
    const iId = parseInt(itemId);
    if (amount > currentCount) {
      await sendMessageFromSQL(api, message, { message: `Bạn chỉ có ${currentCount}!`, success: false }, true, 3600000);
      return;
    }

    const technique = TECHNIQUES.find(t => t.id === iId);
    const pill = PILLS.find(p => p.id === iId);
    const equip = EQUIPMENT.find(e => e.id === iId);
    
    let price = 0;
    let name = "Vật phẩm";
    let emoji = "📦";
    
    if (technique) {
      price = technique.price;
      name = technique.name;
      emoji = technique.emoji;
    } else if (pill) {
      price = pill.price;
      name = pill.name;
      emoji = pill.emoji;
    } else if (equip) {
      price = equip.price;
      name = equip.name;
      emoji = equip.emoji;
    }

    const earned = price * amount;
    pData.inventory[itemId] -= amount;
    pData.gold += earned;

    await sendMessageFromSQL(api, message,
      { message: `💰 BÁN THÀNH CÔNG!\n\n${emoji} ${name} x${amount}\n💵 Thu về: +${earned.toLocaleString()} Linh Thạch\n💰 Số dư: ${pData.gold.toLocaleString()}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "shop") {
    const pl = findPlace(pData.location);
    if (!pl || pl.type !== "shop") {
      const plList = PLACES.filter(p => p.type === "shop");
      if (plList.length === 0) {
        await sendMessageFromSQL(api, message, { message: "Không tìm thấy cửa hàng!", success: false }, true, 3600000);
        return;
      }
      const plName = plList[0].name;
      await sendMessageFromSQL(api, message, { message: `Hãy tới ${plName} trước! Dùng: duahang [tên]`, success: false }, true, 3600000);
      return;
    }

    const techList = TECHNIQUES.map(t => `${t.id}. ${t.emoji} ${t.name}\n   💰 ${t.price.toLocaleString()} | +${t.expBonus} Exp | +${t.dmg} Sức | +${t.hp} Máu`).join("\n\n");
    const pillList = PILLS.map(p => `${p.id + 10}. ${p.emoji} ${p.name}\n   💰 ${p.price.toLocaleString()} | +${p.hp} Máu | +${p.dmg} Sức`).join("\n\n");
    const equipList = EQUIPMENT.map(e => `${e.id + 20}. ${e.emoji} ${e.name}\n   💰 ${e.price.toLocaleString()} | +${e.dmg > 0 ? e.dmg + " Sức" : e.hp + " Máu"}`).join("\n\n");

    await sendMessageFromSQL(api, message,
      { message: `🏪 CỬA HÀNG SIÊU PHẨM\n\n📜 KINH ĐIỂN:\n${techList}\n\n🔴 LINH ĐAN:\n${pillList}\n\n⚔️ THIẾT BỊ:\n${equipList}\n\n━━━━━━━━━━━━━━━━━━━━\nDùng: buy [index] [số lượng]`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "buy") {
    const idx = parseInt(args[1]);
    const amount = parseInt(args[2]) || 1;

    if (!idx || amount < 1) {
      await sendMessageFromSQL(api, message, { message: "Cú pháp: buy [index] [số lượng]", success: false }, true, 3600000);
      return;
    }

    let item = null;
    let type = "";

    if (idx >= 1 && idx <= 4) {
      item = TECHNIQUES.find(t => t.id === idx);
      type = "technique";
    } else if (idx >= 11 && idx <= 14) {
      item = PILLS.find(p => p.id === idx - 10);
      type = "pill";
    } else if (idx >= 21 && idx <= 27) {
      item = EQUIPMENT.find(e => e.id === idx - 20);
      type = "equipment";
    }

    if (!item) {
      await sendMessageFromSQL(api, message, { message: "Sản phẩm không tồn tại!", success: false }, true, 3600000);
      return;
    }

    const totalCost = item.price * amount;
    if (pData.gold < totalCost) {
      await sendMessageFromSQL(api, message, { message: `Không đủ tiền! Cần: ${totalCost.toLocaleString()} Linh Thạch`, success: false }, true, 3600000);
      return;
    }

    pData.gold -= totalCost;
    const realItemId = type === "technique" ? item.id : type === "pill" ? item.id + 10 : item.id + 20;
    
    if (!pData.inventory[realItemId]) {
      pData.inventory[realItemId] = 0;
    }
    pData.inventory[realItemId] += amount;

    await sendMessageFromSQL(api, message,
      { message: `✅ MUA THÀNH CÔNG!\n\n${item.emoji} ${item.name} x${amount}\n💵 Chi phí: -${totalCost.toLocaleString()} Linh Thạch\n💰 Số dư: ${pData.gold.toLocaleString()}`, success: true }, true, 3600000
    );
    return;
  }

  if (cmd === "equip") {
    const idx = parseInt(args[1]);

    if (!idx) {
      await sendMessageFromSQL(api, message, { message: "Cú pháp: equip [index]", success: false }, true, 3600000);
      return;
    }

    const invArr = Object.entries(pData.inventory).filter(([_, count]) => count > 0);
    if (idx < 1 || idx > invArr.length) {
      await sendMessageFromSQL(api, message, { message: "Index không hợp lệ!", success: false }, true, 3600000);
      return;
    }

    const [itemId] = invArr[idx - 1];
    const iId = parseInt(itemId);
    const equip = EQUIPMENT.find(e => {
      if (e.id === iId - 20) return true;
      return false;
    });

    if (!equip) {
      await sendMessageFromSQL(api, message, { message: "Vật phẩm này không thể trang bị!", success: false }, true, 3600000);
      return;
    }

    if (equip.type === "weapon") {
      pData.equipment.weapon = equip.id + 20;
      await sendMessageFromSQL(api, message,
        { message: `⚔️ TRANG BỊ THÀNH CÔNG!\n\n${equip.emoji} ${equip.name}\n⚡ Sức Công: +${equip.dmg}\n\nTổng Sức Công: ${calcDmg(pData)}`, success: true }, true, 3600000
      );
    } else if (equip.type === "armor") {
      pData.equipment.armor = equip.id + 20;
      pData.maxHp = calcHp(pData);
      pData.currentHp = Math.min(pData.currentHp, pData.maxHp);
      await sendMessageFromSQL(api, message,
        { message: `🛡️ TRANG BỊ THÀNH CÔNG!\n\n${equip.emoji} ${equip.name}\n❤️ Máu tối đa: +${equip.hp}\n\nTổng Máu: ${pData.maxHp}`, success: true }, true, 3600000
      );
    }
    return;
  }

  if (cmd === "info") {
    const mentions = message.data.mentions;
    
    if (!mentions || mentions.length === 0) {
      const invValue = Object.entries(pData.inventory)
        .reduce((sum, [itemId, count]) => {
          const iId = parseInt(itemId);
          const technique = TECHNIQUES.find(t => t.id === iId);
          const pill = PILLS.find(p => p.id === iId);
          const equip = EQUIPMENT.find(e => e.id === iId);
          const price = (technique?.price || pill?.price || equip?.price || 0);
          return sum + (price * count);
        }, 0);

      const realm = getRealm(pData.level);
      const wpn = pData.equipment.weapon ? EQUIPMENT.find(e => e.id + 20 === pData.equipment.weapon) : null;
      const arm = pData.equipment.armor ? EQUIPMENT.find(e => e.id + 20 === pData.equipment.armor) : null;

      await sendMessageFromSQL(api, message,
        { message: `👤 THÔNG TIN NHÂN VẬT\n\n━━━━━━━━━━━━━━━━━━━━\n🔮 Cấp Độ: ${pData.level} - ${realm.name}\n💫 Kinh Nghiệm: ${pData.exp}/${realm.maxExp}\n❤️ Máu: ${pData.currentHp}/${calcHp(pData)}\n⚡ Sức Công: ${calcDmg(pData)}\n💰 Linh Thạch: ${pData.gold.toLocaleString()}\n⚔️ Quỷ Đã Tiêu: ${pData.totalKilled}\n📍 Vị Trí: ${pData.location || "Chưa chọn"}\n🎒 Giá Trị Hành Trang: ${invValue.toLocaleString()}\n\n${wpn ? `⚔️ Vũ Khí: ${wpn.emoji} ${wpn.name}\n` : ""}${arm ? `🛡️ Áo Giáp: ${arm.emoji} ${arm.name}\n` : ""}━━━━━━━━━━━━━━━━━━━━`, success: true }, true, 3600000
      );
      return;
    }

    const tId = mentions[0].uid;
    const tData = getPlayerData(threadId, tId);
    const invValue = Object.entries(tData.inventory)
      .reduce((sum, [itemId, count]) => {
        const iId = parseInt(itemId);
        const technique = TECHNIQUES.find(t => t.id === iId);
        const pill = PILLS.find(p => p.id === iId);
        const equip = EQUIPMENT.find(e => e.id === iId);
        const price = (technique?.price || pill?.price || equip?.price || 0);
        return sum + (price * count);
      }, 0);

    const realm = getRealm(tData.level);
    const wpn = tData.equipment.weapon ? EQUIPMENT.find(e => e.id + 20 === tData.equipment.weapon) : null;
    const arm = tData.equipment.armor ? EQUIPMENT.find(e => e.id + 20 === tData.equipment.armor) : null;

    await sendMessageFromSQL(api, message,
      { message: `👤 THÔNG TIN NHÂN VẬT\n\n━━━━━━━━━━━━━━━━━━━━\n🔮 Cấp Độ: ${tData.level} - ${realm.name}\n💫 Kinh Nghiệm: ${tData.exp}/${realm.maxExp}\n❤️ Máu: ${tData.currentHp}/${calcHp(tData)}\n⚡ Sức Công: ${calcDmg(tData)}\n💰 Linh Thạch: ${tData.gold.toLocaleString()}\n⚔️ Quỷ Đã Tiêu: ${tData.totalKilled}\n📍 Vị Trí: ${tData.location || "Chưa chọn"}\n🎒 Giá Trị Hành Trang: ${invValue.toLocaleString()}\n\n${wpn ? `⚔️ Vũ Khí: ${wpn.emoji} ${wpn.name}\n` : ""}${arm ? `🛡️ Áo Giáp: ${arm.emoji} ${arm.name}\n` : ""}━━━━━━━━━━━━━━━━━━━━`, success: true }, true, 3600000
      );
      return;
    }
  }
}
