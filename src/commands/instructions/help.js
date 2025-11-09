import { MultiMsgStyle, MessageStyle } from "zlbotdqt";
import { getCommandConfig, isAdmin, reloadCommandConfig } from "../../index.js";
import * as cv from "../../utils/canvas/index.js";
import {
  checkBeforeJoinGame,
  checkPlayerBanned,
} from "../../service-hahuyhoang/game-service/index.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import {
  COLOR_GREEN,
  SIZE_18,
  IS_BOLD,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";


const COMMANDS_PER_PAGE = 10;

export async function helpCommand(api, message, groupAdmins) {
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const isAdminBox = isAdmin(senderId, threadId, groupAdmins);

  let helpCommand = {
    title: "🌟 DANH SÁCH LỆNH 🌟",
    allMembers: {
      gpt: {
        command: `${prefix}gpt [câu hỏi]`,
        description: "Hỏi AI",
        icon: "🤖",
      },
      chat: {
        command: `${prefix}download [link]`,
        description: "Tải xuống media từ các platform",
        icon: "▶",
      },
      info: {
        command: `${prefix}info`,
        description: "Xem thông tin tài khoản Zalo",
        icon: "📰",
      },
      gameinfo: {
        command: `${prefix}game`,
        description: "Xem danh sách lệnh game",
        icon: "🎮",
      },
      thoitiet: {
        command: `${prefix}thoitiet [thành phố]`,
        description: "Xem thời tiết",
        icon: "🌤️",
      },
      dich: {
        command: `${prefix}dich [nội dung]&&(language)`,
        description: "Dịch văn bản",
        icon: "🌐",
      },
      group: {
        command: `${prefix}group`,
        description: "Xem thông tin nhóm",
        icon: "📋",
      },
      topchat: {
        command: `${prefix}topchat`,
        description: "Xem BXH tương tác nhóm",
        icon: "🏆",
      },
      girl: {
        command: `${prefix}girl`,
        description: "Gửi ảnh girl",
        icon: "👧",
      },
      image: {
        command: `${prefix}image [tên ảnh]`,
        description: "Tìm ảnh ngẫu nhiên",
        icon: "🖼️",
      },
      music: {
        command: `${prefix}music [tên bài hát]`,
        description: "Tìm bài hát",
        icon: "🎧",
      },
      tiktok: {
        command: `${prefix}tiktok [nội dung]`,
        description: "Tìm video tiktok",
        icon: "🎥",
      },
      command: {
        command: `${prefix}command`,
        description: "Xem danh sách lệnh",
        icon: "🔖",
      },
    },
    titleAdmin: "🏆 LỆNH CHO ADMIN 🏆",
    admin: {
      manager: {
        command: `${prefix}manager`,
        description: "Xem danh sách lệnh quản lý",
        icon: "🔧",
      },
      commandAdmin: {
        command: `${prefix}command admin`,
        description: "Xem danh sách lệnh Admin",
        icon: "👮",
      },
    },
  };

  try {
    const imagePath = await cv.createInstructionsImage(
      helpCommand,
      isAdminBox,
      699
    );
    await api.sendMessage(
      {
        msg: `🌟 ${senderName} - Danh sách lệnh của tôi 🌟`,
        attachments: imagePath ? [imagePath] : [],
        mentions: [{ pos: 3, uid: senderId, len: senderName.length }],
        ttl:500000,
      },
      threadId,
      message.type
    );
    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn trợ giúp:", error);
  }
}

