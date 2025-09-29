import { Context } from "telegraf";
import { Keypair } from "@solana/web3.js";

export interface BotContext extends Context {
  match?: RegExpExecArray;
}

export type UserStorage = Record<string, Keypair>;

export type PendingDeletions = Record<string, NodeJS.Timeout>;

export type PendingTransactions = Record<
  string,
  {
    recipientAddress: string;
    amount: number;
    timestamp: number;
  }
>;

export interface TransactionInfo {
  signature: string;
  blockTime: number | null;
  slot: number;
  confirmationStatus: string;
  err: any;
  memo?: string;
  fee: number;
}

export interface BalanceInfo {
  balance: number;
  lamports: number;
}
