import { 
  sendMessageQuery, 
  sendMessageFromSQL 
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { getBotId } from "../../index.js";
import axios from "axios";
import fs from "fs";
import path from "path";

function getFormatGender(gender) {
  if (gender === 0) return "Nam 👨";
  if (gender === 1) return "Nữ 👩";
  return "Không xác định 🤖";
}

function formatDate(sday, smonth, syear) {
  if (!sday || !smonth || !syear) return "Ẩn";
  return `${String(sday).padStart(2, '0')}/${String(smonth).padStart(2, '0')}/${syear}`;
}

async function getRawUserInfo(api, userId) {
  const rawResponse = await api.getUserInfo(userId);
  return rawResponse.changed_profiles?.[userId] || rawResponse.unchanged_profiles?.[userId] || {};
}

export async function handleMyAccountCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  let content = removeMention(message);
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const action = args[0]?.toLowerCase();
  const botId = getBotId();

  if (!action) {
    const helpMessage = `📝 Hướng dẫn sử dụng:

Cú pháp chung: ${prefix}${aliasCommand} [setting|info|avatar|friend] ...

- info: xem/cập nhật tên, ngày sinh, giới tính
- setting: xem/cập nhật cài đặt quyền riêng tư
- avatar: cập nhật avatar hoặc quản lý avatar cũ
- friend: quản lý kết bạn (thêm, xóa, chấp nhận, thu hồi, chặn, mở chặn)

Ví dụ:
• ${prefix}${aliasCommand} info name Nguyễn Văn A
• ${prefix}${aliasCommand} info date 01/01/2000
• ${prefix}${aliasCommand} info gender Nam
• ${prefix}${aliasCommand} setting
• ${prefix}${aliasCommand} avatar
• ${prefix}${aliasCommand} friend add @tag [lời nhắn]`;

    await sendMessageQuery(api, message, helpMessage);
    return;
  }

  if (action === "avatar") {
    const subOption = args[1] ? args[1].toLowerCase() : "";

    if (subOption === "list") {
      try {
        const response = await api.getAvatarList();
        const photos = response.photos || [];

        if (photos.length === 0) {
          await sendMessageFromSQL(api, message, { success: false, message: "Không tìm thấy avatar nào trong lịch sử." }, false, 30000);
          return;
        }

        let msg = "📷 Danh sách avatar đã được bot sử dụng:\n\n";
        photos.forEach((photo, index) => {
           msg += `#${index + 1}\n🆔 Photo ID: ${photo.photoId}\n🔗 Link: ${photo.url}\n\n`;
        });
        msg += `👉 Dùng lệnh: ${prefix}${aliasCommand} avatar [index] để set avatar theo số thứ tự.`;

        await sendMessageQuery(api, message, msg);
      } catch (error) {
        await sendMessageFromSQL(api, message, { success: false, message: `Lỗi lấy danh sách avatar: ${error.message}` }, false, 30000);
      }
      return;
    }

    const index = parseInt(subOption);
    if (!isNaN(index)) {
      try {
        const response = await api.getAvatarList();
        const photos = response.photos || [];

        if (index < 1 || index > photos.length) {
          await sendMessageFromSQL(api, message, { success: false, message: `Số thứ tự không hợp lệ. Vui lòng chọn từ 1 đến ${photos.length}.` }, false, 30000);
          return;
        }

        const targetPhoto = photos[index - 1];
        await api.reuseAvatar(String(targetPhoto.photoId));
        
        await sendMessageFromSQL(api, message, { success: true, message: `✅ Đã đổi lại avatar thành công!\n(ID: ${targetPhoto.photoId})` }, true, 60000);
      } catch (error) {
        await sendMessageFromSQL(api, message, { success: false, message: `Lỗi reuse avatar: ${error.message}` }, false, 60000);
      }
      return;
    }

    let imageUrl = null;

    if (message.data.quote && message.data.quote.attach) {
      try {
        const attach = typeof message.data.quote.attach === "string" 
          ? JSON.parse(message.data.quote.attach) 
          : message.data.quote.attach;
        imageUrl = attach.hdUrl || attach.href || attach.thumbUrl || attach.url;
      } catch (e) { }
    }

    if (!imageUrl && args[1] && args[1].startsWith("http")) {
      imageUrl = args[1];
    }

    if (!imageUrl) {
      await sendMessageQuery(api, message, "Vui lòng reply một bức ảnh, nhập link ảnh, hoặc dùng 'avatar list' để xem lịch sử.");
      return;
    }

    try {
      imageUrl = imageUrl.replace(/\/jxl\//g, "/jpg/").replace(/\.jxl/g, ".jpg");

      await sendMessageFromSQL(api, message, { success: true, message: "Đang tải ảnh và cập nhật avatar..." }, true, 30000);

      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const tempDir = path.resolve("./assets/temp");
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `avatar_${Date.now()}.jpg`);
      fs.writeFileSync(tempFilePath, response.data);

      await api.changeAccountAvatar(tempFilePath);
      
      await sendMessageFromSQL(api, message, { success: true, message: "✅ Đã đổi Avatar thành công!" }, true, 60000);

      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}

    } catch (error) {
      await sendMessageFromSQL(api, message, { success: false, message: `Lỗi đổi avatar: ${error.message}` }, false, 60000);
    }
    return;
  }

  if (action === "info") {
    const subAction = args[1]?.toLowerCase();
    
    if (!subAction) {
      try {
        const rawInfo = await getRawUserInfo(api, botId);
        
        const name = rawInfo.zaloName || rawInfo.displayName || "Vũ Xuân Kiên";
        const sday = parseInt(rawInfo.sdob);
        const smonth = parseInt(rawInfo.smonth);
        const syear = parseInt(rawInfo.syear);
        const genderCode = parseInt(rawInfo.gender);

        const infoMsg = `💁 Thông tin hiện tại:
- Tên: ${name}
- Ngày sinh: ${formatDate(sday, smonth, syear)}
- Giới tính: ${getFormatGender(genderCode)}

Cập nhật:
- ${prefix}${aliasCommand} info name [tên]
- ${prefix}${aliasCommand} info date [dd/mm/yyyy]
- ${prefix}${aliasCommand} info gender [Nam|Nữ]`;
        
        await sendMessageQuery(api, message, infoMsg);
      } catch (error) {
        await sendMessageFromSQL(api, message, { success: false, message: `Lỗi lấy thông tin: ${error.message}` }, false, 60000);
      }
      return;
    }

    const value = args.slice(2).join(" ");
    if (!value) {
      await sendMessageQuery(api, message, `Vui lòng nhập giá trị cần đổi.`);
      return;
    }

    try {
      const rawInfo = await getRawUserInfo(api, botId);
      
      const currentProfile = {
        name: rawInfo.zaloName || rawInfo.displayName || "Vũ Xuân Kiên",
        gender: rawInfo.gender !== undefined ? parseInt(rawInfo.gender) : 0,
        dob: {
          sday: parseInt(rawInfo.sdob) || 12,
          smonth: parseInt(rawInfo.smonth) || 12,
          syear: parseInt(rawInfo.syear) || 1997
        }
      };

      let successMsg = "";

      if (subAction === "name") {
        currentProfile.name = value;
        successMsg = `Đã cập nhật tên hiển thị thành: ${value}`;
      } else if (subAction === "date") {
        let sday, smonth, syear;
        if (value.includes("/")) {
            const parts = value.split("/");
            sday = parseInt(parts[0]);
            smonth = parseInt(parts[1]);
            syear = parseInt(parts[2]);
        } else if (value.includes("-")) {
            const parts = value.split("-");
            syear = parseInt(parts[0]);
            smonth = parseInt(parts[1]);
            sday = parseInt(parts[2]);
        }

        if (sday && smonth && syear) {
            currentProfile.dob = { sday, smonth, syear };
            successMsg = `Đã cập nhật ngày sinh thành: ${value}`;
        } else {
            await sendMessageFromSQL(api, message, { success: false, message: "Định dạng ngày sinh không hợp lệ (dd/mm/yyyy)" }, false, 60000);
            return;
        }
      } else if (subAction === "gender") {
        const lowerValue = value.toLowerCase();
        if (["nam", "male", "trai", "men"].includes(lowerValue)) currentProfile.gender = 0;
        else if (["nữ", "nu", "female", "gái", "women"].includes(lowerValue)) currentProfile.gender = 1;
        else {
             await sendMessageFromSQL(api, message, { success: false, message: "Giới tính không hợp lệ (Nam/Nữ)" }, false, 60000);
             return;
        }
        successMsg = `Đã cập nhật giới tính thành: ${value} (${getFormatGender(currentProfile.gender)})`;
      } else {
        await sendMessageQuery(api, message, "Hành động không hợp lệ (name/date/gender)");
        return;
      }

      const finalPayload = {
        profile: {
          name: currentProfile.name,
          gender: currentProfile.gender,
          dob: `${currentProfile.dob.syear}-${String(currentProfile.dob.smonth).padStart(2, '0')}-${String(currentProfile.dob.sday).padStart(2, '0')}`
        }
      };

      await api.updateProfile(finalPayload);
      await sendMessageFromSQL(api, message, { success: true, message: successMsg }, true, 60000);

    } catch (error) {
      await sendMessageFromSQL(api, message, { success: false, message: `Lỗi cập nhật thông tin: ${error.message}` }, false, 60000);
    }
    return;
  }

  if (action === "setting") {
    const settingIndex = parseInt(args[1]);
    const settingValue = parseInt(args[2]);

    if (isNaN(settingIndex) || isNaN(settingValue)) {
      const menuSettings = `Dùng: ${prefix}${aliasCommand} setting [thứ tự] [giá trị]
VD: ${prefix}${aliasCommand} setting 1 2

⚙️ Danh sách cài đặt:

1. Hiện Ngày Sinh
   0 -> Ẩn
   1 -> Hiển thị tất cả
『 2 -> Chỉ hiển thị ngày/tháng 』
____________________

2. Trạng Thái Truy Cập
   0 -> Tắt
『 1 -> Mở 』
____________________

3. Hiện Trạng Thái Đã Xem
   0 -> Tắt
『 1 -> Mở 』
____________________

4. Nhận Tin Nhắn
『 1 -> Tất Cả 』
   2 -> Chỉ Bạn Bè
____________________

5. Nhận Cuộc Gọi Từ Người Lạ
『 2 -> Bạn Bè 』
   3 -> Tất Cả
   4 -> Bạn Bè và Người từng liên hệ
____________________

6. Kết bạn qua Số Điện Thoại
   0 -> Tắt
『 1 -> Mở 』
____________________

7. Kết bạn qua QR
   0 -> Tắt
『 1 -> Mở 』
____________________

8. Kết bạn qua Nhóm Chung
   0 -> Tắt
『 1 -> Mở 』
____________________

9. Kết bạn qua Danh Thiếp
   0 -> Tắt
『 1 -> Mở 』
____________________

10. Hiển thị trên danh sách bạn bè đề xuất
   0 -> Tắt
『 1 -> Mở 』
____________________

11. Tin Nhắn Nhanh
   0 -> Tắt
『 1 -> Mở 』
____________________

12. Chia mục Ưu tiên và Khác
   0 -> Tắt
『 1 -> Mở 』`;
      
      await sendMessageQuery(api, message, menuSettings);
      return;
    }

    const settingsMap = {
      1: "view_birthday",
      2: "show_online_status",
      3: "display_seen_status",
      4: "receive_message",
      5: "accept_stranger_call",
      6: "add_friend_via_phone",
      7: "add_friend_via_qr",
      8: "add_friend_via_group",
      9: "add_friend_via_contact",
      10: "display_on_recommend_friend",
      11: "quickMessageStatus",
      12: "archivedChatStatus"
    };

    const apiType = settingsMap[settingIndex];

    if (!apiType) {
      await sendMessageFromSQL(api, message, { success: false, message: "Số thứ tự cài đặt không hợp lệ (1-12)." }, false, 60000);
      return;
    }

    try {
      await api.updateSettings(apiType, settingValue);
      await sendMessageFromSQL(api, message, { success: true, message: `Đã cập nhật cài đặt số ${settingIndex} thành giá trị ${settingValue}!` }, true, 60000);
    } catch (error) {
      await sendMessageFromSQL(api, message, { success: false, message: `Lỗi cập nhật cài đặt: ${error.message}` }, false, 60000);
    }
    return;
  }

  if (action === "friend") {
    const subAction = args[1]?.toLowerCase();
    const mentions = message.data.mentions;

    const validActions = ["add", "remove", "accept", "reject", "undo", "block", "unblock"];
    if (!validActions.includes(subAction)) {
      const friendMenu = `👥 Friend:
- Thêm bạn: ${prefix}${aliasCommand} friend add @tag [lời nhắn]
- Xóa bạn: ${prefix}${aliasCommand} friend remove @tag
- Chấp nhận kết bạn: ${prefix}${aliasCommand} friend accept @tag
- Từ chối kết bạn: ${prefix}${aliasCommand} friend reject @tag
- Thu hồi kết bạn: ${prefix}${aliasCommand} friend undo @tag
- Chặn tin nhắn riêng: ${prefix}${aliasCommand} friend block @tag
- Mở chặn: ${prefix}${aliasCommand} friend unblock @tag`;
      await sendMessageQuery(api, message, friendMenu);
      return;
    }

    if (!mentions || mentions.length === 0) {
      await sendMessageQuery(api, message, "Vui lòng tag (@mention) người dùng cần thực hiện thao tác.");
      return;
    }

    let customMsg = "";
    if (subAction === "add") {
      const fullContent = message.data.content;
      let lastMentionEnd = 0;
      for (const m of mentions) {
        if (m.pos + m.len > lastMentionEnd) lastMentionEnd = m.pos + m.len;
      }
      customMsg = fullContent.substring(lastMentionEnd).trim();
      if (!customMsg) customMsg = "Chào bạn, tớ là bot của Vũ Xuân Kiên, hân hạnh được kết bạn nhé!";
    }

    let resultDetails = [];
    let hasError = false;

    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

      try {
        if (subAction === "add") {
          await api.sendFriendRequest(targetId, customMsg);
        } else if (subAction === "remove") {
          await api.removeFriend(targetId);
        } else if (subAction === "accept") {
          await api.acceptFriendRequest(targetId);
        } else if (subAction === "reject") {
          await api.rejectFriendRequest(targetId);
        } else if (subAction === "undo") {
          await api.undoFriendRequest(targetId);
        } else if (subAction === "block") {
          await api.blockUser(targetId);
        } else if (subAction === "unblock") {
          await api.unblockUser(targetId);
        }
        resultDetails.push(`• ${targetName}: Thành công`);
      } catch (error) {
        console.error(`Lỗi thao tác bạn bè với ${targetName}:`, error);
        hasError = true;
        resultDetails.push(`• ${targetName}: Thất bại`);
      }
    }

    let titleAction = "";
    if (subAction === "add") titleAction = "Gửi lời mời kết bạn đến";
    else if (subAction === "remove") titleAction = "Xóa bạn bè";
    else if (subAction === "accept") titleAction = "Chấp nhận lời mời từ";
    else if (subAction === "reject") titleAction = "Từ chối lời mời từ";
    else if (subAction === "undo") titleAction = "Thu hồi lời mời gửi đến";
    else if (subAction === "block") titleAction = "Chặn tin nhắn từ";
    else if (subAction === "unblock") titleAction = "Mở chặn tin nhắn cho";

    const finalMessage = `${titleAction}:\n\n${resultDetails.join("\n")}`;
    
    await sendMessageFromSQL(api, message, { success: !hasError, message: finalMessage }, true, 60000);
    return;
  }
}
