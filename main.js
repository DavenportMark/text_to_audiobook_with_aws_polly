const fs = require('fs');
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');
const AWS = require('aws-sdk');
const sqlite3 = require('sqlite3').verbose();
const md5 = require('md5');
const db = new sqlite3.Database('data');
const _ = require('lodash');
const { resolve } = require('path');

const app = express();

app.use(fileUpload({
    createParentPath: true
}));

//add other middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(morgan('dev'));

const cookieParser = require('cookie-parser');
app.use(cookieParser());

app.use(function (req, res, next) {
    let cookie = req.cookies.i;
    // no: set a new cookie
    if (cookie === undefined) {
      let randomNumber=Math.random().toString();
      randomNumber=randomNumber.substring(2,randomNumber.length);
      res.cookie('i',randomNumber, { maxAge: 900000, httpOnly: true });
      console.log('cookie created successfully');
    }
    next();
});

const port = 3000;

app.listen(port, () => 
  console.log(`App is listening on port ${port}.`)
);

app.get('/',(req,res)=> {
    res.sendFile('home.html',{root:path.join(__dirname,'public')})
});

app.post('/free_file_convert', async (req, res) => {
    try {
        if(!req.files) {

		console.log('free_file_convert requierd files are missing');
            res.sendFile('home.html',{root:path.join(__dirname,'public')})
        } else {
            const db = new sqlite3.Database('data');
            let avatar = req.files.avatar;
            let hash = md5(avatar.data + (Math.random() * 10000));
            let cookie = req.cookies.i;
            // let voice = req.body.voice;
		//
		//
	
		if(avatar.mimetype == 'application/epub+zip'){
			// Yeah write this to a file, and do the command that converts it.
			// Then try to overwrite avatar.data with it.
       		     	let url =  __dirname + path.sep + 'free_tmp' + path.sep + hash + '.txt';
			let file_location_epub = __dirname + path.sep + 'conver_epubs' + path.sep + hash + '.epub';

			await avatar.mv(file_location_epub);
			await convertEpubToText(file_location_epub, url);
      		      	await saveFile(hash, avatar, 'default', 1);
            
           		res.redirect('/downloading?download=' + hash);            

		} else if (avatar.mimetype == 'text/plain') {
			
		    let url =  __dirname + path.sep + 'free_tmp' + path.sep + hash + '.txt';
		    await avatar.mv(url);
		    await saveFile(hash, avatar, 'default', 1);
		    
		    res.redirect('/downloading?download=' + hash);            

		} else {
			res.write('error');
		   res.redirect('/');
		}
	}
    } catch (err) {
        console.log('err');
        console.log(err);
        res.status(500).send(err);
    }
});

app.post('/file_convert', async (req, res) => {

    try {
        if(!req.files) {
            res.send({
                status: false,
                message: 'No file uploaded'
            });

            res.sendFile('home.html',{root:path.join(__dirname,'public')})
        } else {
            let avatar = req.files.avatar;
            let voice = req.body.voice;
            let cookie = req.cookies.i;

            let hash = md5(avatar.data + (Math.random() * 10000));

	
	if(avatar.mimetype == 'application/epub+zip'){
		let url =  __dirname + path.sep + 'paid_tmp' + path.sep + hash + '.txt';
		let file_location_epub = __dirname + path.sep + 'conver_epubs' + path.sep + hash + '.epub';

		await avatar.mv(file_location_epub);
		await convertEpubToText(file_location_epub, url);
		avatar.data = fs.readFileSync(url);
	}


            await saveFile(hash, avatar, voice, 0);

            let payment_record = await dbQuery(db, `SELECT * FROM payment_record where cookie = "${cookie}" LIMIT 1`);
            let remaining_payed = payment_record[0].remaining_payed - 1;

            await updatePaymentRecord(remaining_payed, payment_record[0].total_ever_paid);

            res.redirect('/downloading?download=' + hash);
            
        }
    } catch (err) {
        console.log('err');
        console.log(err);
        res.status(500).send(err);
    }
});

app.get('/downloading', (req, res) => {
    res.sendFile('complete.html',{root:path.join(__dirname,'public')});
});

