import { BrainNLU } from "node-nlp";
import { ChatBotLogic, IntentReplyLogic, extract_sentences, has_intent } from "./chatbot.js";
import compromise from 'compromise'
import wiki from 'wikijs'
import googleIt from 'google-it'
import axios from "axios";
import { parse } from 'node-html-parser'
import { input } from "@tensorflow/tfjs";

const wikipedia = wiki.default();


// Util classifier
let classifier = new BrainNLU();
classifier.add("This happens because X", "answer");
classifier.add("This happens because X", "answer");
classifier.add("This happens because of Y", "answer");
classifier.add("The answer is:", "answer");
classifier.add("This is because :", "answer");
classifier.add("Yes because", "answer");
classifier.add("No because ", "answer");
await classifier.train();

async function search_sentences_for_intents(sentences = [], intents=[{intent : "example", score : 0.2}], classifier = classifier){
    sentences = sentences.filter( (a) => {
        return (a.length) && (a.length >= 40) && (a.length <= 500);
    });

    let highest_score = 0;
    let highest_score_sentence;

    for (let sentence of sentences){
        console.log("Searching : ", sentence);
        let classifications = await classifier.getClassifications(sentence);
        let somed_score = 0;
        console.log(classifications);
        
        for (let intent of intents){
            let score =  has_intent(classifications, intent.intent, intent.score)
            console.log("INTENT : ", intent);
            console.log("SCORE RESULT : ", score);
            somed_score += score;
        }
        
        if (somed_score > highest_score){
            highest_score_sentence = sentence;
            highest_score = somed_score;
        }
        
    }
    console.log("HIGHEST SCORE: ", highest_score);
    return highest_score_sentence;
}

async function search_text_for_intents(text="", intents=[{intent : "example", score : 0.2}], classifier=classifier){
    console.log("Searching text for : ", intents);
    let sentences = extract_sentences(text);
    let result = await search_sentences_for_intents(sentences, intents, classifier);

    console.log("RESULT : ", result);
    return result;
}

function extract_html_text(html = ""){
    let parsed = parse(html, {
        comment : false,
        blockTextElements : {
          script : false,
          noscript : false,
          style : false  
        }
    });

    return parsed.text.trim()
}

