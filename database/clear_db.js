const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../data');


// Try to set up database tables if htye're not set up yet.
db.serialize(() => {
    // db.run("DROP TABLE uploaded_files");
    db.run("DELETE FROM uploaded_files");
    db.run("DELETE FROM sound_files");
    db.run("DELETE FROM payment_record");


    // db.run("DROP TABLE sound_files");
    // db.run("DELETE FROM sound_files (id text, sound_file blob, sequence integer)");



});
db.close(); 