app.get('/get_download_link', async (req, res) => {

    let download_id = req.query.download;
    let query = `SELECT * FROM uploaded_files where id = "${download_id}" LIMIT 1`;
    let record = await dbQuery(db, query);
    
    if(record[0]['free'] == 1){
        // let text = record[0]['file'].toString();
        // let chunks = sliceUpLargeString(text);
        // for (let i = 0; i < chunks.length; i++) {
        await espeakSync(download_id);
        // }    
        let url = path.sep + 'download' + path.sep + download_id + '.wav';
        res.json({
            "success": true,
            "url": url
        });

    } else {

        let voice_target = record[0]['voice_target'];
        let cookie = req.cookies.i;
        let payment_record = await dbQuery(db, `SELECT * FROM payment_record where cookie = "${cookie}" LIMIT 1`);
        console.log('huh weird');
        console.log(payment_record.length);
        if(payment_record.length == undefined || payment_record.length == 0){
            console.log('No payment record somehow.');
            res.json({
                'success': false,
                'url' : "/"
            });
            return;
        }
        
        let text = record[0]['file'].toString();
        // let chunks = sliceUpLargeString(text);
        let uri = '';
        // for (let i = 0; i < chunks.length; i++) {
            // let err = await userAwsPollySync(download_id, chunks[i], voice_target); Version 1
    	let task_id = await startPollyTask(text, voice_target); // Version 2, much faster, and fixes studder
            
    for(let i = 0; i < 100; i++){
	uri = await taskIdFinished(task_id);
	if(uri !== false){
	    break;
	}
    	await waitFive();
    }
        res.json({
            "success": true,
            "url": uri
        });
    }



});


app.get('/download/:name', function(req, res){
    const file = path.join(__dirname, "download") + path.sep + req.params.name;
    res.download(file);
});

app.get('/asset/:name', function(req, res){
    const file = path.join(__dirname, "asset") + path.sep + req.params.name;
    res.sendFile(file);
});

app.get('/cleanup_files', function(req,res){


	let folders_to_get_rid = ['free_tmp', 'conver_epubs', 'paid_tmp', 'download'];
	//let folders_to_get_rid = ['free_tmp', 'conver_epubs'];
	folders_to_get_rid.forEach( (e) => {
		console.log(e);
		handle_cleanup(e);
	});
		

	function handle_cleanup(directory_name){
	
		let free_tmp = __dirname + '/' + directory_name;
		let files_inside_free_t = fs.readdirSync(free_tmp);
		
		console.log(files_inside_free_t);
	
		for (let i = 0; i < files_inside_free_t.length; i++ ){
			let considered_file = __dirname + '/' + directory_name + '/' + files_inside_free_t[i];
			fs.stat(considered_file, (err, stats) => {
				console.log(err);
				console.log(stats.birthtime);

				console.log(Date.parse(stats.birthtime));

				let file_made_time = Date.parse(stats.birthtime);
				let now = Date.now();
				let diff = now - file_made_time;
				let seconds = diff / 1000;
				console.log('seconds old ' + seconds);


				let seconds_in_day = 86400;
				seconds_in_day = 2;
				if(seconds > seconds_in_day){
					// delete this one
					try {
						let body = fs.readFileSync(considered_file, 'utf-8');
						let key_name = files_inside_free_t[i];
						uploadToS3(key_name, body, files_inside_free_t[i]);
					//	fs.unlinkSync(considered_file);
					} catch (err) {
						console.log(err);
					}
				}
			});
		}


	}

	// findRemoveSync(__dirname + '/uploads', {age: {seconds: 3600}});
	res.json({
		"success":true
	});
});

function dbQuery(db, query){
    return new Promise(resolve => {
        db.all(query, function(err,rows){
            if(err) {
                console.log(err);
            }
            resolve(rows);
        });
    });
}

function sliceUpLargeString(text){
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

    complete.push(grouping);

    return complete;
}

async function espeakSync(download_id){
    return new Promise((resolve) => {
            nix(download_id);
            resolve();
        }
    );
}

