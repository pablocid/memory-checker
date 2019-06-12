const si = require('systeminformation');
var express = require('express');
var app = express();
const sqlite3 = require('sqlite3');
const dbpath = "./mydb.sqlite3";
const apiKeys = new Map();
let defaultMemoryRecords = 100;

apiKeys.set('jbspbNJd3FICaiyMR8VckzylDdiONllc', {
    id: 1,
    name: 'Pablo',
});

apiKeys.set('nPL2k5JaOOjvZkmaBbW5ZF5qZBTrKdOJ', {
    id: 2,
    name: 'Fernando'
});

// middleware for checking the apikey
app.use((req, res, next) => {
    console.log(req.query);
    if (!apiKeys.has(req.query.apikey)) {
        res.status(401).send('Unknown api key');
        return;
    } {
        next();
    }
});

let db = new sqlite3.Database(dbpath, (err) => {
    if (err) {
        console.log('Error when creating the database', err)
    } else {
        console.log('Database created!')
        createTable();
    }
});

function createTable() {
    db.run(`
    
    CREATE TABLE IF NOT EXISTS memory(
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        date TEXT,
        total INT,
        free INT,
        used INT,
        active INT,
        available INT,
        buffcache INT,
        swaptotal INT,
        swapused INT,
        swapfree INT
    )    
    `
        , (d, err) => {
            // console.log(d);
            // console.error(err);
            db.run(`    
            CREATE TRIGGER DataSize AFTER INSERT ON memory
            BEGIN
              delete from memory where 
                id =(select min(id) from memory ) and (select count(*) from memory )=1001;
            END`, (de, error) => {
                    startRegister();
                }
            )
        });
}

const insertData = (info) => {
    console.log("Inserting data");
    db.run(`
    INSERT INTO memory (date, total, free, used, active, available, buffcache, swaptotal, swapused, swapfree) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
            new Date().toISOString(),
            info.total,
            info.free,
            info.used,
            info.active,
            info.available,
            info.buffcache,
            info.swaptotal,
            info.swapused,
            info.swapfree,
        ]);
}

function startRegister() {
    setInterval(() => {
        si.mem()
            .then(data => insertData(data))
            .catch(error => console.error(error));
    }, 1000 * 3);
}

app.get('/memory', function (req, res) {
    si.mem()
        .then(data => res.json(data))
        .catch(error => console.error(error));
});

app.get('/memory-history', function (req, res) {

    if (!isNaN(Number(req.query.limit))) { defaultMemoryRecords = Number(req.query.limit); }

    db.all(`SELECT * FROM memory ORDER BY id DESC LIMIT ${defaultMemoryRecords}`, function (err, rows) {
        if(err){ res.send(err); return;}
        res.json(rows);
    });
});

app.listen(3000, function () {
    console.log('MemoryApp listening on port 3000!');
});
