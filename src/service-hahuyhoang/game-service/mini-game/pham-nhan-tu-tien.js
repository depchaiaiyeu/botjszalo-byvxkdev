import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../info-service/user-info.js";
import { admins } from "../../../index.js";

const playerDataMap = new Map();
const lastCommandMap = new Map();

const LINHDUOC_DATA = {
  "Tụ Khí Đan": { rarity: "common", expGain: 50, price: 20, emoji: "💊", hpRecover: 0, risk: 0 },
  "Bồi Khí Đan": { rarity: "common", expGain: 60, price: 25, emoji: "💊", hpRecover: 0, risk: 0 },
  "Tẩy Tủy Đan": { rarity: "common", expGain: 55, price: 30, emoji: "💊", hpRecover: 5, risk: 5 },
  "Tụ Linh Đan": { rarity: "uncommon", expGain: 120, price: 100, emoji: "💊", hpRecover: 10, risk: 10 },
  "Huyết Khí Đan": { rarity: "uncommon", expGain: 150, price: 120, emoji: "💊", hpRecover: 15, risk: 15 },
  "Ma Linh Quả": { rarity: "uncommon", expGain: 180, price: 150, emoji: "🍎", hpRecover: 20, risk: 20 },
  "Kim Đan": { rarity: "rare", expGain: 300, price: 500, emoji: "💊", hpRecover: 50, risk: 30 },
  "Nguyên Anh Quả": { rarity: "rare", expGain: 350, price: 600, emoji: "🍎", hpRecover: 60, risk: 35 },
  "Hóa Thần Đan": { rarity: "rare", expGain: 400, price: 700, emoji: "💊", hpRecover: 70, risk: 40 },
  "Độ Kiếp Đan": { rarity: "epic", expGain: 800, price: 2000, emoji: "💊", hpRecover: 100, risk: 50 },
  "Phi Thăng Quả": { rarity: "epic", expGain: 900, price: 2500, emoji: "🍎", hpRecover: 120, risk: 60 },
  "Chân Tiên Linh": { rarity: "legendary", expGain: 2000, price: 10000, emoji: "✨", hpRecover: 200, risk: 80 },
  "Hồi Xuân Đan": { rarity: "common", expGain: 0, price: 100, emoji: "💉", hpRecover: 50, risk: 0 }
};

const ALL_PILLS = Object.keys(LINHDUOC_DATA);

const SHOP_ITEMS = [
  { id: 1, name: "Cơ Bản Pháp Quyết", price: 500, type: "exp_bonus", bonus: 5, emoji: "📜" },
  { id: 2, name: "Nâng Cao Pháp Quyết", price: 2000, type: "exp_bonus", bonus: 10, emoji: "📜" },
  { id: 3, name: "Chuyên Gia Pháp Quyết", price: 8000, type: "exp_bonus", bonus: 20, emoji: "📜" },
  { id: 4, name: "Siêu Cấp Pháp Quyết", price: 20000, type: "exp_bonus", bonus: 30, emoji: "📜" },
  { id: 5, name: "Tụ Linh Trận", price: 100, type: "exp_bonus", bonus: 3, emoji: "🔮" },
  { id: 6, name: "Tăng Tốc Trận Pháp", price: 300, type: "exp_bonus", bonus: 8, emoji: "🔮" },
  { id: 7, name: "Thần Tốc Trận", price: 800, type: "exp_bonus", bonus: 15, emoji: "🔮" },
  { id: 8, name: "May Mắn Phù", price: 500, type: "rare_bonus", bonus: 5, emoji: "🧧" },
  { id: 9, name: "Hiếm Phù", price: 1500, type: "rare_bonus", bonus: 10, emoji: "🧧" },
  { id: 10, name: "Thần Kỳ Phù", price: 5000, type: "rare_bonus", bonus: 20, emoji: "🧧" },
  { id: 11, name: "Tìm Kiếm Linh Mâu", price: 3000, type: "rare_bonus", bonus: 12, emoji: "👁️" },
  { id: 12, name: "Phi Hành Pháp Khí", price: 15000, type: "exp_bonus", bonus: 30, emoji: "🕊️" },
  { id: 13, name: "Linh Giác Cảm Ứng", price: 10000, type: "rare_bonus", bonus: 22, emoji: "📡" },
  { id: 14, name: "Hộ Thân Phù", price: 2500, type: "hp_bonus", bonus: 20, emoji: "🛡️" },
  { id: 15, name: "Tâm Ma Chú", price: 1800, type: "risk_reduce", bonus: 10, emoji: "🧠" },
  { id: 16, name: "Tu Lượt (x10)", price: 10, type: "turns", bonus: 0, emoji: "⏳" },
  { id: 17, name: "Hồi Xuân Đan", price: 100, type: "potion", bonus: 50, emoji: "💉" }
];

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function getPlayerData(threadId, userId) {
  const key = `${threadId}_${userId}`;
  if (!playerDataMap.has(key)) {
    playerDataMap.set(key, {
      linhthach: 1000,
      tuTurns: Math.floor(Math.random() * 51) + 50,
      inventory: {},
      expBonus: 0,
      rareBonus: 0,
      riskReduce: 0,
      hpBonus: 0,
      lastDaily: 0,
      totalTu: 0,
      exp: 0,
      level: 1,
      nextExp: 1000,
      hp: 100,
      maxHp: 100
    });
  }
  return playerDataMap.get(key);
}

