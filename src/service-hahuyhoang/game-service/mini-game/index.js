export async function startGame(api, message, groupSettings, gameType, args, isAdminBox) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const activeGame = groupSettings[threadId].activeGame;
  
  if (activeGame === false) {
    if (isAdmin(senderId, threadId)) {
      const text =
        `Trò chơi hiện tại Không được bật trong nhóm này.\n\n` +
        `Quản trị viên hãy dùng lệnh ${prefix}gameactive để bật tương tác game cho nhóm!`;
      const result = {
        success: false,
        message: text,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
    }
    return;
  }
  
  const subCommand = args && args.length > 0 ? args[0].toLowerCase() : '';
  
  if (subCommand === "leave") {
    switch (gameType) {
      case "guessNumber":
        await handleGuessNumberCommand(api, message);
        return;
      case "wordChain":
        await handleWordChainCommand(api, message, args);
        return;
      case "vuaTiengViet":
        await handleVuaTiengVietCommand(api, message, threadId, args);
        return;
      case "cauca":
        await handleFishingCommand(api, message);
        return;
    }
  }
  
  if (gameType !== "cauca" && await checkHasActiveGame(api, message, threadId)) return;
  
  switch (gameType) {
    case "guessNumber":
      await handleGuessNumberCommand(api, message);
      break;
    case "wordChain":
      await handleWordChainCommand(api, message, args);
      break;
    case "vuaTiengViet":
      await handleVuaTiengVietCommand(api, message, threadId, args);
      break;
    case "cauca":
      await handleFishingCommand(api, message);
      break;
  }
}
