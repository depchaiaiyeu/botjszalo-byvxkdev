import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning, sendMessageQuery } from "../../chat-zalo/chat-style/chat-style.js";
import { admins } from "../../../index.js";

const playerDataMap = new Map();
const lastCommandMap = new Map();

const FISHING_LOCATIONS = [
  { name: "bến cảng thượng hải", normalized: "bencangthượnghải", emoji: "🏙️", description: "Bến cảng hiện đại", fish: ["Cá Mè", "Cá Chép", "Cá Rô", "Cá Thu", "Cá Ngừ", "Cá Hồng", "Cá Bạc Má", "Cá Chim"] },
  { name: "hồ tây", normalized: "hồtay", emoji: "🌊", description: "Hồ nước ngọt yên bình", fish: ["Cá Chép", "Cá Rô", "Cá Trắm", "Cá Mè", "Cá Trê", "Cá Hú"] },
  { name: "vịnh hạ long", normalized: "vịnhhạlong", emoji: "⛰️", description: "Di sản thiên nhiên", fish: ["Cá Mú", "Cá Hồng", "Cá Chim", "Cá Ngừ", "Cá Thu", "Cá Bạc Má"] },
  { name: "sông mê kông", normalized: "songmêkông", emoji: "🌾", description: "Dòng sông huyền thoại", fish: ["Cá Trê", "Cá Lăng", "Cá Hú", "Cá Trắm", "Cá Rô", "Cá Mú"] },
  { name: "biển nha trang", normalized: "biểnnhatrang", emoji: "🏖️", description: "Bãi biển đẹp nhất", fish: ["Cá Thu", "Cá Ngừ", "Cá Hồng", "Cá Chim", "Cá Bạc Má", "Cá Mú"] }
];

const FISH_DATA = {
  "Cá Mè": { rarity: "common", price: 50, emoji: "🐟", turnBonus: 10 },
  "Cá Chép": { rarity: "common", price: 60, emoji: "🐟", turnBonus: 10 },
  "Cá Rô": { rarity: "common", price: 55, emoji: "🐟", turnBonus: 10 },
  "Cá Trê": { rarity: "common", price: 70, emoji: "🐟", turnBonus: 10 },
  "Cá Trắm": { rarity: "uncommon", price: 120, emoji: "🐠", turnBonus: 20 },
  "Cá Thu": { rarity: "uncommon", price: 150, emoji: "🐠", turnBonus: 20 },
  "Cá Lăng": { rarity: "uncommon", price: 180, emoji: "🐠", turnBonus: 20 },
  "Cá Hú": { rarity: "rare", price: 300, emoji: "🐡", turnBonus: 50 },
  "Cá Mú": { rarity: "rare", price: 350, emoji: "🐡", turnBonus: 50 },
  "Cá Hồng": { rarity: "rare", price: 400, emoji: "🐡", turnBonus: 50 },
  "Cá Ngừ": { rarity: "epic", price: 800, emoji: "🦈", turnBonus: 100 },
  "Cá Chim": { rarity: "epic", price: 900, emoji: "🦈", turnBonus: 100 },
  "Cá Bạc Má": { rarity: "legendary", price: 2000, emoji: "🐋", turnBonus: 200 }
};

