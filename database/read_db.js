const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../data');

// db.all('SELECT * FROM uploaded_files', function(err,rows){
//     if(err) {
//         console.log(err);
//     }
//     console.log(rows);
// });

db.all('SELECT * FROM sound_files', function(err,rows){
    if(err) {
        console.log(err);
    }
    console.log(rows);
});


db.close();