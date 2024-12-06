require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const app = express();
const port = 5001;
const ethers = require('ethers');
const abi = require('./abi.json');

// Web3 Configuration
const provider = new ethers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/ngGcydhhMHgnUG8uThMl7osVVVOM0u1S');
const contractAddress = '0x370a366f402e2e41cdbbe54ecec12aae0cce1955';
const contractABI = abi;
const contract = new ethers.Contract(contractAddress, contractABI, provider);
const address = "0x000000000000000000000000000000000000dEaD"

// Telegram Bot Token from .env
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = "-1002208114498";

// Create Telegram Bot Instance
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Create a Set to track processed transaction hashes
const processedTransactions = new Set();

// Express Middleware
app.use(express.json());

// Function to parse ERC20 transfer input
function parseTransferInput(input) {
  // Remove the method signature (first 10 characters)
  const dataWithoutMethodSig = input.slice(10);
  
  // Extract recipient address (20 bytes = 40 hex characters)
  const recipientAddress = '0x' + dataWithoutMethodSig.slice(24, 64);
  
  // Extract amount (last 32 bytes)
  const hexAmount = '0x' + dataWithoutMethodSig.slice(64);
  
  // Convert to decimal (assuming 18 decimals)
  const decimalAmount = BigInt(hexAmount) / BigInt(10 ** 18);
  
  return {
    recipient: recipientAddress,
    amount: decimalAmount.toString()
  };
}

// Webhook Endpoint
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log(webhook.txs[0].hash)
    console.log(webhook.txs[0].input)

    // Process each NFT transfer
    for (const ToadTransfer of webhook.txs) {
      // Check if this transaction has already been processed
      if (processedTransactions.has(ToadTransfer.hash)) {
        console.log(`Duplicate transaction detected: ${ToadTransfer.hash}`);
        continue; // Skip this iteration
      }

      // Add the transaction hash to processed set
      processedTransactions.add(ToadTransfer.hash);

      // Remove old transaction hashes to prevent memory buildup
      if (processedTransactions.size > 1000) {
        const oldestHash = Array.from(processedTransactions)[0];
        processedTransactions.delete(oldestHash);
      }

      try {
        // Parse the transfer input
        const transferDetails = parseTransferInput(ToadTransfer.input);
        
        // Get balance and convert to whole number
        const balance = await contract.balanceOf(address);
        const balanceInWholeNumber = ethers.formatUnits(balance, 18).split('.')[0];

        // Construct caption
        const caption =
          `🔥 Frog Soup Cafe just burnt $TOAD *${transferDetails.amount}*! 🔥\n` +
          `\n🔥 Total $TOAD burned: $TOAD *${balanceInWholeNumber}*\n\n` +
          `Transaction Hash: https://etherscan.io/tx/${ToadTransfer.hash} \n\n` +
          `🐸🍲 Mint Frog Soup: https://www.frogsoupcafe.fun/`;

        const image = "./soup.png"

        // Send photo with caption
        await bot.sendPhoto(CHAT_ID, image, {
          caption: caption,
          parse_mode: 'Markdown'
        });

      } catch (metadataError) {
        console.error('Error processing NFT metadata:', metadataError);
        
        // Optional: Send error notification to Telegram
        await bot.sendMessage(CHAT_ID, `Error processing NFT ${ToadTransfer.hash}: ${metadataError.message}`);
      }
    }

    // Respond to webhook
    return res.status(200).json({ status: 'processed' });

  } catch (webhookError) {
    console.error('Webhook processing error:', webhookError);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Start Express Server
app.listen(port, () => {
  console.log(`Listening for NFT Transfers on port ${port}`);
});