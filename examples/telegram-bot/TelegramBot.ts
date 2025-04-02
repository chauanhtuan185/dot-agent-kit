import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { ChatOpenAI } from '@langchain/openai';
import { PolkadotAgentKit } from '../../src/agent/index';
import { PolkadotLangTools } from '../../src/tools/index';
import { Tool } from '@langchain/core/tools';
import { setupHandlers } from './handlers';
import { xcmTransfer } from '../../src/langchain/xcm/index';
import { checkBalanceTool } from '../../src/langchain/balance/index';
import { checkProxiesTool } from '../../src/langchain/proxy/index';
import { ChainInfo, ChainMap } from '../../src/chain/chainMap';

dotenv.config();

interface BotConfig {
  botToken: string;
  openAiApiKey?: string;
  privateKey?: string;
  delegatePrivateKey?: string;
  chains: { url: string; name: string; apiKey: string; type: 'RelayChain' | 'ParaChain'; paraId?: number }[];
}

export class TelegramBot {
  private bot: Telegraf;
  private agent: PolkadotAgentKit;
  private llm: ChatOpenAI;
  private chainMap: ChainMap = {};

  constructor(config: BotConfig) {
    const {
      botToken,
      openAiApiKey = process.env.OPENAI_API_KEY || '',
      privateKey,
      delegatePrivateKey,
      chains,
    } = config;

    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN must be provided!');
    }

    this.bot = new Telegraf(botToken);

    chains.forEach(chain => {
      this.chainMap[chain.name] = chain as ChainInfo;
    });

    this.agent = new PolkadotAgentKit({
      privateKey: privateKey || process.env.PRIVATE_KEY || '',
      delegatePrivateKey: delegatePrivateKey || process.env.DELEGATE_PRIVATE_KEY || '',
      chains,
    });

    this.llm = new ChatOpenAI({
      modelName: 'gpt-4',
      temperature: 0.7,
      openAIApiKey: openAiApiKey,
      streaming: true,
    });

    const tools = new PolkadotLangTools(this.agent);
    const xcmTool = xcmTransfer(tools, this.chainMap) as unknown as Tool;
    const balanceTool = checkBalanceTool(tools) as unknown as Tool;
    const proxiesTool = checkProxiesTool(tools, this.chainMap) as unknown as Tool;

    setupHandlers(this.bot, this.llm, {
      xcmTransfer: xcmTool,
      checkBalance: balanceTool,
      checkProxies: proxiesTool,
    });
  }

  public async start(): Promise<void> {
    try {
      await this.bot.launch();
      console.log('Telegram bot is running...');
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  public stop(): void {
    this.agent.disconnectAll();
    this.bot.stop();
    console.log('Bot stopped.');
  }
}