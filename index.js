const { mem } = require('systeminformation');
const express = require('express');
const { readFileSync } = require('fs');
const { Database } = require('sqlite3');
const { sign, verify } = require('jsonwebtoken');

const privateKEY = readFileSync('./private.key', 'utf8');
const publicKEY = readFileSync('./public.key', 'utf8');
const app = express();

// SIGNING OPTIONS
const signOptions = {
    issuer: "SPEC",
    subject: "pcid@spec.cl",
    audience: "http://spec.cl/",
    expiresIn: "30m",
    algorithm: "RS256"
};

/*
 ====================   JWT Verify =====================
*/
const verifyOptions = {
    issuer: "SPEC",
    subject: "pcid@spec.cl",
    audience: "http://spec.cl/",
    expiresIn: "30m",
    algorithm: ["RS256"]
};

// setting the enviromental variables
const SQLITE_PATH_FILE = process.env.SQLITE_PATH_FILE;
const PORT = process.env.PORT;
const APIKEY = process.env.APIKEY;
const MAX_RECORDS = process.env.MEMORY_RECORDS || 100;
const SECONDS_INTERVAL = process.env.SECONDS_INTERVAL || 60;
let defaultMemoryRecords = 10;
const SERVER_NAME = process.env.SERVER_NAME || "Unknown server";

// api hashmap
const apiKeys = new Map();
apiKeys.set(APIKEY, { id: 1, name: 'Api key USER' });

// middleware for checking the apikey
const apiKeyHandler = (req, res, next) => {
    // if (!req.query.apikey || !req.query.token) { res.status(401).send('api key or token do not exist!'); return; }

    if (apiKeys.has(req.query.apikey)) {
        req.authType = "apikey";
        next();
    } else {
        try {
            req.jwtPayload = verify(req.query.token, publicKEY, verifyOptions);
            req.authType = "token";
            next();
        }
        catch (error) {
            res.status(401).send('Forbidden');
        }
    }

}
app.use(apiKeyHandler);

// enable CORS
app.use(cors());

// setting the sqlite and run the service
const db = new Database(SQLITE_PATH_FILE, async (err) => {
    if (err) {
        console.log('Error when creating the database', err)
    } else {
        console.log('Database created!')
        await createTable();
        await createTrigger();
        startRegister();

    }
});

function createTable() {
    return new Promise((res, rej) => {
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
                if (err) { rej(err); }
                else { res(d); }
            });
    });

}
function createTrigger() {
    return new Promise((res, rej) => {
        db.run(`    
            CREATE TRIGGER DataSize AFTER INSERT ON memory
            BEGIN
            delete from memory where 
                id =(select min(id) from memory ) and (select count(*) from memory )=${MAX_RECORDS};
            END`,
            (d, err) => {
                if (err) { rej(err); }
                else { res(d); }
            }
        )
    });
}
function startRegister() {
    setInterval(() => {
        mem()
            .then(data => insertData(data))
            .catch(error => console.error(error));
    }, 1000 * SECONDS_INTERVAL);
}
const insertData = (info) => {
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
function jsonFormat(d) {
    return {
        date: d.date,
        memory: {
            total: d.total,
            free: d.free,
            used: d.used,
            active: d.active,
            available: d.available,
            buffcache: d.buffcache,
        },
        swap: {
            total: d.swaptotal,
            used: d.swapused,
            free: d.swapfree
        }
    }
}

const payload = { server: SERVER_NAME };

app.get('/login', function (req, res) {
    if (req.authType !== 'apikey') { res.send('loggin forbidden'); }
    res.send(sign({ ...payload, from: 'Local server testing ..' }, privateKEY, signOptions));
});
app.get('/is-logged', function (req, res) {
    res.json({ payload: req.jwtPayload, authType: req.authType, hola: "oliasflksajdfl" });
});
app.get('/memory', function (req, res) {
    mem()
        .then(data => res.json(jsonFormat(data)))
        .catch(error => console.error(error));
});
app.get('/memory-history', function (req, res) {

    if (!isNaN(Number(req.query.limit))) { defaultMemoryRecords = Number(req.query.limit); }

    db.all(`SELECT * FROM memory ORDER BY id DESC LIMIT ${defaultMemoryRecords}`, (err, rows) => {
        if (err) { res.send(err); return; }
        res.json(rows.map(m => jsonFormat(m)));
    });
});
app.listen(PORT, () => {
    console.log(`MemoryApp listening on port ${PORT}!`);
});