export async function adminCommand(api, message) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  
  let commandAdmin = {
    title: "🌟 DANH SÁCH LỆNH 🌟",
    allMembers: {
      mute: {
        command: `${prefix}mute/unmute [@người dùng]`,
        description: "Mute/Unmute thành viên",
        icon: "🔇",
      },
      antilink: {
        command: `${prefix}antilink on/off`,
        description: "Chặn gửi liên kết",
        icon: "🔗",
      },
      whitelist: {
        command: `${prefix}whitelist add/remove [@người dùng]`,
        description: "Thêm người dùng vào whitelist",
        icon: "👤",
      }, 
      blacklist: {
        command: `${prefix}blacklist add/remove [@người dùng]`,
        description: "Thêm người dùng vào blacklist",
        icon: "👤",
      },  
      antisetup: {
        command: `${prefix}antiforward on/off`,
        description: "Chặn tin nhắn chuyển tiếp",
        icon: "⛔",
      },          
      antispam: {
        command: `${prefix}antispam on/off`,
        description: "Chống spam tin nhắn",
        icon: "⛔",
      },
      antinude: {
        command: `${prefix}antinude on/off`,
        description: "Chống gửi ảnh nhạy cảm",
        icon: "🅰",
      },
      antiundo: {
        command: `${prefix}antiundo on/off`,
        description: "Chống thu hồi tin nhắn",
        icon: "🅰",
      },
      kick: {
        command: `${prefix}kick [@người dùng]`,
        description: "Kick thành viên",
        icon: "👢",
      },
      block: {
        command: `${prefix}block [@người dùng]`,
        description: "Chặn thành viên",
        icon: "👢",
      },
      welcome: {
        command: `${prefix}welcome on/off`,
        description: "Chào mừng thành viên mới",
        icon: "👋",
      },
      bye: {
        command: `${prefix}bye on/off`,
        description: "Tạm biệt thành viên rời nhóm",
        icon: "👋",
      },
      approve: {
        command: `${prefix}approve on/off`,
        description: "Tự động phê duyệt thành viên vào nhóm",
        icon: "🔖",
      },
      keygold: {
        command: `${prefix}keygold on/off`,
        description: "Nhường cộng đổng cho người đề cập",
        icon: "🔖",
      },
      keysilver: {
        command: `${prefix}keysilver on/off`,
        description: "Phong key bạc cho thành viên đề cập",
        icon: "🔖",
      },
      unkey: {
        command: `${prefix}unkey on/off`,
        description: "Gỡ quyền phó cộng đồng",
        icon: "🔖",
      },
    },
  };

  try {
    const imagePath = await cv.createInstructionsImage(
      commandAdmin,
      false,
      960
    );
    await api.sendMessage(
      {
        msg: `🌟 ${senderName} - Danh sách lệnh quản trị 🌟`,
        attachments: imagePath ? [imagePath] : [],
        mentions: [{ pos: 3, uid: senderId, len: senderName.length }],
        ttl: 500000,
      },
      threadId,
      message.type
    );
    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh admin:", error);
  }
}

export async function gameInfoCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const isAdminBox = isAdmin(senderId, threadId);
  const prefix = getGlobalPrefix();

  const gameCommand = {
    title: "🌟 DANH SÁCH LỆNH🌟",
    allMembers: {
      login: {
        command: `${prefix}login [tài khoản] [mật khẩu]`,
        description: "Ib cho bot để đăng nhập tài khoản game",
        icon: "🔖",
      },
      dangky: {
        command: `${prefix}dangky [tài khoản] [mật khẩu]`,
        description: "Ib cho bot để đăng ký tài khoản game",
        icon: "🔖",
      },
      logout: {
        command: `${prefix}logout`,
        description: "Đăng xuất tài khoản game",
        icon: "🔖",
      },
      daily: {
        command: `${prefix}daily`,
        description: "Nhận phần thưởng hàng ngày",
        icon: "🔖",
      },
      mycard: {
        command: `${prefix}mycard`,
        description: "Xem thông tin cá nhân",
        icon: "🔖",
      },
      rank: {
        command: `${prefix}rank`,
        description: "Xem top 10 người chơi giàu nhất",
        icon: "🏆",
      },
      nongtrai: {
        command: `${prefix}nongtrai`,
        description: "Chơi trò chơi Nông Trại",
        icon: "🎲",
      },
      taixiu: {
        command: `${prefix}taixiu`,
        description: "Chơi trò chơi Tài Xỉu",
        icon: "🎲",
      },
      chanle: {
        command: `${prefix}chanle`,
        description: "Chơi trò chơi Chẵn Lẻ",
        icon: "🎲",
      },
      baucua: {
        command: `${prefix}baucua`,
        description: "Chơi trò chơi Bầu Cua",
        icon: "🎲",
      },
      keobuabao: {
        command: `${prefix}keobuabao`,
        description: "Chơi trò chơi Kéo Búa Bao",
        icon: "🎲",
      },
      bank: {
        command: `${prefix}bank [số tiền] [@người nhận]`,
        description: "Chuyển tiền cho người khác",
        icon: "💰",
      },
    },
    titleAdmin: "🏆 LỆNH CHO ADMIN 🏆",
    admin: {
      buff: {
        command: `${prefix}buff [số tiền] [@người nhận]`,
        description: "Tặng tiền cho người chơi",
        icon: "💰",
      },
      ban: {
        command: `${prefix}ban [@người chơi]`,
        description: "Khóa tài khoản người chơi",
        icon: "🔒",
      },
      unban: {
        command: `${prefix}unban [@người chơi]`,
        description: "Mở khóa tài khoản người chơi",
        icon: "🔓",
      },
    },
  };
  try {
    const imagePath = await cv.createInstructionsImage(
      gameCommand,
      isAdminBox,
      760
    );
    await api.sendMessage(
      {
        msg: `🌟 ${senderName} - Danh sách lệnh trò chơi 🌟`,
        attachments: imagePath ? [imagePath] : [],
        mentions: [{ pos: 3, uid: senderId, len: senderName.length }],
        ttl:500000,
      },
      threadId,
      message.type
    );
    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh trò chơi:", error);
  }
}

