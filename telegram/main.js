import { Telegraf } from 'telegraf'
import { ChatBot } from '../common/chatbot.js';
import  DefaultBotLogic  from '../common/defaultbotlogic.js';
import process from 'node:process'

const bot = new Telegraf(process.env.BOT_TOKEN)
const chatbot = new ChatBot(new DefaultBotLogic(), './common/corpus.json', undefined, true);

bot.start( (ctx) => ctx.reply('Welcome!'));

bot.on('message', async (ctx) => {
    let output_sentences = await chatbot.execute(ctx.message.text);

    for (let sentence of output_sentences){
        await ctx.reply(sentence);
    }
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));