import { Markup } from "telegraf";
import type { BotContext, UserStorage } from "../types.js";

export const hasWallet = (userId: string, users: UserStorage): boolean =>
  !!users[userId];

export const getKeyboard = (userId: string, userHasWallet: boolean = false) => {
  const buttons = [];

  if (!userHasWallet) {
    buttons.push([
      Markup.button.callback("🔑 Generate Wallet", `generate_wallet:${userId}`),
    ]);
  }

  buttons.push(
    [
      Markup.button.callback("View Address", `view_address:${userId}`),
      Markup.button.callback(
        "Export Private Key",
        `export_private_key:${userId}`,
      ),
    ],
    [
      Markup.button.callback("Check Balance", `check_balance:${userId}`),
      Markup.button.callback(
        "Transaction History",
        `transaction_history:${userId}`,
      ),
    ],
    [Markup.button.callback("💰 Request Airdrop", `request_airdrop:${userId}`)],
    [Markup.button.callback("Send SOL", `send_sol:${userId}`)],
    [Markup.button.callback("Check User Map", `check_user_map:${userId}`)],
  );

  return Markup.inlineKeyboard(buttons);
};

export const sendMessageWithKeyboard = async (
  ctx: BotContext,
  text: string,
  userId: string,
  users: UserStorage,
  options: any = {},
) => {
  const userHasWallet = hasWallet(userId, users);
  return ctx.sendMessage(text, {
    ...options,
    ...getKeyboard(userId, userHasWallet),
  });
};

export const handleError = (error: any, ctx: BotContext, action: string) => {
  console.error(`Error in ${action} handler:`, error);
  return ctx.answerCbQuery("Something went wrong!");
};

export const validateUserId = (
  userId: string | undefined,
): userId is string => {
  return typeof userId === "string" && userId.length > 0;
};