// Thêm hàm helper để chia nhỏ tin nhắn
function splitMessage(message, maxLength = 2000) {
  if (message.length <= maxLength) {
    return [message];
  }

  const parts = [];
  let currentPart = "";
  const lines = message.split("\n");

  for (const line of lines) {
    if ((currentPart + line + "\n").length > maxLength) {
      if (currentPart) {
        parts.push(currentPart.trim());
        currentPart = "";
      }
      // Nếu một dòng quá dài, chia nhỏ nó
      if (line.length > maxLength) {
        const chunks = line.match(new RegExp(`.{1,${maxLength}}`, "g")) || [];
        parts.push(...chunks);
        continue;
      }
    }
    currentPart += line + "\n";
  }

  if (currentPart) {
    parts.push(currentPart.trim());
  }

  return parts;
}

export async function listCommands(api, message, args) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const commandConfig = getCommandConfig();

  const command = args[0]?.toLowerCase();
  const subCommand = args[1]?.toLowerCase();

  const commandHandlers = {
    async find() {
      const searchTerm = args.slice(1).join(" ").toLowerCase();
      if (!searchTerm) {
        return {
          msg: "⚠️ Vui lòng nhập từ khóa để tìm kiếm?\nVí dụ: ${prefix}cmd find thời tiết",
          ttl: 30000,
        };
      }

      const searchResults = commandConfig.commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(searchTerm) ||
          cmd.description.toLowerCase().includes(searchTerm) ||
          (cmd.alias &&
            cmd.alias.some((alias) => alias.toLowerCase().includes(searchTerm)))
      );

      if (searchResults.length === 0) {
        return {
          msg: `❌ Không tìm thấy lệnh nào liên quan đến từ khóa "${searchTerm}"`,
          ttl: 30000,
        };
      }

      let responseMsg = `🔍 Kết quả tìm kiếm cho "${searchTerm}":\n\n`;
      let positions = [];

      searchResults.forEach((cmd, index) => {
        const startPos = responseMsg.length;
        responseMsg += `${index + 1}. ⭐ Lệnh: ${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length + 11 });

        responseMsg += `   📝 Mô tả: ${cmd.description}\n`;
        responseMsg += `   💡 Cú pháp: ${cmd.syntax.replace("{p}", prefix)}\n`;
        if (cmd.alias?.length) {
          responseMsg += `   🔖 Tên gọi khác: ${cmd.alias.join(", ")}\n`;
        }
        responseMsg += `   🔒 Quyền hạn: ${getPermissionName(
          cmd.permission
        )}\n`;
        responseMsg += `   ⏱️ Countdown: ${cmd.countdown} giây\n\n`;
      });

      let style = null;
      if (searchResults.length < 5) {
        style = MultiMsgStyle(
          positions.map(({ pos, len }) =>
            MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD)
          )
        );
      }
      return {
        msg: responseMsg,
        style: style,
        ttl: 60000,
      };
    },

    // Tải lại cấu hình lệnh
    async load() {
      const commandConfigNew = reloadCommandConfig();
      const allCommands = commandConfigNew.commands.filter(
        (cmd) => cmd.permission === "all"
      );
      const adminCommands = commandConfigNew.commands.filter((cmd) =>
        ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission)
      );

      const statsMessage = [
        "📊 Reload Thành Công Lệnh Bot:\n",
        `👥 Lệnh cho thành viên: ${allCommands.length} lệnh`,
        `👑 Lệnh cho admin: ${adminCommands.length} lệnh`,
        `📝 Tổng số lệnh: ${commandConfigNew.commands.length} lệnh`,
      ].join("\n");

      return { msg: statsMessage, ttl: 300000 };
    },

    async map() {
      const isAdminMap = subCommand === "admin";
      const filteredCommands = commandConfig.commands
        .filter((cmd) =>
          isAdminMap
            ? ["adminBox", "adminBot", "adminLevelHigh"].includes(
              cmd.permission
            )
            : cmd.permission === "all"
        )
        .map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          permission: cmd.permission,
        }));

      const title = isAdminMap ? "Admin" : "Thành Viên";
      let responseMsg = `🔍 Liệt Kê Toàn Bộ Lệnh ${title}:\n\n`;
      let positions = [];

      filteredCommands.forEach((cmd, index) => {
        const startPos = responseMsg.length;
        responseMsg += `${index + 1}. ${cmd.name}: ${cmd.description}\n`;
        positions.push({ pos: startPos + 3, len: cmd.name.length });
      });

      const style = MultiMsgStyle(
        positions.map(({ pos, len }) =>
          MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD)
        )
      );
      return {
        msg: responseMsg,
        // style: style,
        ttl: 300000,
      };
    },

    async default() {
      const isAdminRequest = command === "admin";
      const pageNumber = parseInt(args[isAdminRequest ? 1 : 0]) || 1;

      const filteredCommands = commandConfig.commands.filter((cmd) =>
        isAdminRequest
          ? ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission)
          : cmd.permission === "all"
      );

      const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
      const startIndex = (pageNumber - 1) * COMMANDS_PER_PAGE;
      const endIndex = startIndex + COMMANDS_PER_PAGE;
      const commandsToShow = filteredCommands.slice(startIndex, endIndex);

      let responseMsg = isAdminRequest
        ? "👑 Danh sách lệnh Admin:\n\n"
        : "📜 Danh sách lệnh:\n\n";
      let positions = [];

      commandsToShow.forEach((cmd, index) => {
        const startPos = responseMsg.length + 11;
        responseMsg += `${index + 1 + startIndex}. ⭐ Lệnh: ${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length + 1 });

        responseMsg += `   📝 Mô Tả: ${cmd.description}\n`;
        if (cmd.permission !== "all") {
          responseMsg += `   🔒 Quyền Hạn: ${getPermissionName(
            cmd.permission
          )}\n`;
        }
        responseMsg += `   ⏱️ Countdown: ${cmd.countdown} Giây\n\n`;
      });

      responseMsg += [
        `📄 Trang ${pageNumber}/${totalPages}`,
        `💡 Dùng ${prefix}cmd ${isAdminRequest ? "admin " : ""
        }[số trang] để xem các trang khác.`,
        `ℹ️ Dùng ${prefix}cmd map ${isAdminRequest ? "admin " : ""}` +
        `để xem toàn bộ lệnh dành cho ${isAdminRequest ? "admin" : "thành viên"}.`,
      ].join("\n");

      const style = MultiMsgStyle(
        positions.map(({ pos, len }) =>
          MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD)
        )
      );

      return {
        msg: responseMsg,
        style: style,
        ttl: 180000,
      };
    },
  };

  try {
    const handler = commandHandlers[command] || commandHandlers.default;
    const response = await handler();

    // Chia nhỏ tin nhắn nếu cần
    const messageParts = splitMessage(response.msg);
    
    for (let i = 0; i < messageParts.length; i++) {
      const part = messageParts[i];
      // Chỉ áp dụng style cho phần đầu tiên
      const messageStyle = i === 0 ? response.style : null;
      
      await api.sendMessage(
        {
          msg: part,
          style: messageStyle,
          quote: i === 0 ? message : null, // Chỉ trích dẫn tin nhắn gốc ở phần đầu
          ttl: response.ttl,
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh:", error);
    await api.sendMessage(
      {
        msg: error.message,
        quote: message,
      },
      threadId,
      message.type
    );
  }
}

function getPermissionName(permission) {
  switch (permission) {
    case "all":
      return "Toàn Bộ Thành Viên";
    case "adminBox":
      return "Quản Trị Viên Nhóm";
    case "adminBot":
      return "Quản Trị Viên Bot";
    case "adminLevelHigh":
      return "Quản Trị Viên Cấp Cao";
    default:
      return "Không xác định";
  }
}
