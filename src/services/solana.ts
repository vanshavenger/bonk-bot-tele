import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from "@solana/web3.js";
import type { TransactionInfo, BalanceInfo } from "../types.js";

export class SolanaService {
    private connection: Connection;
    
    constructor(rpcUrl: string = "https://api.devnet.solana.com") {
        this.connection = new Connection(rpcUrl, 'confirmed');
    }
    
    async getBalance(publicKey: PublicKey): Promise<BalanceInfo> {
        try {
            const lamports = await this.connection.getBalance(publicKey);
            const balance = lamports / LAMPORTS_PER_SOL;
            
            return {
                balance,
                lamports
            };
        } catch (error) {
            console.error("Error fetching balance:", error);
            throw new Error("Failed to fetch balance. Please try again later.");
        }
    }
    
    async getTransactionHistory(publicKey: PublicKey, limit: number = 10): Promise<TransactionInfo[]> {
        try {
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit });
            
            if (signatures.length === 0) {
                return [];
            }
            
            const transactions: TransactionInfo[] = signatures.map(sig => ({
                signature: sig.signature,
                blockTime: sig.blockTime || null,
                slot: sig.slot,
                confirmationStatus: sig.confirmationStatus || 'unknown',
                err: sig.err,
                memo: sig.memo || undefined,
                fee: 0 
            }));
            
            return transactions;
        } catch (error) {
            console.error("Error fetching transaction history:", error);
            throw new Error("Failed to fetch transaction history. Please try again later.");
        }
    }
    
    async getRecentTransactions(publicKey: PublicKey, limit: number = 5): Promise<string[]> {
        try {
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit });
            return signatures.map(sig => sig.signature);
        } catch (error) {
            console.error("Error fetching recent transactions:", error);
            throw new Error("Failed to fetch recent transactions.");
        }
    }

    async requestAirdrop(publicKey: PublicKey, amount: number = 5): Promise<string> {
        try {
            const amountInLamports = amount * LAMPORTS_PER_SOL;
            const signature = await this.connection.requestAirdrop(publicKey, amountInLamports);
            
            await this.connection.confirmTransaction({
                signature,
                blockhash: (await this.connection.getLatestBlockhash()).blockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            });
            
            return signature;
        } catch (error) {
            console.error("Error requesting airdrop:", error);
            throw new Error("Failed to request airdrop. Please try again later.");
        }
    }

    async sendSOL(fromKeypair: Keypair, toPublicKey: PublicKey, amount: number): Promise<string> {
        try {
            const amountInLamports = amount * LAMPORTS_PER_SOL;
            
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromKeypair.publicKey,
                    toPubkey: toPublicKey,
                    lamports: amountInLamports,
                })
            );
            
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [fromKeypair]
            );
            
            return signature;
        } catch (error) {
            console.error("Error sending SOL:", error);
            throw new Error("Failed to send SOL. Please check your balance and try again.");
        }
    }
    
    formatBalance(balanceInfo: BalanceInfo): string {
        return `💰 **Balance Information**\n\n` +
               `**SOL Balance:** ${balanceInfo.balance.toFixed(6)} SOL\n` +
               `**Lamports:** ${balanceInfo.lamports.toLocaleString()}\n\n` +
               `_Balance fetched from Solana devnet_`;
    }
    
    formatTransactionHistory(transactions: TransactionInfo[]): string {
        if (transactions.length === 0) {
            return `📊 **Transaction History**\n\n` +
                   `No transactions found for this wallet.\n\n` +
                   `_This wallet hasn't made any transactions yet._`;
        }
        
        let message = `📊 **Transaction History** (Last ${transactions.length})\n\n`;
        
        transactions.forEach((tx, index) => {
            const date = tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleDateString() : 'Unknown';
            const status = tx.err ? '❌ Failed' : '✅ Success';
            const shortSig = `${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}`;
            
            message += `**${index + 1}.** \`${shortSig}\`\n`;
            message += `   📅 ${date} | ${status}\n`;
            if (tx.memo) {
                message += `   📝 ${tx.memo}\n`;
            }
            message += `\n`;
        });
        
        message += `_View full transactions on Solana Explorer_`;
        return message;
    }
}