async function userAwsPollySync(id, text_to_convert, voice_target){
    return new Promise(resolve => {

        if(text_to_convert == null){
            console.log("TEXT IS EMPTY SOMEHOW?");
            return;
        }

        const Polly = new AWS.Polly({
            signatureVersion: 'v4',
            region: 'us-east-1'
        })


        console.log('voice_target');
        console.log(voice_target);

        let params = {
            'Text': text_to_convert,
            'OutputFormat': 'mp3',
            'VoiceId': voice_target,
            'Engine' : 'standard'
            // 'VoiceId': 'Kimberly',
            // 'VoiceId': 'Joey',
        }

        Polly.synthesizeSpeech(params, (err, data) => {
            try {
                if (err) {
                    console.log('Something with AWS Polly not working');
                    console.log(err);
                    throw new Error('Synthesize speech is no good!');
                }
            } catch(e) {
                console.log('Caught synthesize speech err');
                console.log(e);
                resolve(true);
            }

            if (data.AudioStream instanceof Buffer) {
                let url = path.sep + 'download' + path.sep + id + '.mp3';
                let filename = __dirname + url;
                try {
                    if (!fs.existsSync(filename)) {
                        fs.writeFileSync(filename, data.AudioStream);
                    } else {
                        fs.appendFileSync(filename, data.AudioStream);
                    }
                } catch (err) {
                    console.log(err);
                }
                resolve(false);
            }
        
        });
        
    });
}



async function saveFile(hash, avatar, voice, free){
    const db = new sqlite3.Database('data');
    
    
    return new Promise(resolve => {
        db.serialize(() => {
            let query = "INSERT INTO uploaded_files (id, file, extension, voice_target, free) VALUES (?,?,?,?,?)";
            const stmt = db.prepare(query);
            stmt.run([hash, avatar.data, avatar.mimetype, voice, free]);
            stmt.finalize();

            resolve();
        });
    });
}

async function createPaymentRecord(cookie, remaining_payed, total_ever_paid){
    const db = new sqlite3.Database('data');
    db.serialize(() => {
        let query = `INSERT INTO payment_record (cookie, remaining_payed, total_ever_paid) VALUES (?, ?, ?)`;
        const stmt = db.prepare(query);
        stmt.run([cookie, remaining_payed, total_ever_paid]);
        stmt.finalize();

        resolve();
    });
}


async function updatePaymentRecord(cookie, remaining_payed, total_ever_paid) {
    const db = new sqlite3.Database('data');
    db.serialize(() => {
        let query = "UPDATE payment_record SET remaining_payed = ?, total_ever_paid = ? where cookie = ?";
        const stmt = db.prepare(query);
        stmt.run([remaining_payed, total_ever_paid, cookie]);
        stmt.finalize();

        resolve();
    });
}

function nix(download_id){
        let cmd = require('node-cmd');
        const espeak_directory = "/usr/bin/espeak";
        const save_file = __dirname + path.sep + 'download' + path.sep + download_id + '.wav';
        const read_file = __dirname + path.sep + 'free_tmp' + path.sep + download_id + '.txt';
        const complete_espeak_command = `${espeak_directory} -f ${read_file} -w ${save_file}`;
        cmd.runSync(complete_espeak_command);
}

function win(download_id){
    const cmd=require('node-cmd');
    const espeak_directory = "C:\\eSpeak\\command_line\\espeak.exe";
    const save_file = __dirname + path.sep + 'download' + path.sep + download_id + '.wav';
    const read_file = __dirname + path.sep + 'free_tmp' + path.sep + download_id + '.txt';
    const complete_espeak_command = `${espeak_directory} -f ${read_file} -w ${save_file}`;
    const syncDir=cmd.runSync(complete_espeak_command);

    // console.log(`
    //     Sync Err ${syncDir.err}
    //     Sync stderr:  ${syncDir.stderr}
    //     Sync Data ${syncDir.data}
    // `);
}

async function convertEpubToText(source, target){

    return new Promise(resolve => {
	let exec = require('child_process').exec;



	exec(`ebook-convert ${source} ${target}`, function callback(error, stdout, stderr) {
		        console.log(stdout);
		        console.log(error);
		        console.log(stderr);
		resolve();
	});

    });
}


