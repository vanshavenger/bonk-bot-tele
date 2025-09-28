import { Keypair } from "@solana/web3.js";
import { Telegraf, Markup, Context } from "telegraf";
import { message } from "telegraf/filters";
import bs58 from "bs58";

interface BotContext extends Context {
    match?: RegExpExecArray;
}

const USERS: Record<string, Keypair> = {};

const PENDING_DELETIONS: Record<string, NodeJS.Timeout> = {};

const hasWallet = (userId: string): boolean => !!USERS[userId];

const getKeyboard = (userId: string, userHasWallet: boolean = false) => {
    const buttons = [];
    
    if (!userHasWallet) {
        buttons.push([Markup.button.callback("🔑 Generate Wallet", `generate_wallet:${userId}`)]);
    }
    
    buttons.push(
        [
            Markup.button.callback("View Address", `view_address:${userId}`),
            Markup.button.callback("Export Private Key", `export_private_key:${userId}`),
        ],
        [
            Markup.button.callback("Check Balance", `check_balance:${userId}`),
            Markup.button.callback("Transaction History", `transaction_history:${userId}`),
        ],
        [
            Markup.button.callback("Send SOL", `send_sol:${userId}`),
            Markup.button.callback("Send Token", `send_token:${userId}`),
        ],
        [
            Markup.button.callback("Check User Map", `check_user_map:${userId}`),
        ]
    );
    
    return Markup.inlineKeyboard(buttons);
};

const sendMessageWithKeyboard = async (ctx: BotContext, text: string, userId: string, options: any = {}) => {
    const userHasWallet = hasWallet(userId);
    return ctx.sendMessage(text, {
        ...options,
        ...getKeyboard(userId, userHasWallet)
    });
};

const handleError = (error: any, ctx: BotContext, action: string) => {
    console.error(`Error in ${action} handler:`, error);
    return ctx.answerCbQuery("Something went wrong!");
};

const handleStart = (ctx: BotContext) => {
    try {
        const userId = ctx.from?.id;
        if (!userId) return;

        const welcomeMessage = `Welcome to Solana Bot, <b>${ctx.from.first_name}</b>!\n\nChoose an option below to get started.\n\n`;
        const userIdStr = userId.toString();
        
        return ctx.sendMessage(welcomeMessage, {
            parse_mode: "HTML",
            ...getKeyboard(userIdStr, hasWallet(userIdStr))
        });
    } catch (error) {
        console.error("Error in start handler:", error);
        return ctx.sendMessage("Sorry, something went wrong. Please try again.");
    }
};

const handleCheckUserMap = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        return sendMessageWithKeyboard(ctx, `Total users: ${Object.keys(USERS).length}`, userId);
    } catch (error) {
        return handleError(error, ctx, "check_user_map");
    }
};

const handleGenerateWallet = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return ctx.answerCbQuery("User ID not found!");
        
        ctx.answerCbQuery("Generating wallet...");

        if (USERS[userId]) {
            return sendMessageWithKeyboard(ctx, "Wallet already exists!", userId);
        }

        const keypair = Keypair.generate();
        USERS[userId] = keypair;
        const publicKey = keypair.publicKey.toBase58();
        
        return sendMessageWithKeyboard(
            ctx, 
            `✅ Wallet generated successfully!\n\n👀 Your Wallet Address:\n\`${publicKey}\``, 
            userId, 
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        return handleError(error, ctx, "generate_wallet");
    }
};

const handleViewAddress = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        
        if (!USERS[userId]) {
            return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId);
        }
        
        const publicKey = USERS[userId].publicKey.toBase58();
        return sendMessageWithKeyboard(
            ctx, 
            `👀 Your Wallet Address:\n\n\`${publicKey}\``, 
            userId, 
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        return handleError(error, ctx, "view_address");
    }
};

const handleExportPrivateKey = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        
        if (!USERS[userId]) {
            return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId);
        }
        
        if (PENDING_DELETIONS[userId]) {
            return sendMessageWithKeyboard(
                ctx, 
                "⏱️ You already have a private key message that will be deleted soon. Please wait before requesting another one.", 
                userId
            );
        }
        
        const privateKeyArray = Array.from(USERS[userId].secretKey);
        const privateKeyBase58 = USERS[userId].secretKey;
        const privateKeyString = bs58.encode(privateKeyBase58);
        
        const warningMessage = `🔐 **Your Private Key** ⚠️\n\n` +
            `**WARNING:** Never share your private key with anyone! Anyone with access to this key can control your wallet.\n\n` +
            `**Private Key (Base58):**\n\`${privateKeyString}\`\n\n` +
            `**Private Key (Array):**\n\`[${privateKeyArray.join(',')}]\`\n\n` +
            `🚨 **This message will self-delete in 30 seconds for security!**\n` +
            `💾 **Copy your private key NOW!**`;
        
        const sentMessage = await ctx.sendMessage(warningMessage, {
            parse_mode: "Markdown",
            ...getKeyboard(userId, true)
        });
        
        PENDING_DELETIONS[userId] = setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMessage.message_id);
                console.log(`Auto-deleted private key message for user ${userId}`);
            } catch (error) {
                console.error("Failed to delete private key message:", error);
            } finally {
                delete PENDING_DELETIONS[userId];
            }
        }, 30000);
        
        return sentMessage;
    } catch (error) {
        return handleError(error, ctx, "export_private_key");
    }
};

const handleCheckBalance = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        return sendMessageWithKeyboard(ctx, "💰 Check Balance button clicked!", userId);
    } catch (error) {
        return handleError(error, ctx, "check_balance");
    }
};

const handleTransactionHistory = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        return sendMessageWithKeyboard(ctx, "📊 Transaction History button clicked!", userId);
    } catch (error) {
        return handleError(error, ctx, "transaction_history");
    }
};

const handleSendSol = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        return sendMessageWithKeyboard(ctx, "💸 Send SOL button clicked!", userId);
    } catch (error) {
        return handleError(error, ctx, "send_sol");
    }
};

const handleSendToken = async (ctx: BotContext) => {
    try {
        const userId = ctx.match?.[1];
        if (!userId) return;
        
        ctx.answerCbQuery();
        return sendMessageWithKeyboard(ctx, "🪙 Send Token button clicked!", userId);
    } catch (error) {
        return handleError(error, ctx, "send_token");
    }
};

async function main() {
    try {
        if (!process.env.BOT_TOKEN) {
            throw new Error("BOT_TOKEN environment variable is required");
        }

        const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);

        bot.start(handleStart);
        bot.action(/^check_user_map:(\d+)$/, handleCheckUserMap);
        bot.action(/^generate_wallet:(\d+)$/, handleGenerateWallet);
        bot.action(/^view_address:(\d+)$/, handleViewAddress);
        bot.action(/^export_private_key:(\d+)$/, handleExportPrivateKey);
        bot.action(/^check_balance:(\d+)$/, handleCheckBalance);
        bot.action(/^transaction_history:(\d+)$/, handleTransactionHistory);
        bot.action(/^send_sol:(\d+)$/, handleSendSol);
        bot.action(/^send_token:(\d+)$/, handleSendToken);

        bot.catch((err, ctx) => {
            console.error("Bot error:", err);
            console.error("Context:", ctx.update);
        });

        await bot.launch();
        console.log("🤖 Bot is running...");

        const gracefulShutdown = () => {
            console.log("🛑 Shutting down bot...");
            bot.stop();
        };

        process.once("SIGINT", gracefulShutdown);
        process.once("SIGTERM", gracefulShutdown);

    } catch (error) {
        console.error("Failed to initialize bot:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
});