const SHOP_ITEMS = [
  { id: 1, name: "Cần câu cơ bản", price: 500, type: "rod", bonus: 0, emoji: "🎣" },
  { id: 2, name: "Cần câu nâng cao", price: 2000, type: "rod", bonus: 5, emoji: "🎣" },
  { id: 3, name: "Cần câu chuyên nghiệp", price: 8000, type: "rod", bonus: 15, emoji: "🎣" },
  { id: 4, name: "Cần câu siêu cấp", price: 20000, type: "rod", bonus: 25, emoji: "🎣" },
  { id: 5, name: "Mồi câu thường", price: 100, type: "bait", bonus: 3, emoji: "🪱" },
  { id: 6, name: "Mồi câu đặc biệt", price: 300, type: "bait", bonus: 8, emoji: "🪱" },
  { id: 7, name: "Mồi câu cao cấp", price: 800, type: "bait", bonus: 15, emoji: "🪱" },
  { id: 8, name: "Phao câu thường", price: 500, type: "float", bonus: 5, emoji: "🎈" },
  { id: 9, name: "Phao câu may mắn", price: 1500, type: "float", bonus: 10, emoji: "🎈" },
  { id: 10, name: "Phao câu huyền thoại", price: 5000, type: "float", bonus: 20, emoji: "🎈" },
  { id: 11, name: "Lưới bắt cá", price: 3000, type: "net", bonus: 12, emoji: "🕸️" },
  { id: 12, name: "Thuyền đánh cá", price: 15000, type: "boat", bonus: 30, emoji: "⛵" },
  { id: 13, name: "Máy dò cá", price: 10000, type: "sonar", bonus: 22, emoji: "📡" },
  { id: 14, name: "Áo phao cứu sinh", price: 2500, type: "vest", bonus: 8, emoji: "🦺" },
  { id: 15, name: "Kính lặn", price: 1800, type: "goggles", bonus: 7, emoji: "🥽" },
  { id: 16, name: "Lượt câu (x10)", price: 10, type: "turns", bonus: 0, emoji: "🎫" }
];

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function findLocation(locationInput) {
  const normalized = normalizeText(locationInput);
  return FISHING_LOCATIONS.find(loc => normalizeText(loc.name) === normalized || loc.normalized === normalized);
}