function uploadToS3(key_name, body, name){
	var AWS = require('aws-sdk');
	var uuid = require('uuid');
	var bucketName = 'easybooktoaudiobookbackups';
	console.log('bucket name');
	console.log(bucketName);
	var keyName = key_name;
	console.log(key_name);
	var bucketPromise = new AWS.S3({apiVersion: '2006-03-01'}).createBucket({Bucket: bucketName}).promise();
	bucketPromise.then(
		function(data) {
			var objectParams = {Bucket: bucketName, Key: keyName, Body: body};
			var uploadPromise = new AWS.S3({apiVersion: '2006-03-01'}).putObject(objectParams).promise();
			uploadPromise.then(
				function(data) {
					console.log("Successfully uploaded data to " + bucketName + "/" + keyName);
				});
		}).catch(
		function(err) {
			console.error(err, err.stack);
	});
}


async function waitFive(){
    return new Promise(resolve => {
        setTimeout(
            (e)=>{
                resolve();
            }, 
        5000)
    })
}


async function startPollyTask(large_text, voice_target){
    const Polly = new AWS.Polly({
        signatureVersion: 'v4',
        region: 'us-east-1'
    })

    return new Promise(resolve => {

        let params = {
            OutputFormat: 'mp3', // json | mp3 | ogg_vorbis | pcm, /* required */
            OutputS3BucketName: 'easyepubtoaudiobookdownloads', /* required */
            Text: large_text, /* required */
            VoiceId: voice_target, // Aditi | Amy | Astrid | Bianca | Brian | Camila | Carla | Carmen | Celine | Chantal | Conchita | Cristiano | Dora | Emma | Enrique | Ewa | Filiz | Gabrielle | Geraint | Giorgio | Gwyneth | Hans | Ines | Ivy | Jacek | Jan | Joanna | Joey | Justin | Karl | Kendra | Kevin | Kimberly | Lea | Liv | Lotte | Lucia | Lupe | Mads | Maja | Marlene | Mathieu | Matthew | Maxim | Mia | Miguel | Mizuki | Naja | Nicole | Olivia | Penelope | Raveena | Ricardo | Ruben | Russell | Salli | Seoyeon | Takumi | Tatyana | Vicki | Vitoria | Zeina | Zhiyu | Aria | Ayanda | Arlet | Hannah | Arthur | Daniel | Liam | Pedro | Kajal, /* required */
            Engine: 'standard', // standard | neural,
            LanguageCode: 'en-US', // arb | cmn-CN | cy-GB | da-DK | de-DE | en-AU | en-GB | en-GB-WLS | en-IN | en-US | es-ES | es-MX | es-US | fr-CA | fr-FR | is-IS | it-IT | ja-JP | hi-IN | ko-KR | nb-NO | nl-NL | pl-PL | pt-BR | pt-PT | ro-RO | ru-RU | sv-SE | tr-TR | en-NZ | en-ZA | ca-ES | de-AT,
            OutputS3KeyPrefix: 'someprefix',
            TextType: 'text' // ssml | text
        };
        
        Polly.startSpeechSynthesisTask(params, function(err, data){
            if(err) {
                console.log(err);
            } else {
                // console.log(data);
                resolve(data['SynthesisTask']['TaskId']);
            
            }
        });
    

    });
    

}

async function taskIdFinished(task_id){
    console.log("Trying task id finished");
    return new Promise(resolve => {
        find_it(task_id)
        .then((e) => {
            if(e == false) {
                console.log("can't finish");
            }
            console.log(e);
            resolve(e);
        });
    });
}

function find_it(task_id){
    const Polly = new AWS.Polly({
        signatureVersion: 'v4',
        region: 'us-east-1'
    })
    console.log('find it');
    return new Promise(resolve => {
        let params = {
            MaxResults: 100,
            // NextToken: 'next token?', // only if it's truncated then we get a next token
            // Status: 'completed' // scheduled | inProgress | completed | failed
        };
        Polly.listSpeechSynthesisTasks(params, function(err, data){
            if (err) {
                console.log('Error');
                console.log(err, err.stack); // an error occurred
                resolve(false);
            } else {
                // console.log(data);           // successful response
                for(let i = 0; i < data['SynthesisTasks'].length; i++){
                    if(data['SynthesisTasks'][i]['TaskId'] == task_id){
                        // console.log(data[i]['OutputUri']);
                        // console.log(data[i]['TaskStatus']);
                        // console.log(data[i]['TaskId']);
                        if(data['SynthesisTasks'][i]['TaskStatus']  == 'completed'){
                            resolve(data['SynthesisTasks'][i]['OutputUri']);
                        }
                    }
                }

                resolve(false);
        
            }
        })
    });

}

