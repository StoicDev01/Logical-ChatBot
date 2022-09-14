import { NlpManager, ConversationContext,  } from 'node-nlp'
import compromise from 'compromise'
import colors from 'colors'

// Extract sentences from text
export function extract_sentences(input_text){
    let doc = compromise(input_text);
    return doc.sentences().out('array');
}

export function has_intent(classifications = [], intent_name = '__UNDEFINED__', min_score = 0.2){
    let score = 0;
    classifications.forEach( (classification) => {
        if (classification.intent == intent_name){

            if (classification.score >= min_score){
                score = classification.score
            }
        }
    });

    return score;
}

// CHATBOT REPLY LOGIC FOR ONE INTENT
export class IntentReplyLogic {
    execute(interpreted) {
        this.load("Interpreted : ", interpreted)
        return {
            sentence : "Undefined",
            context : {
                "New variable" : 1
            }
        }
    }

    constructor(intent_name = "", min_intent_value = 0.2, execute = () =>{ return ""}){
        this.intent_name = intent_name;
        this.execute = execute;
        this.min_intent_value = min_intent_value;
    }
}

// CHATBOT REPLY LOGIC FOR ALL INTENTS
export class ChatBotLogic extends Array{


    // Execute bot reply logic
    async execute(interpreted_sentence, bot){
        let results = [];

        for (const reply_logic of this){
            if (has_intent(interpreted_sentence.classifications, reply_logic.intent_name, reply_logic.min_intent_value)){
                let result;
    
                if (typeof reply_logic.execute == typeof Promise){
                    result = await reply_logic.execute(interpreted_sentence.utterance, bot);
                }
                else{
                    result = reply_logic.execute(interpreted_sentence.utterance, bot);
                }
    
                results.push(result);
            }
        }

        return results;
    }
}

// CHATBOT MAIN CLASS
export class ChatBot{
    /**
        * @param {ChatBotLogic} logic The bot reply logic
        * @param {string} corpus_path The corpus with intents and entities
    */
    constructor(logic = ChatBot(), corpus_path = "./common/corpus.json", load_saved = "", do_log=false){
        this.nlp_manager = new NlpManager(
            {
                languages : ['en', 'pt'],
                forceNER : true
            }
        );

        if (load_saved){
            this.nlp_manager.load('./common/'+load_saved);
        }
        else {
            this.nlp_manager.addCorpus(corpus_path);
            
            this.nlp_manager.train().then( 
                () => this.nlp_manager.save("./common/saved.nlp")
            );
        }
            
        this.context = new ConversationContext();
        this.do_log = do_log;
        this.context.memory = {}
        this.logic = logic;
    }

    log(...args){
        if (this.do_log){
            console.log(...args);
        }
    }

    random_choice(list = []){
        return list[Math.floor(Math.random() * list.length)];
    }
    
    // Saves a reply of a input
    record_memory(input_sentence, reply){
        let doc = compromise(input_sentence);
        let noun = doc.match("#Noun").out('root')
        let verb = doc.verbs().out('root');
        let adjective = doc.adjectives().out('root');

        let memory_string = "";

        memory_string += noun;
        memory_string += verb;
        memory_string += adjective;
        memory_string = memory_string.replace(/[ ?!.]/g, '');

        if (!this.context.memory){
            this.context.memory = {}
        }
    
        this.context.memory[memory_string] = reply;
        this.context.memory.last_input = input_sentence;
    }

    // Remember from memory a reply from a input
    remember_memory(input_sentence){
        if (this.context.memory){
            let doc = compromise(input_sentence);
            let noun = doc.match("#Noun").out('root')
            let verb = doc.verbs().out('root');
            let adjective = doc.adjectives().out('root');
    
            let memory_string = "";
                        
            memory_string += noun;
            memory_string += verb;
            memory_string += adjective;
            memory_string = memory_string.replace(/[ ?!.]/g, '');

            return this.context.memory[memory_string];
        }
    }



    // interpret each sentence input and return sentences output
    async interpret_sentences(input_sentences = []){
        let output_sentences = []

        for (const input_sentence of input_sentences){
            this.log(`  Interpreting sentence : ${input_sentence}`.yellow);

            // classify sentence by intent
            let interpreted = await this.nlp_manager.process('en', input_sentence, this.context);

            this.log("  Utterance : ".blue, interpreted.utterance);
            this.log("  Classifications : ".blue, interpreted.classifications);
            this.log("  Intent : ".blue, interpreted.intent);
            this.log("  Score : ".blue, interpreted.score);
            this.log("  Sentiment : ".blue, interpreted.sentiment);
            this.log("  Entities : ".blue, interpreted.entities);

            this.log(`  Executing Bot logic...`.green);
            // execute bot logic
            let out_sentence = await this.logic.execute(interpreted, this);
            output_sentences = output_sentences.concat(out_sentence);
            this.log(`      Sentence Logic result : ${out_sentence.green}`);
        }

        this.log(`  Total sentences logic result : ${output_sentences.green}`);
        return output_sentences;
    }

    override_variables(sentences = []){
        let new_sentences = []

        for (let sentence of sentences){
            if (!sentence){
                continue;
            }

            // Set variables
            let variables_match = sentence.match(/{{\w*}}/g);

            if (variables_match){
                for (const match of variables_match){
                    let var_name = match.slice(2, match.length -2);
        
                    // get variable on context
                    let var_value = this.context[var_name];
        
                    // Replace on sentence text
                    if (var_value){
                        sentence = sentence.replace(match, var_value);
                    }
                }
            }

            new_sentences.push(sentence);
        }

        return new_sentences;
    }

    async execute(input_text = "" ){
        let input_sentences = [];

        if (typeof(input_text) == typeof('string')){
            // Get message sentences
            input_sentences = extract_sentences(input_text);
        }
        else if (typeof(input_text) == typeof([])){
            input_sentences = input_text;
        }
        else{
            throw new Error("Invalid argument input text must be string or array.".red);
        }

        this.log(`==========================`);
        this.log(`Interpreting sentences : ${input_sentences}`.yellow);
        
        // Interpret each sentence
        // and generate output sentences
        let output_sentences = await this.interpret_sentences(input_sentences);

        this.log("Context : ".blue, this.context);
        this.log(`Generated output : ${output_sentences.toString().green}`);

        if (output_sentences){
            // override variables like {{name}} to John
            output_sentences = this.override_variables(output_sentences);
            return output_sentences;
        }
    }
}