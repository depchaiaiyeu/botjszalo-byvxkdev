import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

export async function handleGoldPriceCommand(api, message) {
  try {
    const response = await fetch('https://sjc.com.vn/GoldPrice/Services/PriceService.ashx');
    const data = await response.json();

    if (!data.success) {
      await sendMessageFailed(api, message, "Không thể lấy dữ liệu giá vàng!");
      return;
    }

    const formatCurrency = (value) => {
      return new Intl.NumberFormat('vi-VN').format(value) + ' VND';
    };

    let resultMessage = `💰 GIÁ VÀNG SJC - Cập nhật: ${data.latestDate}\n\n`;
    
    const branches = {};
    data.data.forEach(item => {
      if (!branches[item.BranchName]) {
        branches[item.BranchName] = [];
      }
      branches[item.BranchName].push(item);
    });

    for (const [branchName, items] of Object.entries(branches)) {
      resultMessage += `🏢 ${branchName}:\n`;
      
      items.forEach(item => {
        resultMessage += `🔸 ${item.TypeName}\n`;
        resultMessage += `   💵 Mua vào: ${formatCurrency(item.BuyValue)}\n`;
        resultMessage += `   💰 Bán ra: ${formatCurrency(item.SellValue)}\n`;
        
        if (item.BuyDifferValue !== 0) {
          const diffSymbol = item.BuyDifferValue > 0 ? '📈' : '📉';
          resultMessage += `   ${diffSymbol} Chênh lệch mua: ${item.BuyDiffer || '0'} (${formatCurrency(Math.abs(item.BuyDifferValue))})\n`;
        }
        
        if (item.SellDifferValue !== 0) {
          const diffSymbol = item.SellDifferValue > 0 ? '📈' : '📉';
          resultMessage += `   ${diffSymbol} Chênh lệch bán: ${item.SellDiffer || '0'} (${formatCurrency(Math.abs(item.SellDifferValue))})\n`;
        }
        
        resultMessage += '\n';
      });
      
      resultMessage += '─'.repeat(50) + '\n\n';
    }

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error in handleGoldPriceCommand:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi lấy giá vàng: ${error.message || error}`);
  }
}