async function waitFive(){
    return new Promise(resolve => {
        setTimeout(
            (e)=>{
                resolve();
            }, 
        5000)
    })
}

function startPollyTask(large_text){
    return new Promise(resolve => {

        let params = {
            OutputFormat: 'mp3', // json | mp3 | ogg_vorbis | pcm, /* required */
            OutputS3BucketName: 'easyepubtoaudiobookdownloads', /* required */
            OutputS3KeyPrefix: 'someprefix',
            Text: large_text, /* required */
            VoiceId: 'Matthew', // Aditi | Amy | Astrid | Bianca | Brian | Camila | Carla | Carmen | Celine | Chantal | Conchita | Cristiano | Dora | Emma | Enrique | Ewa | Filiz | Gabrielle | Geraint | Giorgio | Gwyneth | Hans | Ines | Ivy | Jacek | Jan | Joanna | Joey | Justin | Karl | Kendra | Kevin | Kimberly | Lea | Liv | Lotte | Lucia | Lupe | Mads | Maja | Marlene | Mathieu | Matthew | Maxim | Mia | Miguel | Mizuki | Naja | Nicole | Olivia | Penelope | Raveena | Ricardo | Ruben | Russell | Salli | Seoyeon | Takumi | Tatyana | Vicki | Vitoria | Zeina | Zhiyu | Aria | Ayanda | Arlet | Hannah | Arthur | Daniel | Liam | Pedro | Kajal, /* required */
            Engine: 'standard', // standard | neural,
            LanguageCode: 'en-US', // arb | cmn-CN | cy-GB | da-DK | de-DE | en-AU | en-GB | en-GB-WLS | en-IN | en-US | es-ES | es-MX | es-US | fr-CA | fr-FR | is-IS | it-IT | ja-JP | hi-IN | ko-KR | nb-NO | nl-NL | pl-PL | pt-BR | pt-PT | ro-RO | ru-RU | sv-SE | tr-TR | en-NZ | en-ZA | ca-ES | de-AT,
            TextType: 'text' // ssml | text
        };
        
        Polly.startSpeechSynthesisTask(params, function(err, data){
            if(err) {
                console.log(err);
            } else {
                // console.log(data);
                resolve(data['SynthesisTask']['TaskId']);
            
            }
        });
    

    });
    

}

async function taskIdFinished(task_id){
    console.log("Trying task id finished");
    return new Promise(resolve => {
        let params = {
            TaskId: task_id /* required */
          };
          Polly.getSpeechSynthesisTask(params, function(err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
            }
            else {
                console.log(data.SynthesisTask.TaskStatus);           // successful response
            
                if(data.SynthesisTask.TaskStatus == 'failed'){
                    console.log("Ah crap, failed task for ");
                    console.log(task_id);
                    resolve("error")
                }

                if(data.SynthesisTask.TaskStatus == 'completed'){
                    console.log("Trying to ddoo completed, resolve!");
                    console.log(data.SynthesisTask.OutputUri);
                    resolve(data.SynthesisTask.OutputUri);
                } else {
                    resolve("wait");
                }
                
            }    
          });
    });
}
function sliceUpExtraLargeString(text){
       
	let collections = [];
	let words = text.split(" ")
	let grouping = "";
	let billable_characters = 0;
	for (let i = 0; i < words.length; i++) {
		let word = words[i]
		billable_characters = billable_characters + word.length;
        if (billable_characters > 80000) {
			collections.push(grouping);
			billable_characters = word.length;
			grouping = "";
		}

		grouping = grouping + " " + word

	}
	collections.push(grouping);
    return collections;
}