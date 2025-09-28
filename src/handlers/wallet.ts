import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import * as bip39 from "bip39";
import type { BotContext, UserStorage, PendingDeletions, PendingTransactions } from "../types.js";
import { sendMessageWithKeyboard, handleError, validateUserId, getKeyboard, hasWallet } from "../utils/helpers.js";
import { SolanaService } from "../services/solana.js";

export const createWalletHandlers = (
    users: UserStorage, 
    pendingDeletions: PendingDeletions,
    pendingTransactions: PendingTransactions,
    solanaService: SolanaService
) => {
    
    const handleStart = (ctx: BotContext) => {
        try {
            const userId = ctx.from?.id;
            if (!userId) return;

            const welcomeMessage = `Welcome to Solana Bot, <b>${ctx.from.first_name}</b>!\n\nChoose an option below to get started.\n\n`;
            const userIdStr = userId.toString();
            
            return ctx.sendMessage(welcomeMessage, {
                parse_mode: "HTML",
                ...getKeyboard(userIdStr, hasWallet(userIdStr, users))
            });
        } catch (error) {
            console.error("Error in start handler:", error);
            return ctx.sendMessage("Sorry, something went wrong. Please try again.");
        }
    };

    const handleCheckUserMap = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery();
            return sendMessageWithKeyboard(ctx, `Total users: ${Object.keys(users).length}`, userId, users);
        } catch (error) {
            return handleError(error, ctx, "check_user_map");
        }
    };

    const handleGenerateWallet = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return ctx.answerCbQuery("User ID not found!");
            
            ctx.answerCbQuery("Generating wallet...");

            if (users[userId]) {
                return sendMessageWithKeyboard(ctx, "Wallet already exists!", userId, users);
            }

            const mnemonic = bip39.generateMnemonic(128); 

            const seed = await bip39.mnemonicToSeed(mnemonic);
            const keypair = Keypair.fromSeed(seed.subarray(0, 32));
            
            users[userId] = keypair;
            const publicKey = keypair.publicKey.toBase58();            const balance = await solanaService.getBalance(new PublicKey(publicKey));
            
            const walletMessage = `✅ **Wallet Generated Successfully!** 🎉\n\n` +
                `👀 **Your Wallet Address:**\n\`${publicKey}\`\n\n` +
                `💰 **Current Balance:** ${balance.balance} SOL (${balance.lamports} lamports)\n\n` +
                `🔑 **Recovery Phrase (12 words):**\n\`${mnemonic}\`\n\n` +
                `⚠️ **IMPORTANT SECURITY REMINDERS:**\n` +
                `• 🔐 **Backup your private key** using "Export Private Key"\n` +
                `• 📝 **Write down your recovery phrase** and store it safely\n` +
                `• 🚫 **Never share** your private key or recovery phrase\n` +
                `• 💾 **Anyone with access can control your wallet**\n\n` +
                `🚀 **Next Steps:**\n` +
                `• Use "Check Balance" to see your SOL balance\n` +
                `• Fund your wallet to start using it\n` +
                `• Use "Transaction History" to track activity\n` +
                `• Use "Export Private Key" to backup (auto-deletes in 30s)`;
            
            return sendMessageWithKeyboard(
                ctx, 
                walletMessage, 
                userId, 
                users,
                { parse_mode: "Markdown" }
            );
        } catch (error) {
            return handleError(error, ctx, "generate_wallet");
        }
    };

    const handleViewAddress = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery();
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            const publicKey = users[userId].publicKey.toBase58();
            return sendMessageWithKeyboard(
                ctx, 
                `👀 Your Wallet Address:\n\n\`${publicKey}\``, 
                userId, 
                users,
                { parse_mode: "Markdown" }
            );
        } catch (error) {
            return handleError(error, ctx, "view_address");
        }
    };

    const handleExportPrivateKey = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery();
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            if (pendingDeletions[userId]) {
                return sendMessageWithKeyboard(
                    ctx, 
                    "⏱️ You already have a private key message that will be deleted soon. Please wait before requesting another one.", 
                    userId,
                    users
                );
            }
            
            const privateKeyArray = Array.from(users[userId].secretKey);
            const privateKeyBase58 = users[userId].secretKey;
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
            
            pendingDeletions[userId] = setTimeout(async () => {
                try {
                    await ctx.deleteMessage(sentMessage.message_id);
                    console.log(`Auto-deleted private key message for user ${userId}`);
                } catch (error) {
                    console.error("Failed to delete private key message:", error);
                } finally {
                    delete pendingDeletions[userId];
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
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery("Checking balance...");
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            const publicKey = users[userId].publicKey;
            const balanceInfo = await solanaService.getBalance(publicKey);
            const formattedBalance = solanaService.formatBalance(balanceInfo);
            
            return sendMessageWithKeyboard(
                ctx, 
                formattedBalance, 
                userId, 
                users,
                { parse_mode: "Markdown" }
            );
        } catch (error) {
            console.error("Error in check_balance handler:", error);
            const userId = ctx.match?.[1];
            if (validateUserId(userId)) {
                return sendMessageWithKeyboard(
                    ctx, 
                    "❌ Failed to fetch balance. Please check your connection and try again.", 
                    userId, 
                    users
                );
            }
            return ctx.answerCbQuery("Something went wrong!");
        }
    };

    const handleTransactionHistory = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery("Fetching transaction history...");
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            const publicKey = users[userId].publicKey;
            const transactions = await solanaService.getTransactionHistory(publicKey, 10);
            const formattedHistory = solanaService.formatTransactionHistory(transactions);
            
            return sendMessageWithKeyboard(
                ctx, 
                formattedHistory, 
                userId, 
                users,
                { parse_mode: "Markdown" }
            );
        } catch (error) {
            console.error("Error in transaction_history handler:", error);
            const userId = ctx.match?.[1];
            if (validateUserId(userId)) {
                return sendMessageWithKeyboard(
                    ctx, 
                    "❌ Failed to fetch transaction history. Please check your connection and try again.", 
                    userId, 
                    users
                );
            }
            return ctx.answerCbQuery("Something went wrong!");
        }
    };

    const handleSendSol = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery();
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            const sendMessage = `💸 **Send SOL** 💸\n\n` +
                `Please reply with: \`<address> <amount>\`\n\n` +
                `**Example:** \`9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM 0.1\``;
            
            return sendMessageWithKeyboard(
                ctx, 
                sendMessage, 
                userId, 
                users,
                { parse_mode: "Markdown" }
            );
        } catch (error) {
            return handleError(error, ctx, "send_sol");
        }
    };

    const handleRequestAirdrop = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery("Requesting airdrop...");
            
            if (!users[userId]) {
                return sendMessageWithKeyboard(ctx, "❌ No wallet found! Please generate a wallet first.", userId, users);
            }
            
            const publicKey = users[userId].publicKey;
            
            try {
                const signature = await solanaService.requestAirdrop(publicKey, 5);
                
                const successMessage = `✅ **Airdrop Successful!** 🎉\n\n` +
                    `💰 **Amount:** 5 SOL\n` +
                    `📋 **Transaction:** \`${signature.slice(0, 8)}...${signature.slice(-8)}\`\n\n` +
                    `✨ **5 SOL has been added to your wallet!**\n` +
                    `Use "Check Balance" to see your updated balance.\n\n` +
                    `🔗 View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`;
                
                return sendMessageWithKeyboard(
                    ctx, 
                    successMessage, 
                    userId, 
                    users,
                    { parse_mode: "Markdown" }
                );
            } catch (airdropError) {
                console.error("Airdrop failed:", airdropError);
                const errorMessage = `❌ **Airdrop Failed**\n\n` +
                    `Sorry, the airdrop request failed. This could be due to:\n` +
                    `• Rate limiting (try again in a few minutes)\n` +
                    `• Devnet issues\n` +
                    `• Network connectivity\n\n` +
                    `Please try again later.`;
                
                return sendMessageWithKeyboard(
                    ctx, 
                    errorMessage, 
                    userId, 
                    users,
                    { parse_mode: "Markdown" }
                );
            }
        } catch (error) {
            return handleError(error, ctx, "request_airdrop");
        }
    };

    const handleConfirmSendSol = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery("Processing transaction...");
            
            if (!users[userId] || !pendingTransactions[userId]) {
                return ctx.editMessageText("❌ Transaction expired or invalid.");
            }
            
            const { recipientAddress, amount } = pendingTransactions[userId];
            
            try {
                const { PublicKey } = await import('@solana/web3.js');
                const recipientPublicKey = new PublicKey(recipientAddress);
                
                const senderKeypair = users[userId];
                const balanceInfo = await solanaService.getBalance(senderKeypair.publicKey);
                
                if (balanceInfo.balance < amount) {
                    delete pendingTransactions[userId];
                    return ctx.editMessageText(`❌ Insufficient balance. You have ${balanceInfo.balance.toFixed(6)} SOL.`);
                }
                
                const signature = await solanaService.sendSOL(senderKeypair, recipientPublicKey, amount);
                
                delete pendingTransactions[userId];
                
                const successMessage = `✅ **SOL Sent Successfully!** 🎉\n\n` +
                    `💸 **Amount:** ${amount} SOL\n` +
                    `📮 **To:** \`${recipientAddress}\`\n` +
                    `📋 **Transaction:** \`${signature.slice(0, 8)}...${signature.slice(-8)}\`\n\n` +
                    `🔗 [View on Explorer](https://explorer.solana.com/tx/${signature}?cluster=devnet)`;
                
                return ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
                
            } catch (error: any) {
                delete pendingTransactions[userId];
                console.error('SOL transfer error:', error);
                if (error.message.includes('Invalid public key input')) {
                    return ctx.editMessageText('❌ Invalid recipient address.');
                }
                return ctx.editMessageText('❌ Failed to send SOL. Please try again.');
            }
        } catch (error) {
            return handleError(error, ctx, "confirm_send_sol");
        }
    };

    const handleCancelSendSol = async (ctx: BotContext) => {
        try {
            const userId = ctx.match?.[1];
            if (!validateUserId(userId)) return;
            
            ctx.answerCbQuery("Transaction cancelled");
            
            if (pendingTransactions[userId]) {
                delete pendingTransactions[userId];
            }
            
            return ctx.editMessageText("❌ **Transaction Cancelled**\n\nYou can start a new transfer anytime.", { parse_mode: 'Markdown' });
        } catch (error) {
            return handleError(error, ctx, "cancel_send_sol");
        }
    };



    return {
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
    };
};