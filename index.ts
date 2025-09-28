import { Keypair } from "@solana/web3.js";
import { Telegraf } from "telegraf";
import type { BotContext, UserStorage, PendingDeletions, PendingTransactions } from "./src/types.js";
import { createWalletHandlers } from "./src/handlers/wallet.js";
import { SolanaService } from "./src/services/solana.js";

const USERS: UserStorage = {};
const PENDING_DELETIONS: PendingDeletions = {};
const PENDING_TRANSACTIONS: PendingTransactions = {};

const solanaService = new SolanaService();

const {
    handleStart,
    handleCheckUserMap,
    handleGenerateWallet,
    handleViewAddress,
    handleExportPrivateKey,
    handleCheckBalance,
    handleTransactionHistory,
    handleSendSol,
    handleRequestAirdrop,
    handleConfirmSendSol,
    handleCancelSendSol
} = createWalletHandlers(USERS, PENDING_DELETIONS, PENDING_TRANSACTIONS, solanaService);

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
        bot.action(/^request_airdrop:(\d+)$/, handleRequestAirdrop);
        bot.action(/^confirm_send_sol:(\d+)$/, handleConfirmSendSol);
        bot.action(/^cancel_send_sol:(\d+)$/, handleCancelSendSol);

        bot.on('text', async (ctx) => {
            try {
                const userId = ctx.from?.id?.toString();
                if (!userId || !USERS[userId]) return;

                const text = ctx.message.text.trim();
                const parts = text.split(' ');
                
                if (parts.length === 2) {
                    const recipientAddress = parts[0];
                    const amountStr = parts[1];
                    
                    if (!recipientAddress || !amountStr) {
                        return ctx.reply('❌ Invalid format. Please use: <address> <amount>');
                    }
                    
                    const amount = parseFloat(amountStr);
                    
                    if (isNaN(amount) || amount <= 0) {
                        return ctx.reply('❌ Invalid amount. Please enter a valid number greater than 0.');
                    }
                    
                    try {
                        const { PublicKey } = await import('@solana/web3.js');
                        new PublicKey(recipientAddress);
                        
                        if (PENDING_TRANSACTIONS[userId]) {
                            return ctx.reply('❌ You already have a pending transaction. Please complete or cancel it first.');
                        }
                        
                        const senderKeypair = USERS[userId];
                        const balanceInfo = await solanaService.getBalance(senderKeypair.publicKey);
                        
                        if (balanceInfo.balance < amount) {
                            return ctx.reply(`❌ Insufficient balance. You have ${balanceInfo.balance.toFixed(6)} SOL, but tried to send ${amount} SOL.`);
                        }
                        
                        PENDING_TRANSACTIONS[userId] = {
                            recipientAddress,
                            amount,
                            timestamp: Date.now()
                        };
                        
                        const confirmMessage = `💸 **Confirm SOL Transfer**\n\n` +
                            `� **Amount:** ${amount} SOL\n` +
                            `📮 **To:** \`${recipientAddress}\`\n` +
                            `� **From Balance:** ${balanceInfo.balance.toFixed(6)} SOL\n\n` +
                            `⚠️ **This action cannot be undone!**`;
                        
                        const { Markup } = await import('telegraf');
                        return ctx.reply(confirmMessage, {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [
                                    Markup.button.callback('✅ Confirm Send', `confirm_send_sol:${userId}`),
                                    Markup.button.callback('❌ Cancel', `cancel_send_sol:${userId}`)
                                ]
                            ])
                        });
                        
                    } catch (error: any) {
                        console.error('SOL transfer preparation error:', error);
                        if (error.message.includes('Invalid public key input')) {
                            return ctx.reply('❌ Invalid recipient address. Please check the address and try again.');
                        }
                        return ctx.reply('❌ Invalid transaction format. Please try again.');
                    }
                }
            } catch (error) {
                console.error('Text message handling error:', error);
            }
        });      

        bot.catch((err, ctx) => {
            console.error("Bot error:", err);
            console.error("Context:", ctx.update);
        });

        await bot.launch();
        console.log("🤖 Bot is running on Solana Devnet...");
        console.log("📊 Features available:");
        console.log("  ✅ Wallet Generation");
        console.log("  ✅ View Address");
        console.log("  ✅ Export Private Key (with auto-deletion)");
        console.log("  ✅ Check Balance");
        console.log("  ✅ Transaction History");
        console.log("  ✅ Request Airdrop (5 SOL)");
        console.log("  ✅ Send SOL");

        setInterval(() => {
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            Object.keys(PENDING_TRANSACTIONS).forEach(userId => {
                const transaction = PENDING_TRANSACTIONS[userId];
                if (transaction && now - transaction.timestamp > fiveMinutes) {
                    delete PENDING_TRANSACTIONS[userId];
                }
            });
        }, 60000);

        const gracefulShutdown = () => {
            console.log("🛑 Shutting down bot...");
            
            Object.values(PENDING_DELETIONS).forEach(timeout => {
                clearTimeout(timeout);
            });
            
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