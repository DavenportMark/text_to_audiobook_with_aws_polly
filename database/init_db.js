const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../data');


// Try to set up database tables if htye're not set up yet.
db.serialize(() => {
  //   db.run("DROP TABLE uploaded_files");
 //    db.run("DROP TABLE payment_record");

    

//    db.run("DROP TABLE sound_files");
   db.run("CREATE TABLE sound_files (id text, sound_file blob, sequence integer)");

  db.run("CREATE TABLE uploaded_files (id text, file blob, extension text, voice_target text , converted_audio_url	text, created_at integer, last_updated integer, free integer)");

    db.run("CREATE TABLE payment_record (cookie text, remaining_payed integer, total_ever_paid integer)");

});
db.close();