function getPlayerData(threadId, userId) {
  const key = `${threadId}_${userId}`;
  if (!playerDataMap.has(key)) {
    playerDataMap.set(key, {
      money: 1000,
      fishingTurns: Math.floor(Math.random() * 51) + 50,
      inventory: {},
      location: null,
      equipment: { rod: null, bait: null, float: null },
      rareBonus: 0,
      lastDaily: 0,
      totalFished: 0
    });
  }
  return playerDataMap.get(key);
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

function getFishByRarity(location, rarity) {
  const availableFish = location.fish.filter(fishName => FISH_DATA[fishName].rarity === rarity);
  if (availableFish.length === 0) {
    const allFish = location.fish;
    return allFish[Math.floor(Math.random() * allFish.length)];
  }
  return availableFish[Math.floor(Math.random() * availableFish.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleFishingCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  const args = content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (command !== `${prefix}cauca`) return;

  const subCommand = args[1]?.toLowerCase();

  if (!subCommand) {
    await sendMessageComplete(api, message, 
      `🎣 HƯỚNG DẪN GAME CÂU CÁ\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 LỆNH CƠ BẢN:\n` +
      `→ ${prefix}cauca join: Tham gia trò chơi\n` +
      `→ ${prefix}cauca leave: Rời khỏi trò chơi\n\n` +
      `📌 LỆNH ĐỂ CHƠI (Cần ${prefix}cauca join để sử dụng):\n` +
      `→ daily: Điểm danh nhận lượt câu\n` +
      `→ goto [địa điểm]: Di chuyển đến địa điểm câu\n` +
      `→ cau [số lần]: Câu cá (mặc định 1 lần)\n` +
      `→ product: Xem túi đồ\n` +
      `→ sell [index] [số lượng]: Bán đồ\n` +
      `→ sell all: Bán tất cả\n` +
      `→ shop: Xem cửa hàng\n` +
      `→ buy [index] [số lượng]: Mua đồ\n` +
      `→ info: Xem thông tin cá nhân\n` +
      `→ buff [số tiền] [@mentions]: Buff xu cho chính mình hoặc người nhận\n` +
      `→ help: Xem trợ giúp chi tiết\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 ĐỊA ĐIỂM: Bến cảng Thượng Hải, Hồ Tây,\nVịnh Hạ Long, Sông Mê Kông, Biển Nha Trang\n` +
      `━━━━━━━━━━━━━━━━━━━━`,
      86400000
    );
    return;
  }

  if (subCommand === "join") {
    const activeGames = getActiveGames();
    if (activeGames.has(threadId)) {
      const gameData = activeGames.get(threadId);
      if (gameData.type === "cauca" && gameData.game.players.has(senderId)) {
        await sendMessageWarning(api, message, "Bạn đã tham gia trò chơi câu cá rồi!");
        return;
      }
    }

    if (!activeGames.has(threadId)) {
      activeGames.set(threadId, {
        type: "cauca",
        game: { players: new Set() }
      });
    }

    const gameData = activeGames.get(threadId);
    gameData.game.players.add(senderId);
    const playerData = getPlayerData(threadId, senderId);

    await sendMessageComplete(api, message,
      `🎉 Chào mừng bạn đến với thế giới câu cá!\n\n` +
      `💰 Tiền: ${playerData.money.toLocaleString()} xu\n` +
      `🎣 Lượt câu: ${playerData.fishingTurns}\n\n` +
      `Hãy dùng lệnh "daily" để điểm danh hàng ngày!\n` +
      `Dùng "goto [địa điểm]" để bắt đầu câu cá!`
    );
    return;
  }

  if (subCommand === "leave") {
    const activeGames = getActiveGames();
    if (!activeGames.has(threadId) || activeGames.get(threadId).type !== "cauca") {
      await sendMessageWarning(api, message, "Không có trò chơi câu cá nào đang diễn ra!");
      return;
    }

    const gameData = activeGames.get(threadId);
    if (!gameData.game.players.has(senderId)) {
      await sendMessageWarning(api, message, "Bạn chưa tham gia trò chơi!");
      return;
    }

    gameData.game.players.delete(senderId);
    
    if (gameData.game.players.size === 0) {
      activeGames.delete(threadId);
    }
    
    await sendMessageComplete(api, message, "Bạn đã rời khỏi trò chơi câu cá. Dữ liệu của bạn đã được lưu!");
    return;
  }
}

export async function handleFishingMessage(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  const activeGames = getActiveGames();
  if (!activeGames.has(threadId) || activeGames.get(threadId).type !== "cauca") {
    return;
  }

  const gameData = activeGames.get(threadId);
  if (!gameData.game.players.has(senderId)) {
    return;
  }

  if (typeof content !== "string") return;

  const contentStr = String(content).trim();
  if (contentStr.startsWith(prefix)) return;

  const args = contentStr.split(/\s+/);
  const command = args[0]?.toLowerCase();

  const validCommands = ["daily", "goto", "cau", "sell", "product", "buy", "shop", "info", "help", "buff"];
  if (!validCommands.includes(command)) return;

  const commandKey = `${threadId}_${senderId}`;
  const now = Date.now();
  const lastCommand = lastCommandMap.get(commandKey);
  
  if (lastCommand && now - lastCommand < 500) return;
  lastCommandMap.set(commandKey, now);

  const playerData = getPlayerData(threadId, senderId);

  if (command === "help") {
    await sendMessageComplete(api, message,
      `🎣 TRỢ GIÚP GAME CÂU CÁ\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 CÁC LỆNH:\n\n` +
      `🔹 daily - Điểm danh nhận lượt câu\n` +
      `🔹 goto [địa điểm] - Di chuyển\n` +
      `🔹 cau [số lần] - Câu cá\n` +
      `🔹 product - Xem túi đồ\n` +
      `🔹 sell [index] [số lượng] - Bán cá\n` +
      `🔹 sell all - Bán tất cả\n` +
      `🔹 shop - Xem cửa hàng\n` +
      `🔹 buy [index] [số lượng] - Mua đồ\n` +
      `🔹 buff [số tiền] [@mentions] - Buff xu cho chính mình hoặc người nhận(OA)\n` +       
      `🔹 info - Thông tin cá nhân\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 MẸO:\n` +
      `• Mua trang bị tăng tỉ lệ cá hiếm\n` +
      `• Câu cá để nhận thêm lượt câu miễn phí\n` +
      `• Câu được cá hiếm sẽ tặng nhiều lượt câu hơn\n` +
      `━━━━━━━━━━━━━━━━━━━━`,
      86400000
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
      await sendMessageWarning(api, message, "Cú pháp: buff [số tiền] hoặc buff [số tiền] @mentions");
      return;
    }

    if (!mentions || mentions.length === 0) {
      playerData.money += amountArg;
      await sendMessageComplete(api, message,
        `💲 BUFF THÀNH CÔNG!\n\n` +
        `💰 Đã cộng: +${amountArg.toLocaleString()} xu\n` +
        `💰 Tổng tiền: ${playerData.money.toLocaleString()} xu`
      );
      return;
    }

    let buffResults = [];
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
      const targetData = getPlayerData(threadId, targetId);
      targetData.money += amountArg;
      buffResults.push(`${targetName}: +${amountArg.toLocaleString()} xu`);
    }

    await sendMessageComplete(api, message,
      `💲 BUFF THÀNH CÔNG!\n\n` +
      `${buffResults.join("\n")}`
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
      await sendMessageWarning(api, message, `⏰ Bạn đã điểm danh hôm nay rồi!\nThời gian còn lại: ${hoursLeft}h ${minutesLeft}m`);
      return;
    }

    playerData.lastDaily = now;
    const turnsReward = Math.floor(Math.random() * 51) + 50;
    playerData.fishingTurns += turnsReward;
    playerData.money += 100;

    await sendMessageComplete(api, message,
      `✅ ĐIỂM DANH THÀNH CÔNG!\n\n` +
      `🎁 Phần thưởng:\n` +
      `+ ${turnsReward} lượt câu cá\n` +
      `+ 100 xu\n\n` +
      `🎣 Tổng lượt câu: ${playerData.fishingTurns}\n` +
      `💰 Tổng tiền: ${playerData.money.toLocaleString()} xu`
    );
    return;
  }

  if (command === "goto") {
    const locationInput = args.slice(1).join(" ");
    if (!locationInput) {
      const locationList = FISHING_LOCATIONS.map((loc, idx) => 
        `${idx + 1}. ${loc.emoji} ${loc.name} - ${loc.description}`
      ).join("\n");
      
      await sendMessageComplete(api, message,
        `🌍 DANH SÁCH ĐỊA ĐIỂM CÂU CÁ\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${locationList}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Dùng: goto [tên địa điểm]`,
        86400000
      );
      return;
    }

    const location = findLocation(locationInput);
    if (!location) {
      await sendMessageWarning(api, message, "🚫 Không tìm thấy địa điểm này!");
      return;
    }

    playerData.location = location.name;
    await sendMessageComplete(api, message,
      `${location.emoji} Bạn đã đến: ${location.name}\n` +
      `📝 ${location.description}\n\n` +
      `🐟 Các loại cá có thể câu:\n` +
      `${location.fish.map(f => `${FISH_DATA[f].emoji} ${f}`).join(", ")}\n\n` +
      `Dùng lệnh "cau" để bắt đầu câu cá!`
    );
    return;
  }

  if (command === "cau") {
    if (!playerData.location) {
      await sendMessageWarning(api, message, "Bạn chưa chọn địa điểm! Dùng lệnh 'goto [địa điểm]'");
      return;
    }

    const times = parseInt(args[1]) || 1;
    if (times < 1 || times > 50) {
      await sendMessageWarning(api, message, "Số lần câu phải từ 1 đến 50!");
      return;
    }

    if (playerData.fishingTurns < times) {
      await sendMessageWarning(api, message, `Bạn chỉ còn ${playerData.fishingTurns} lượt câu! Mua thêm trong shop (10 xu/10 lượt)`);
      return;
    }

    const delayTime = Math.floor(Math.random() * 3000) + 2000;
    
    await sendMessageComplete(api, message, `🎣 Đang thả câu...`, delayTime);
    
    await delay(delayTime);

    const location = FISHING_LOCATIONS.find(loc => loc.name === playerData.location);
    playerData.fishingTurns -= times;
    
    let results = [];
    let totalValue = 0;
    let totalTurnsGained = 0;

    for (let i = 0; i < times; i++) {
      const rarity = calculateRarity(100, playerData.rareBonus);
      const fishName = getFishByRarity(location, rarity);
      const fishInfo = FISH_DATA[fishName];
      
      if (!playerData.inventory[fishName]) {
        playerData.inventory[fishName] = 0;
      }
      playerData.inventory[fishName]++;
      playerData.totalFished++;
      totalValue += fishInfo.price;
      totalTurnsGained += fishInfo.turnBonus;
      
      results.push(`${fishInfo.emoji} ${fishName}`);
    }

    playerData.fishingTurns += totalTurnsGained;

    const resultText = times <= 10 
      ? results.join(", ")
      : Object.entries(results.reduce((acc, fish) => {
          acc[fish] = (acc[fish] || 0) + 1;
          return acc;
        }, {})).map(([fish, count]) => `${fish} x${count}`).join("\n");

    await sendMessageComplete(api, message,
      `🎣 KẾT QUẢ CÂU CÁ\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${resultText}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💎 Tổng giá trị: ${totalValue.toLocaleString()} xu\n` +
      `🎫 Lượt câu nhận được: +${totalTurnsGained}\n` +
      `🎣 Lượt còn lại: ${playerData.fishingTurns}`
    );
    return;
  }

  if (command === "product") {
    if (Object.keys(playerData.inventory).length === 0) {
      await sendMessageWarning(api, message, "Túi đồ của bạn trống!");
      return;
    }

    const inventoryList = Object.entries(playerData.inventory)
      .filter(([_, count]) => count > 0)
      .map(([fish, count], idx) => 
        `${idx + 1}. ${FISH_DATA[fish].emoji} ${fish}: ${count} (${(FISH_DATA[fish].price * count).toLocaleString()} xu)`
      ).join("\n");

    await sendMessageComplete(api, message,
      `🎒 TÚI ĐỒ CỦA BẠN\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${inventoryList}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Dùng: sell [index] [số lượng] để bán`,
      86400000
    );
    return;
  }

  if (command === "sell") {
    if (args[1] === "all") {
      let totalEarned = 0;
      let soldItems = [];

      for (const [fish, count] of Object.entries(playerData.inventory)) {
        if (count > 0) {
          const earned = FISH_DATA[fish].price * count;
          totalEarned += earned;
          soldItems.push(`${FISH_DATA[fish].emoji} ${fish} x${count}`);
          playerData.inventory[fish] = 0;
        }
      }

      if (totalEarned === 0) {
        await sendMessageWarning(api, message, "Không có gì để bán!");
        return;
      }

      playerData.money += totalEarned;
      await sendMessageComplete(api, message,
        `💰 ĐÃ BÁN TẤT CẢ!\n\n` +
        `${soldItems.join("\n")}\n\n` +
        `💵 Tổng thu: +${totalEarned.toLocaleString()} xu\n` +
        `💰 Số dư: ${playerData.money.toLocaleString()} xu`
      );
      return;
    }

    const index = parseInt(args[1]);
    const amount = parseInt(args[2]);

    if (!index || !amount || amount < 1) {
      await sendMessageWarning(api, message, "Cú pháp: sell [index] [số lượng]");
      return;
    }

    const inventoryArray = Object.entries(playerData.inventory).filter(([_, count]) => count > 0);
    if (index < 1 || index > inventoryArray.length) {
      await sendMessageWarning(api, message, "Index không hợp lệ! Dùng 'product' để xem danh sách.");
      return;
    }

    const [fishName, currentCount] = inventoryArray[index - 1];
    if (amount > currentCount) {
      await sendMessageWarning(api, message, `Bạn chỉ có ${currentCount} ${fishName}!`);
      return;
    }

    const earned = FISH_DATA[fishName].price * amount;
    playerData.inventory[fishName] -= amount;
    playerData.money += earned;

    await sendMessageComplete(api, message,
      `💰 BÁN THÀNH CÔNG!\n\n` +
      `${FISH_DATA[fishName].emoji} ${fishName} x${amount}\n` +
      `💵 Thu về: +${earned.toLocaleString()} xu\n` +
      `💰 Số dư: ${playerData.money.toLocaleString()} xu`
    );
    return;
  }

  if (command === "shop") {
    const shopList = SHOP_ITEMS.map(item => {
      if (item.type === "turns") {
        return `${item.id}. ${item.emoji} ${item.name}\n   💰 Giá: ${item.price.toLocaleString()} xu`;
      }
      return `${item.id}. ${item.emoji} ${item.name}\n   💰 Giá: ${item.price.toLocaleString()} xu | +${item.bonus}% tỉ lệ cá hiếm`;
    }).join("\n\n");

    await sendMessageComplete(api, message,
      `🏪 CỬA HÀNG CÂU CÁ\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${shopList}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Dùng: buy [index] [số lượng]`,
      86400000
    );
    return;
  }

  if (command === "buy") {
    const index = parseInt(args[1]);
    const amount = parseInt(args[2]) || 1;

    if (!index || amount < 1) {
      await sendMessageWarning(api, message, "Cú pháp: buy [index] [số lượng]");
      return;
    }

    const item = SHOP_ITEMS.find(i => i.id === index);
    if (!item) {
      await sendMessageWarning(api, message, "Sản phẩm không tồn tại! Dùng 'shop' để xem danh sách.");
      return;
    }

    const totalCost = item.price * amount;
    if (playerData.money < totalCost) {
      await sendMessageWarning(api, message, `Không đủ tiền! Cần: ${totalCost.toLocaleString()} xu`);
      return;
    }

    playerData.money -= totalCost;

    if (item.type === "turns") {
      playerData.fishingTurns += 10 * amount;
      await sendMessageComplete(api, message,
        `✅ MUA THÀNH CÔNG!\n\n` +
        `${item.emoji} ${item.name} x${amount}\n` +
        `💵 Chi phí: -${totalCost.toLocaleString()} xu\n` +
        `💰 Số dư: ${playerData.money.toLocaleString()} xu\n` +
        `🎣 Lượt câu: ${playerData.fishingTurns}`
      );
    } else {
      playerData.rareBonus += item.bonus * amount;
      await sendMessageComplete(api, message,
        `✅ MUA THÀNH CÔNG!\n\n` +
        `${item.emoji} ${item.name} x${amount}\n` +
        `💵 Chi phí: -${totalCost.toLocaleString()} xu\n` +
        `💰 Số dư: ${playerData.money.toLocaleString()} xu\n` +
        `✨ Tỉ lệ cá hiếm: +${playerData.rareBonus}%`
      );
    }
    return;
  }

  if (command === "info") {
    const inventoryValue = Object.entries(playerData.inventory)
      .reduce((sum, [fish, count]) => sum + (FISH_DATA[fish].price * count), 0);

    await sendMessageComplete(api, message,
      `👤 THÔNG TIN NGƯỜI CHƠI\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Tiền: ${playerData.money.toLocaleString()} xu\n` +
      `🎣 Lượt câu: ${playerData.fishingTurns}\n` +
      `📍 Vị trí: ${playerData.location || "Chưa chọn"}\n` +
      `✨ Tỉ lệ cá hiếm: +${playerData.rareBonus}%\n` +
      `🐟 Tổng cá đã câu: ${playerData.totalFished}\n` +
      `🎒 Giá trị túi đồ: ${inventoryValue.toLocaleString()} xu\n` +
      `━━━━━━━━━━━━━━━━━━━━`,
      86400000
    );
    return;
  }
}