function levelUp(playerData) {
  if (playerData.exp >= playerData.nextExp) {
    playerData.level++;
    playerData.exp = 0;
    playerData.nextExp = Math.floor(playerData.nextExp * 1.5);
    playerData.maxHp += 50;
    playerData.hp = playerData.maxHp;
    return true;
  }
  return false;
}

function calculateRarity(baseChance, bonus) {
  const rand = Math.random() * 100;
  const adjustedChance = baseChance + bonus;
  
  if (rand < adjustedChance * 0.02) return "legendary";
  if (rand < adjustedChance * 0.08) return "epic";
  if (rand < adjustedChance * 0.20) return "rare";
  if (rand < adjustedChance * 0.45) return "uncommon";
  return "common";
}

function getPillByRarity(rarity) {
  const availablePills = ALL_PILLS.filter(pillName => LINHDUOC_DATA[pillName].rarity === rarity);
  if (availablePills.length === 0) {
    return ALL_PILLS[Math.floor(Math.random() * ALL_PILLS.length)];
  }
  return availablePills[Math.floor(Math.random() * availablePills.length)];
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
  const command = args[0]?.toLowerCase();

  if (command !== `${prefix}tutien`) return;

  const subCommand = args[1]?.toLowerCase();

  if (!subCommand) {
    await sendMessageFromSQL(api, message, 
      { message: `🌀 PHÀM NHÂN TU TIÊN - HƯỚNG DẪN\n\n` +
      `• ${prefix}tutien join: Bắt đầu hành trình tu đạo\n` +
      `• ${prefix}tutien leave: Thoát khỏi tiên giới\n\n` +
      `• daily: Nhận quà điểm danh\n` +
      `• tu [số]: Nhập định tu luyện (1-50 lần)\n` +
      `• rest: Hồi phục thương thế\n` +
      `• product: Kiểm tra trữ vật giới\n` +
      `• sell [index] [số]: Bán linh dược\n` +
      `• sell all: Thanh lý toàn bộ\n` +
      `• shop: Mở tàng bảo các\n` +
      `• buy [index] [số]: Mua bảo vật\n` +
      `• consume [index] [số]: Nuốt linh dược\n` +
      `• info [@tag]: Xem tu vi\n` +
      `• rank: Thiên tài bảng\n` +
      `• help: Chi tiết lệnh\n\n` +
      `👉 Bắt đầu bằng '${prefix}tutien join' để phi thăng!`, success: true }, true, 3600000
    );
    return;
  }

  if (subCommand === "join") {
    const playerData = getPlayerData(threadId, senderId);

    await sendMessageFromSQL(api, message,
      { message: `🌀 ĐẠO HỮU PHI THĂNG THÀNH CÔNG!\n\n` +
      `💎 Linh Thạch: ${playerData.linhthach.toLocaleString()}\n` +
      `🔄 Lượt Nhập Định: ${playerData.tuTurns}\n` +
      `❤️ Sinh Mệnh: ${playerData.hp}/${playerData.maxHp}\n` +
      `⭐ Tu Vi: Cấp ${playerData.level} (Kinh Nghiệm: ${playerData.exp}/${playerData.nextExp})\n` +
      `✨ Thưởng EXP: +${playerData.expBonus}%\n` +
      `🎲 May Mắn: +${playerData.rareBonus}%\n` +
      `🛡️ Giảm Nguy Hiểm: -${playerData.riskReduce}%\n\n` +
      `Sử dụng 'daily' nhận thưởng, 'tu' nhập định!`, success: true }, true, 3600000
    );
    return;
  }

  if (subCommand === "leave") {
    await sendMessageFromSQL(api, message, { message: `🌀 Đạo hữu quy ẩn phàm trần. Tu vi được lưu giữ!`, success: true }, true, 3600000);
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
  const command = args[0]?.toLowerCase();

  const validCommands = ["daily", "tu", "rest", "sell", "product", "buy", "shop", "info", "help", "consume", "rank"];
  if (!validCommands.includes(command)) return;

  const commandKey = `${threadId}_${senderId}`;
  const now = Date.now();
  const lastCommand = lastCommandMap.get(commandKey);
  
  if (lastCommand && now - lastCommand < 500) return;
  lastCommandMap.set(commandKey, now);

  const playerData = getPlayerData(threadId, senderId);

  if (command === "help") {
    await sendMessageFromSQL(api, message,
      { message: `🌀 TRỢ GIÚP TU ĐẠO\n\n` +
      `• daily: Thưởng lượt + linh thạch\n` +
      `• tu [1-50]: Nhập định ngộ đạo\n` +
      `• rest: Tĩnh tọa hồi sinh mệnh\n` +
      `• product: Trữ vật kiểm kê\n` +
      `• sell [index] [số]: Đổi linh thạch\n` +
      `• sell all: Toàn bộ thanh lý\n` +
      `• shop: Tàng bảo mua sắm\n` +
      `• buy [index] [số]: Thu mua bảo vật\n` +
      `• consume [index] [số]: Hấp thụ linh dược\n` +
      `• info [@tag]: Tu vi chi tiết\n` +
      `• rank: Thiên tài tranh phong\n\n` +
      `💡 Bí Quyết: Tu luyện rủi ro cao nhưng thưởng lớn. Dùng hộ thân phù giảm nguy!`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "rank") {
    const allPlayers = [];
    
    for (const [key, data] of playerDataMap.entries()) {
      if (key.startsWith(`${threadId}_`)) {
        const userId = key.split('_')[1];
        allPlayers.push({
          userId: userId,
          level: data.level,
          exp: data.exp,
          linhthach: data.linhthach,
          totalTu: data.totalTu,
          tuTurns: data.tuTurns
        });
      }
    }

    allPlayers.sort((a, b) => b.level - a.level || b.exp - a.exp);

    if (allPlayers.length === 0) {
      await sendMessageFromSQL(api, message, { message: `Chưa có đạo hữu nào phi thăng!`, success: false }, true, 3600000);
      return;
    }

    const top10 = allPlayers.slice(0, 10);
    const topNames = await Promise.all(top10.map(async (player) => {
      try {
        const userInfo = await getUserInfoData(api, player.userId);
        return userInfo.name || player.userId.slice(-4);
      } catch {
        return player.userId.slice(-4);
      }
    }));

    const rankList = top10.map((player, idx) => {
      const medal = idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}️⃣`;
      const name = topNames[idx];
      return `${medal} ${name}\n   ⭐ Cấp ${player.level} | 💎 ${player.linhthach.toLocaleString()} | 🔄 ${player.totalTu} lần`;
    }).join("\n\n");

    await sendMessageFromSQL(api, message,
      { message: `🏆 THIÊN TÀI BẢNG - TOP PHI THĂNG\n\n` +
      `${rankList}\n\n` +
      `Cấp độ quyết định địa vị tiên giới!`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "buff") {
    if (!admins.includes(senderId)) {
      return;
    }

    const mentions = message.data.mentions;
    const amountArg = parseInt(args[1]);

    if (!amountArg || amountArg < 1) {
      await sendMessageFromSQL(api, message, { message: `Lệnh: buff [số] [@tag]`, success: false }, true, 3600000);
      return;
    }

    if (!mentions || mentions.length === 0) {
      playerData.linhthach += amountArg;
      await sendMessageFromSQL(api, message,
        { message: `🌀 BUFF TU VI!\n\n` +
        `💎 +${amountArg.toLocaleString()} linh thạch\n` +
        `💎 Tổng: ${playerData.linhthach.toLocaleString()}`, success: true }, true, 3600000
      );
      return;
    }

    let buffResults = [];
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
      
      const targetData = getPlayerData(threadId, targetId);
      targetData.linhthach += amountArg;
      buffResults.push(`${targetName}: +${amountArg.toLocaleString()}`);
    }

    await sendMessageFromSQL(api, message,
      { message: `🌀 BUFF ĐA NHÂN!\n\n` +
      `${buffResults.join("\n")}`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "daily") {
    const now = Date.now();
    const lastDaily = playerData.lastDaily;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastDaily < oneDayMs) {
      const timeLeft = oneDayMs - (now - lastDaily);
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      await sendMessageFromSQL(api, message, { message: `⏳ Đã điểm danh hôm nay! Chờ ${hoursLeft}h ${minutesLeft}m`, success: false }, true, 3600000);
      return;
    }

    playerData.lastDaily = now;
    const turnsReward = Math.floor(Math.random() * 31) + 20;
    playerData.tuTurns += turnsReward;
    playerData.linhthach += 200;

    await sendMessageFromSQL(api, message,
      { message: `🌅 ĐIỂM DANH THÀNH CÔNG!\n\n` +
      `🎁 +${turnsReward} lượt nhập định\n` +
      `💎 +200 linh thạch\n\n` +
      `🔄 Tổng lượt: ${playerData.tuTurns}\n` +
      `💎 Tổng thạch: ${playerData.linhthach.toLocaleString()}`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "tu") {
    const times = parseInt(args[1]) || 1;
    if (times < 1 || times > 50) {
      await sendMessageFromSQL(api, message, { message: `Số lần nhập định: 1-50!`, success: false }, true, 3600000);
      return;
    }

    if (playerData.tuTurns < times) {
      await sendMessageFromSQL(api, message, { message: `Chỉ còn ${playerData.tuTurns} lượt! Mua thêm ở tàng bảo các (10 thạch/10 lượt)`, success: false }, true, 3600000);
      return;
    }

    const delayTime = Math.floor(Math.random() * 4000) + 3000;
    
    await sendMessageFromSQL(api, message, { message: `🧘 Đang nhập định ngộ đạo...`, success: true }, true, delayTime);
    
    await delay(delayTime);

    playerData.tuTurns -= times;
    playerData.totalTu += times;
    
    let results = [];
    let totalExp = 0;
    let totalHpLoss = 0;
    let leveledUp = false;

    for (let i = 0; i < times; i++) {
      const rarity = calculateRarity(100, playerData.rareBonus);
      const pillName = getPillByRarity(rarity);
      const pillInfo = LINHDUOC_DATA[pillName];
      
      const expGained = Math.floor(pillInfo.expGain * (1 + playerData.expBonus / 100));
      totalExp += expGained;
      
      const risk = Math.max(0, pillInfo.risk - playerData.riskReduce);
      const hpLoss = Math.floor(Math.random() * risk) + 1;
      totalHpLoss += hpLoss;
      playerData.hp = Math.max(0, playerData.hp - hpLoss);
      
      if (!playerData.inventory[pillName]) {
        playerData.inventory[pillName] = 0;
      }
      playerData.inventory[pillName]++;
      
      results.push(`${pillInfo.emoji} ${pillName} (EXP +${expGained}, HP -${hpLoss})`);
      
      playerData.exp += expGained;
      leveledUp = levelUp(playerData) || leveledUp;
    }

    playerData.hp = Math.min(playerData.maxHp + playerData.hpBonus, playerData.hp);

    const resultText = times <= 5 
      ? results.join("\n• ")
      : Object.entries(results.reduce((acc, r) => {
          const name = r.split(' ')[1];
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {})).map(([pill, count]) => `${LINHDUOC_DATA[pill].emoji} ${pill} x${count}`).join("\n• ");

    const levelMsg = leveledUp ? `\n\n🚀 PHÁ CẢNH THÀNH CÔNG! Cấp ${playerData.level}, HP max +50` : "";

    await sendMessageFromSQL(api, message,
      { message: `🌀 KẾT QUẢ NHẬP ĐỊNH\n\n` +
      `• ${resultText}\n\n` +
      `📈 Tổng EXP: +${totalExp}\n` +
      `❤️ Mất Sinh Mệnh: -${totalHpLoss}\n` +
      `🔄 Lượt Còn: ${playerData.tuTurns}\n` +
      `⭐ Hiện Tại: Cấp ${playerData.level} (${playerData.exp}/${playerData.nextExp})${levelMsg}`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "rest") {
    const recover = Math.floor(playerData.maxHp * 0.3) + 20;
    playerData.hp = Math.min(playerData.maxHp, playerData.hp + recover);
    playerData.tuTurns = Math.max(0, playerData.tuTurns - 1);

    await sendMessageFromSQL(api, message,
      { message: `😌 TĨNH TỌA HỒI PHỤC!\n\n` +
      `❤️ +${recover} sinh mệnh\n` +
      `❤️ Hiện Tại: ${playerData.hp}/${playerData.maxHp}\n` +
      `🔄 Đã dùng 1 lượt nhập định`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "product") {
    if (Object.keys(playerData.inventory).length === 0) {
      await sendMessageFromSQL(api, message, { message: `Trữ vật giới trống không!`, success: false }, true, 3600000);
      return;
    }

    const inventoryList = Object.entries(playerData.inventory)
      .filter(([_, count]) => count > 0)
      .map(([pill, count], idx) => 
        `${idx + 1}. ${LINHDUOC_DATA[pill].emoji} ${pill}: x${count} (Giá: ${(LINHDUOC_DATA[pill].price * count).toLocaleString()} thạch)`
      ).join("\n");

    await sendMessageFromSQL(api, message,
      { message: `🎒 TRỮ VẬT GIỚI\n\n` +
      `${inventoryList}\n\n` +
      `Sử dụng 'sell' hoặc 'consume' để xử lý.`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "sell") {
    if (args[1] === "all") {
      let totalEarned = 0;
      let soldItems = [];

      for (const [pill, count] of Object.entries(playerData.inventory)) {
        if (count > 0) {
          const earned = LINHDUOC_DATA[pill].price * count;
          totalEarned += earned;
          soldItems.push(`${LINHDUOC_DATA[pill].emoji} ${pill} x${count}`);
          playerData.inventory[pill] = 0;
        }
      }

      if (totalEarned === 0) {
        await sendMessageFromSQL(api, message, { message: `Không có linh dược để bán!`, success: false }, true, 3600000);
        return;
      }

      playerData.linhthach += totalEarned;
      await sendMessageFromSQL(api, message,
        { message: `💰 THANH LÝ TOÀN BỘ!\n\n` +
        `${soldItems.join("\n")}\n\n` +
        `💎 Thu Về: +${totalEarned.toLocaleString()} thạch\n` +
        `💎 Số Dư: ${playerData.linhthach.toLocaleString()}`, success: true }, true, 3600000
      );
      return;
    }

    const index = parseInt(args[1]);
    const amount = parseInt(args[2]);

    if (!index || !amount || amount < 1) {
      await sendMessageFromSQL(api, message, { message: `Lệnh: sell [index] [số lượng]`, success: false }, true, 3600000);
      return;
    }

    const inventoryArray = Object.entries(playerData.inventory).filter(([_, count]) => count > 0);
    if (index < 1 || index > inventoryArray.length) {
      await sendMessageFromSQL(api, message, { message: `Index sai! Dùng 'product' xem danh sách.`, success: false }, true, 3600000);
      return;
    }

    const [pillName, currentCount] = inventoryArray[index - 1];
    if (amount > currentCount) {
      await sendMessageFromSQL(api, message, { message: `Chỉ có ${currentCount} ${pillName}!`, success: false }, true, 3600000);
      return;
    }

    const earned = LINHDUOC_DATA[pillName].price * amount;
    playerData.inventory[pillName] -= amount;
    playerData.linhthach += earned;

    await sendMessageFromSQL(api, message,
      { message: `💰 BÁN LINH DƯỢC!\n\n` +
      `${LINHDUOC_DATA[pillName].emoji} ${pillName} x${amount}\n` +
      `💎 +${earned.toLocaleString()} thạch\n` +
      `💎 Số Dư: ${playerData.linhthach.toLocaleString()}`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "shop") {
    const shopList = SHOP_ITEMS.map(item => {
      if (item.type === "turns") {
        return `${item.id}. ${item.emoji} ${item.name}\n   💎 ${item.price.toLocaleString()} thạch`;
      } else if (item.type === "potion") {
        return `${item.id}. ${item.emoji} ${item.name}\n   💎 ${item.price.toLocaleString()} thạch | Hồi +${item.bonus} HP`;
      }
      return `${item.id}. ${item.emoji} ${item.name}\n   💎 ${item.price.toLocaleString()} thạch | +${item.bonus} ${item.type === "exp_bonus" ? "EXP" : item.type === "rare_bonus" ? "may mắn" : item.type === "hp_bonus" ? "HP max" : "giảm rủi ro"}%`;
    }).join("\n\n");

    await sendMessageFromSQL(api, message,
      { message: `🏛️ TÀNG BẢO CÁC\n\n` +
      `${shopList}\n\n` +
      `Lệnh: buy [index] [số lượng]`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "buy") {
    const index = parseInt(args[1]);
    const amount = parseInt(args[2]) || 1;

    if (!index || amount < 1) {
      await sendMessageFromSQL(api, message, { message: `Lệnh: buy [index] [số lượng]`, success: false }, true, 3600000);
      return;
    }

    const item = SHOP_ITEMS.find(i => i.id === index);
    if (!item) {
      await sendMessageFromSQL(api, message, { message: `Bảo vật không tồn tại! Xem 'shop'.`, success: false }, true, 3600000);
      return;
    }

    const totalCost = item.price * amount;
    if (playerData.linhthach < totalCost) {
      await sendMessageFromSQL(api, message, { message: `Thiếu thạch! Cần ${totalCost.toLocaleString()}.`, success: false }, true, 3600000);
      return;
    }

    playerData.linhthach -= totalCost;

    if (item.type === "turns") {
      playerData.tuTurns += 10 * amount;
      await sendMessageFromSQL(api, message,
        { message: `🛒 MUA THÀNH CÔNG!\n\n` +
        `${item.emoji} ${item.name} x${amount}\n` +
        `💎 -${totalCost.toLocaleString()} thạch\n` +
        `💎 Còn: ${playerData.linhthach.toLocaleString()}\n` +
        `🔄 Lượt: ${playerData.tuTurns}`, success: true }, true, 3600000
      );
    } else if (item.type === "potion") {
      if (!playerData.inventory[item.name]) playerData.inventory[item.name] = 0;
      playerData.inventory[item.name] += amount;
      await sendMessageFromSQL(api, message,
        { message: `🛒 MUA THÀNH CÔNG!\n\n` +
        `${item.emoji} ${item.name} x${amount}\n` +
        `💎 -${totalCost.toLocaleString()} thạch\n` +
        `💎 Còn: ${playerData.linhthach.toLocaleString()}`, success: true }, true, 3600000
      );
    } else {
      if (item.type === "exp_bonus") playerData.expBonus += item.bonus * amount;
      if (item.type === "rare_bonus") playerData.rareBonus += item.bonus * amount;
      if (item.type === "hp_bonus") {
        playerData.maxHp += item.bonus * amount;
        playerData.hp += item.bonus * amount;
      }
      if (item.type === "risk_reduce") playerData.riskReduce += item.bonus * amount;
      await sendMessageFromSQL(api, message,
        { message: `🛒 MUA THÀNH CÔNG!\n\n` +
        `${item.emoji} ${item.name} x${amount}\n` +
        `💎 -${totalCost.toLocaleString()} thạch\n` +
        `💎 Còn: ${playerData.linhthach.toLocaleString()}\n` +
        `${item.type === "exp_bonus" ? `📈 EXP thưởng: +${playerData.expBonus}%` : 
          item.type === "rare_bonus" ? `🎲 May mắn: +${playerData.rareBonus}%` : 
          item.type === "hp_bonus" ? `🛡️ HP max: ${playerData.maxHp}` : 
          `🛡️ Giảm rủi: -${playerData.riskReduce}%`}`, success: true }, true, 3600000
      );
    }
    return;
  }

  if (command === "consume") {
    const index = parseInt(args[1]);
    const amount = parseInt(args[2]) || 1;

    if (!index || amount < 1) {
      await sendMessageFromSQL(api, message, { message: `Lệnh: consume [index] [số lượng]`, success: false }, true, 3600000);
      return;
    }

    const inventoryArray = Object.entries(playerData.inventory).filter(([_, count]) => count > 0);
    if (index < 1 || index > inventoryArray.length) {
      await sendMessageFromSQL(api, message, { message: `Index sai! Xem 'product'.`, success: false }, true, 3600000);
      return;
    }

    const [pillName, currentCount] = inventoryArray[index - 1];
    if (amount > currentCount) {
      await sendMessageFromSQL(api, message, { message: `Chỉ có ${currentCount} ${pillName}!`, success: false }, true, 3600000);
      return;
    }

    const pillInfo = LINHDUOC_DATA[pillName];
    const expGained = Math.floor(pillInfo.expGain * amount * (1 + playerData.expBonus / 100));
    const hpRecovered = Math.floor(pillInfo.hpRecover * amount);
    playerData.inventory[pillName] -= amount;
    playerData.exp += expGained;
    playerData.hp = Math.min(playerData.maxHp, playerData.hp + hpRecovered);
    const leveled = levelUp(playerData);

    await sendMessageFromSQL(api, message,
      { message: `💊 HẤP THỤ LINH DƯỢC!\n\n` +
      `${pillInfo.emoji} ${pillName} x${amount}\n` +
      `📈 +${expGained} kinh nghiệm\n` +
      `❤️ +${hpRecovered} sinh mệnh\n\n` +
      `⭐ Tu Vi: Cấp ${playerData.level} (${playerData.exp}/${playerData.nextExp})${leveled ? " (Phá cảnh!)" : ""}\n` +
      `❤️ HP: ${playerData.hp}/${playerData.maxHp}`, success: true }, true, 3600000
    );
    return;
  }

  if (command === "info") {
    const mentions = message.data.mentions;
    
    if (!mentions || mentions.length === 0) {
      const inventoryValue = Object.entries(playerData.inventory)
        .reduce((sum, [pill, count]) => sum + (LINHDUOC_DATA[pill].price * count), 0);

      await sendMessageFromSQL(api, message,
        { message: `🌀 TU VI ĐẠO HỮU\n\n` +
        `💎 Linh Thạch: ${playerData.linhthach.toLocaleString()}\n` +
        `🔄 Lượt Nhập Định: ${playerData.tuTurns}\n` +
        `❤️ Sinh Mệnh: ${playerData.hp}/${playerData.maxHp}\n` +
        `⭐ Cấp Độ: ${playerData.level} (EXP: ${playerData.exp}/${playerData.nextExp})\n` +
        `📈 EXP Thưởng: +${playerData.expBonus}%\n` +
        `🎲 May Mắn: +${playerData.rareBonus}%\n` +
        `🛡️ Giảm Rủi: -${playerData.riskReduce}%\n` +
        `🔢 Tổng Nhập Định: ${playerData.totalTu}\n` +
        `💰 Giá Trị Trữ Vật: ${inventoryValue.toLocaleString()} thạch`, success: true }, true, 3600000
      );
      return;
    }

    const targetId = mentions[0].uid;
    const targetData = getPlayerData(threadId, targetId);
    const inventoryValue = Object.entries(targetData.inventory)
      .reduce((sum, [pill, count]) => sum + (LINHDUOC_DATA[pill].price * count), 0);

    await sendMessageFromSQL(api, message,
      { message: `🌀 TU VI ĐẠO HỮU\n\n` +
      `💎 Linh Thạch: ${targetData.linhthach.toLocaleString()}\n` +
      `🔄 Lượt Nhập Định: ${targetData.tuTurns}\n` +
      `❤️ Sinh Mệnh: ${targetData.hp}/${targetData.maxHp}\n` +
      `⭐ Cấp Độ: ${targetData.level} (EXP: ${targetData.exp}/${targetData.nextExp})\n` +
      `📈 EXP Thưởng: +${targetData.expBonus}%\n` +
      `🎲 May Mắn: +${targetData.rareBonus}%\n` +
      `🛡️ Giảm Rủi: -${targetData.riskReduce}%\n` +
      `🔢 Tổng Nhập Định: ${targetData.totalTu}\n` +
      `💰 Giá Trị Trữ Vật: ${inventoryValue.toLocaleString()} thạch`, success: true }, true, 3600000
    );
    return;
  }
}