export default class DefaultBotLogic extends ChatBotLogic {
    constructor(){

        // Create the logic
        super(
            // Greeting reply
            new IntentReplyLogic("greeting", 0.2, (input_sentence, bot) => {
                let doc = compromise(input_sentence);
                let proper_noun = doc.match("#ProperNoun").text();
        
                if (proper_noun){
                    bot.context.user_name = proper_noun;
                }
        
                let replies = [
                    "Good day!",
                    "Greetings!",
                    "Hi!"
                ];
        
                if (bot.context.user_name){
                    replies.push(
                        ...[
                            "Good day {{user_name}}",
                            "Greetings {{user_name}}"
                        ]
                    );
                }
                
                return bot.random_choice(replies);
            }),

            new IntentReplyLogic("declare.name", 0.2, (input_sentence, bot) => {
                let doc = compromise(input_sentence);
                let proper_noun = doc.match("#ProperNoun").text();

                bot.context.user_name = proper_noun;
                return undefined;
            }),

            new IntentReplyLogic("ask.name", 0.4, (input_sentence, bot) => {
                let replies = [
                    "My name is ExMachine2120",
                    "I am ExMachine2120 The greatest Robot Ever!",
                ]
        
                return bot.random_choice(replies);
            }),

            new IntentReplyLogic("ask.state", 0.4, (input_sentence, bot) => {
                let replies = [
                    "I am fine.",
                    "I am feeling fine.",
                    "I'm good, thanks."
                ]
        
                return bot.random_choice(replies);
            }),

            new IntentReplyLogic("ask.whatis", 0.2, async (input_sentence, bot) => {
                // Search on wikpedia
                let result = await wikipedia.find(input_sentence).catch(err => {
                    console.log("ERROR searching on wikipedia for : ", input_sentence);
                });

                if (result){
                    bot.log("Wikipedia result : ", result);

                    let content = await result.rawContent()

                    let search_result = await search_text_for_intents(content, [
                        {intent : "answer", score : 0.6}
                    ], classifier);

                    bot.context.last_result = content;
                    return search_result;
                }
                else{
                    return "I don't Know :(";
                }
            }),

            new IntentReplyLogic("ask.tellmore", 0.2, (input_sentence, bot) => {
                if (!bot.context.last_result){
                    return "About What?"
                }
        
                else{
                    let sentences = extract_sentences(bot.context.last_result);
                    let random_sentence = bot.random_choice(sentences.slice(1));
                    bot.log("Random Sentence : ", random_sentence);
                    return random_sentence;
                }
            }),

            new IntentReplyLogic("ask.yes_or_no", 0.2, (input_sentence, bot) => {
                // verify if has memory
                let memory = bot.remember_memory(input_sentence);
                if (memory){
                    return memory;
                }

                // generate a new response
                else {       
                    let replies = [
                        "No",
                        "Yes",
                        "Not.",
                        "Offcourse!"
                    ];
    
                    let reply = bot.random_choice(replies);
                    bot.record_memory(input_sentence, reply);
                    return reply;
                }
            }),

            new IntentReplyLogic("ask.why", 0.3, async (input_sentence, bot) =>{
                let last_message = bot.context.memory.last_message;

                console.log("       Searching on google for : ".yellow, input_sentence)

                // clone new classifier
                let new_classifier = Object.assign(Object.create(Object.getPrototypeOf(classifier)), classifier);

                // Train classifier with question
                new_classifier.add(input_sentence, 'question');
                new_classifier.train();

                let results = await googleIt({
                    'query' : last_message + input_sentence,
                    'noDisplay' : true
                }).catch( (err) => {
                    console.log(err);
                    return "";
                });
                
                if (results){
                    let site = results[0].link;
                    console.log("       First Result : ".yellow, site);
    
                    // enter in the site
                    try{
                        let response_html = (await axios.get(site)).data;
                        let response_text = extract_html_text(response_html);

                        console.log("       Site Text: ".yellow, response_text);
                        console.log("       Interpreting site".yellow);
        
                        let search_response = await search_text_for_intents(
                            response_text, 
                            [
                                {intent : "answer", score : 0.6},
                                {intent : "question", score : 0.2}
                            ], 
                            new_classifier
                        );

                        bot.log("       Highest response sentence: ".yellow, search_response);
    
                        return search_response;
                    }
                    catch( err){
                        console.log("ERROR WHILE REQUESTING PAGE".red)
                        console.log(err);
                        return "";
                    }
                }
            }),

            new IntentReplyLogic("ask.preference", 0.2, (input_sentence, bot) => {
                // verify if has memory
                let memory = bot.remember_memory(input_sentence);
                if (memory){
                    return memory;
                }

                // generate a new response
                else {       
                    let replies = [
                        "Yes i like it!",
                        "I dont like it.",
                        "it is a mess",
                        "it is Aweasome!",
                        "It is the best thing i ever seen",
                        "It is the worst thing i ever seen"
                    ];
    
                    let reply = bot.random_choice(replies);
                    bot.record_memory(input_sentence, reply);
                    return reply;
                }
            }),

            new IntentReplyLogic("goodbye", 0.4, (input_sentence, bot) => {
                let replies = [
                    "Good bye!",
                    "See you soon.",
                    "Until next time."
                ]

                if (bot.content.user_name){
                    replies = replies.concat([
                        "Good Bye {{user_name}}",
                        "Until Next time {{user_name}}",
                        "See you soon. {{user_name}}",
                    ]);
                }
        
                return bot.random_choice(replies);
            })

        );
    }
}