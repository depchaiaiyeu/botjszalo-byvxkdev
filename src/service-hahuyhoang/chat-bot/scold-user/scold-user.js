import { getUserInfoData } from "../../info-service/user-info.js";
import { isAdmin } from "../../../index.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const scoldUsers = new Map();
let isScoldingActive = false;

export async function scoldUser(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const content = removeMention(message);

  if (content.toLowerCase() === `${prefix}${aliasCommand} tha`) {
    if (isAdmin(senderId, threadId) && isScoldingActive) {
      isScoldingActive = false;
      api.sendMessage({ msg: "Dạ sếp em sẽ tha cho nó", quote: message }, threadId, message.type);
      return;
    }
  }

  if (!isScoldingActive) isScoldingActive = true;

  if (!message.data.mentions || message.data.mentions.length === 0) {
    await api.sendMessage({ msg: ":D Sếp muốn em chửi ai 🚀", quote: message }, threadId, message.type);
    return;
  }

  const userId = message.data.mentions[0].uid;
  const userTarget = await getUserInfoData(api, userId);

  if (isAdmin(userId, threadId)) {
    await api.sendMessage({ msg: "Không thể ra lệnh chửi quản trị bot 🚫", quote: message }, threadId, message.type);
    return;
  }

  if (scoldUsers.has(userId)) {
    await api.sendMessage({ msg: "Người này đang bị chửi", quote: message }, threadId, message.type);
    return;
  }

  const scoldMessages = [
    "Mày ra đây tao bảo hiện hồn nhanh con chó",
    "Hiện hồn nhanh không tao đốt nhà mày giờ",
    "Địt mẹ mày bố nói tử tế mà Không dậy à",
    "Nhanh ra chửi nhau với tao",
    "Tao ném trứng thối đổ dầu đổ xăng vào nhà mày giờ",
    "Hoá ra cũng chỉ là con chó mang hình dáng người",
    "Làm người thì khó làm chó thì dễ",
    "Đừng tỏ vẻ máu liều nhiều hơn máu não",
    "Đụ con đĩ mẹ mày",
    "Con chó mày đứng lên đi",
    "Địt mẹ bố gọi Không nghe à",
    "Hiện hồn đi thằng mặt lồn",
    "Đĩ mẹ mày ra đây bô xem nào",
    "Tao ném trứng thối đổ dầu đổ xăng vào nhà mày giờ",
    "Bố mày bắn rap chết cụ mày giờ",
    "Vậy thì xin mời nghe tao rap địt chết cả lò mày nhà con",
    "Đầu tiên tao xin phép địt từ trên xuống dưới con",
    "Tao địt từ lỗ lồn đến lỗ nhị con lồn",
    "Lồn thì to như lồn trâu thủ dâm ống cống ấy nhé con",
    "Tao địt chắc 2 thằng như tao chưa đủ lấp cái lỗ lồn nhà mày đâu",
    "Thằng óc cức",
    "Mẹ m đẻ m ra đau lồn chứ được con cặc gì",
    "Con mẹ mày đẻ m ra đau lồn chứ được con cặc gì",
    "Tao địt mẹ mày đến mấy lần rồi con",
    "Tinh trùng khuyết tật",
    "Hồi đó ba mày Không dùng bao nên lòi ra thằng mặt cặc như mày đó",
    "Con mẹ mày",
    "Thằng lồn óc chó",
    "Thứ súc vật",
    "Tao là bố của mẹ mày",
    "Chửi chết con mẹ mày luôn",
    "Có giỏi thì bơi ra chửi tay đôi đi thằng lồn",
    "Mày nghĩ gì mà động vào sếp tao",
    "Loại rác rưỡi như mày thì Không có tuổi",
    "Mày có phải con chó không",
    "Người Không thể ngu vậy được",
    "Cút con mẹ mày đi",
    "Thứ lồn đỉ mẹ mày",
    "Mày động nhầm người rồi con chó ạ",
    "Bố mày chấp thứ súc sinh đội lớp thú",
    "Chửi chết mẹ mày luôn",
    "Lần sau gặp sếp tao thì né xa ra địt mẹ mày",
    "Sủa lẹ coi tao đợi",
    "Cái thứ rác rưởi",
    "Mày đéo có cửa đâu con ạ",
    "Trốn kĩ thế chui ra gâu gâu coi",
    "Ngon thì bật lại tao",
    "Tao ỉa lên mặt mày giờ",
    "Mày là con chó của sếp tao",
    "Câm à sủa đi chứ",
    "Mày câm à Sao không sủa nữa",
    "Óc chó thì câm mồm lại đi",
    "Cái loại mày tao đéo thèm chấp",
    "Ngu còn tỏ ra nguy hiểm",
    "Tao vả cho mày rụng mẹ hết răng giờ",
    "Bố mày cân cả lò nhà mày nhé",
    "Mày tuổi lồn gì nói chuyện với tao",
    "Đéo bằng con chó tao nuôi",
    "Ra đây 1v1 sủa cc gì",
    "Sủa nhanh tao còn về",
    "Cái loại rác rưởi như mày",
    "Đánh vần chữ NGU coi con chó",
    "Hiện hồn đi tao réo mỏi mồm quá",
    "Địt mẹ mày câm rồi à",
    "Tao mệt rồi đấy sủa đi",
    "Thằng mặt lồn này trốn kĩ thế",
    "Đéo ra nữa là tao đốt nhà thật đấy",
    "1 2 3 ra đây tao vả vỡ mồm",
    "Chó sủa gâu gâu còn mày sủa sao",
    "Mày là thứ đéo có não sống phí oxy",
    "Cái nết chó má nhà mày đéo sửa được đâu con súc vật",
    "Tao đéo ngờ tao phải chửi cái loại ngu như mày",
    "Mày nên về bú cặc cha mày thì hơn là sủa",
    "Đĩ mẹ mày thứ vô dụng nằm bẹp dí đi",
    "Mày còn rẻ rách hơn cái giẻ rách chùi đít",
    "Lồn má mày thối hơn cống rãnh",
    "Địt mẹ mày mày có biết mày ngu cỡ nào không",
    "Thằng đầu đất óc heo này",
    "Mày câm họng lại đồ tạp chủng",
    "Tao coi mày như cứt chó dưới đế giày tao thôi",
    "Cả họ nhà mày đéo có đứa nào thông minh bằng con chó",
    "Đụ má tao nhổ nước bọt lên mặt mày giờ",
    "Thằng hèn mày trốn đâu rồi ra đây",
    "Mặt mày như cái bô tao đéo muốn nhìn",
    "Tao thề tao phải địt chết cái tổ tông nhà mày",
    "Cút con cặc mày đi đừng để tao thấy",
    "Mày đéo xứng làm người đâu con",
    "Mày là cái thứ phế thải của xã hội",
    "Địt con lồn đĩ mẹ mày",
    "Thằng ngu si tứ chi phát triển",
    "Mày là con đẻ của loài chó điên",
    "Mồm mày thối như cái lồn cá",
    "Mày nên tự tử đi sống chi cho chật đất",
    "Mày đéo phải người mày là một cục cứt",
    "Tao sẽ địt tung lồn cả nhà mày",
    "Mày là sản phẩm lỗi của tạo hoá",
    "Đụ cái lồn chó nhà mày",
    "Tao vả mày lật mặt giờ thằng lồn",
    "Mày cút đi đồ súc sinh thấp hèn",
    "Thằng mặt cặc ngu dốt",
    "Mày đéo bằng con tinh trùng của bố mày",
    "Mày có biết mày bị khuyết tật bẩm sinh không",
    "Cút khỏi đây nhanh con đĩ",
    "Mày đéo có tư cách sủa với tao",
    "Cái lồn nhà mày nở hoa chưa",
    "Tao chán phải chửi cái loại thiểu năng như mày rồi",
    "Đụ mẹ mày thứ đéo ra gì",
    "Mày là cái thá gì mà dám bật",
    "Chó đẻ ra mày đấy đồ ngu",
    "Mày nên học cách làm người đi đồ chó má",
    "Thằng bất hiếu đéo biết đéo gì",
    "Mày cút ngay cho tao đỡ ngứa mắt",
    "Tao đái vào mặt mày giờ",
    "Cái thứ vô giáo dục",
    "Mày là đồ con lợn lười biếng",
    "Mặt mày nhìn ghê tởm vl",
    "Cái loại chó má mày chỉ biết sủa",
    "Mày đéo khác gì một đống phân",
    "Mày có biết xấu hổ không đồ vô liêm sỉ",
    "Mày im ngay đồ ngu dốt",
    "Thằng lồn này sao lì vậy",
    "Địt mẹ mày cút khỏi đây",
    "Mày cút đi tao khinh",
    "Mày là đồ rẻ tiền",
    "Thằng hèn nhát chỉ biết trốn",
    "Cái loại mày tao đéo cần",
    "Tao coi thường mày lắm đấy",
    "Mày là cái thứ bị khinh bỉ",
    "Địt mẹ mày cả gia đình mày lũ súc sinh",
    "Tao nguyền rủa mày chết không toàn thây",
    "Mày là thứ tội lỗi của cha mẹ mày",
    "Tao đéo thể chấp nhận được cái sự ngu xuẩn của mày",
    "Mày nên bị thiêu sống đồ chó",
    "Mày là nỗi ô nhục của dòng họ mày",
    "Tao đập chết mày như đập ruồi",
    "Mày là đồ cặn bã xã hội",
    "Đụ má mày còn sống làm gì",
    "Mày cút xuống địa ngục đi",
    "Tao sẽ móc mắt mày ra",
    "Mày là thứ rác rưởi không ai cần",
    "Tao sẽ chặt đầu mày treo lên cây",
    "Mày là đồ phế vật từ lúc sinh ra",
    "Tao sẽ địt vào mồ mả tổ tiên mày",
    "Mày câm họng lại đồ đần",
    "Tao sẽ nhổ răng mày từng cái một",
    "Mày là thứ đéo đáng được sống",
    "Tao sẽ cắt lưỡi mày",
    "Mày là quỷ dữ đội lốt người",
    "Tao thề tao sẽ giết mày",
    "Mày là thứ ô uế",
    "Tao sẽ phanh thây mày",
    "Mày là thứ đéo có linh hồn",
    "Tao sẽ bóp nát tim mày",
    "Mày là kẻ bị nguyền rủa",
    "Tao sẽ xé xác mày",
    "Mày là thứ tàn ác",
    "Tao sẽ đánh gãy xương mày",
    "Mày là thứ vô nhân tính",
    "Tao sẽ moi gan mày",
    "Mày là thứ kinh tởm",
    "Tao sẽ chôn sống mày",
    "Mày là đồ cặn bã",
    "Tao sẽ thiến mày",
    "Mày là thứ đĩ điếm",
    "Tao sẽ xẻo thịt mày",
    "Mày là đồ chó má"
  ];

  scoldUsers.set(userId, true);
  isScoldingActive = true;

  const caption = `Tao chuẩn bị mắng yêu `;
  await api.sendMessage({
    msg: caption + `${userTarget.name}!!`,
    mentions: [{ pos: caption.length, uid: userId, len: userTarget.name.length }],
  }, threadId, message.type);

  let count = 0;

  const sendScoldMessage = async () => {
    if (!isScoldingActive) {
      const genderText = userTarget.genderId === 0 ? "Thằng Oắt Con" : userTarget.genderId === 1 ? "Oắc Con" : "Thằng Oắt Con";
      await api.sendMessage({
        msg: `${genderText} ${userTarget.name} nể sếp của tao tha mày lần này cảm ơn sếp tao đi`,
        mentions: [{ pos: genderText.length + 1, uid: userTarget.uid, len: userTarget.name.length }],
      }, threadId, message.type);
      scoldUsers.delete(userId);
      return;
    }

    if (count >= scoldMessages.length) count = 0;
    const randomMessage = scoldMessages[count];
    await api.sendMessage({
      msg: `${userTarget.name} ${randomMessage}`,
      mentions: [{ pos: 0, uid: userTarget.uid, len: userTarget.name.length }],
    }, threadId, message.type);
    count++;

    const randomDelay = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
    setTimeout(sendScoldMessage, randomDelay);
  };

  const initialDelay = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
  setTimeout(sendScoldMessage, initialDelay);
}
