this.rejects = require('assert');
this.AWS = require('aws-sdk');
this.fs = require('fs');


class converter {
    constructor() {
        console.log("Text to sound working aok");
    }

    run(file){
        try {
            const text = fs.readFileSync(file, 'utf8');
            // We want to do 1500 characters at a time
            let sliced_text = sliceUpLargeString(text);
            let i = 0;
            runloop = async () => {
        
                for(s of sliced_text) {
                    // await new Promise( resolve => {setTimeout( resolve, 1000)});
                    let success = await userAwsPolly(s, i);
                    i = i + 1;
                    console.log(s, "\n");
                }
            }
            runloop();
        } catch (err) {
          console.error(err);
        }
    }

    sliceUpLargeString(text){
        let complete = [];
        let words = text.split(' ');
        let grouping = '';
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            grouping = grouping + ' ' + word;
            if(i % 50 == 0){
                complete.push(grouping);
                grouping = '';
            }
        }
        return complete;
    }
    
    userAwsPolly(sliced_text, i){
    
        let text_to_convert = sliced_text;
    
        return new Promise(resolve => {
            // Create an Polly client
            const Polly = new AWS.Polly({
                signatureVersion: 'v4',
                region: 'us-east-1'
            })
    
            let params = {
                'Text': text_to_convert,
                'OutputFormat': 'mp3',
                'VoiceId': 'Kimberly'
            }
    
            Polly.synthesizeSpeech(params, (err, data) => {
                if (err) {
                    console.log(err.code)
                } else if (data) {
                    if (data.AudioStream instanceof Buffer) {
                        fs.writeFile("./" + i + ".mp3", data.AudioStream, function(err) {
                            if (err) {
                                return console.log(err)
                            }
                            console.log("The file was saved!")
                            resolve();
    
                        })
                    }
                }
            })
        });
    }

}
module.exports = new converter();