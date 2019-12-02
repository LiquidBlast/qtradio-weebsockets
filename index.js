/* eslint-disable require-await */
// Import larg for development
let larg;
try { larg = require('larg'); }
catch (ex) { larg = undefined; }

// Import config before modules so socket.io works
const config = require('./config.json');

// Import modules
const io     = require('socket.io').listen(config.port); 
const wump   = require('wumpfetch');
const pikmin = require('pikmin');

// Var shit
let connected = 0;
let data      = { artist: null, title: null };
let analytics = true;

// Logging setup and functions
const logger = new pikmin.instance({
    name: 'main',
    format: `${pikmin.colors.bgYellowBright(process.pid)} [${pikmin.colors.magenta('%h:%m:%s')}] <=> `,
    autogen: false,
    transports: [
        new pikmin.ConsoleTransport({ name: 'info', process: process, format: `${pikmin.colors.bgYellowBright(process.pid)} [${pikmin.colors.cyan('%l')} | ${pikmin.colors.magenta('%h:%m:%s')}] [] <=> ` }),
        new pikmin.ConsoleTransport({ name: 'log', process: process, format: `${pikmin.colors.bgYellowBright(process.pid)} [${pikmin.colors.magenta('%l | %h:%m:%s')}] <=> ` }),
        new pikmin.ConsoleTransport({ name: 'error', process: process, format: `${pikmin.colors.bgYellowBright(process.pid)} [${pikmin.colors.red('%l')} | ${pikmin.colors.magenta('%h:%m:%s')}] [${pikmin.colors.red('%l')}] <=> ` })
    ]
});

const argv = larg ? larg(process.argv.slice(2)) : undefined;
const formatDate = (d = new Date()) => {
    return {
        hours: d.getHours() <= 9 ? `0${d.getHours()}` : d.getHours(),
        minutes: d.getMinutes() <= 9 ? `0${d.getMinutes()}` : d.getMinutes(),
        seconds: d.getSeconds() <= 9 ? `0${d.getSeconds()}` : d.getSeconds(),
        milliseconds: d.getMilliseconds(),
  
        days: d.getDate() <= 9 ? `0${d.getDate()}` : d.getDate(),
        years: d.getFullYear(),
        months: d.getMonth() +1 <= 9 ? `0${d.getMonth() +1}` : d.getMonth() +1
    };
};

// Check if dev is enabled
if (argv && (argv.d || argv.dev || argv.development)) {
    const date = formatDate();        
    logger.addTransport(new pikmin.FileTransport({ file: `tmp/log/${date.days}-${date.months}-${date.years}.log` }));
    analytics = false;
    logger.log('[Dev] Developer mode enabled!');
} else logger.addTransport(new pikmin.WebhookTransport({ url: `https://discordapp.com/api/webhooks/${config.webhooks.id}/${config.webhooks.token}?wait=true` }));

// Funky shit to do at first, I don't like this but it exists anyway
const start = async () => {
    let res  = await wump('https://qtradio.moe/stats').send();
        res  = res.json();
    let _data = res ? res.icestats.source[0] : res.icestats.source;
    data['artist'] = _data.artist;
    data['title']  = _data.title;
    io.emit('songUpdate', data);
};

start();

// Run this every time a user connects 
io.on('connection', async (socket) => {
    logger.log('[Socket] Client connected!');

    // Online users stuff
    connected++;
    logger.log(`[Socket] Sending "userUpdate" on client connection (Online users - ${connected})`);
    socket.emit('userUpdate', connected);

    // Song Update stuff
    let res  = await wump('https://qtradio.moe/stats').send();
    res      = res.json();
    let data = res ? res.icestats.source[0] : res.icestats.source;
    logger.log(`[Socket] Sending "songUpdate" on client connection (${data.artist} - ${data.title})`);
    data['artist'] = data.artist;
    data['title']  = data.title;
    socket.emit('songUpdate', data);

    // Update song if needed
    setInterval(async () => {
        let res  = await wump('https://qtradio.moe/stats').send();
            res  = res.json();
        let newData = res ? res.icestats.source[0] : res.icestats.source;
        if (data.artist !== newData.artist && data.title !== newData.title) {
            logger.log(`[Socket] Sending "songUpdate" on song change (${newData.artist} - ${newData.title})`);
            data['artist'] = newData.artist;
            data['title']  = newData.title;
            socket.emit('songUpdate', data);
        }
    }, 5000);

    // Analytics stuff
    if (analytics) {
        let resu = await wump(`https://api.ipdata.co/${socket.handshake.address.slice(7)}?api-key=${config.ipdata}`).send();
        resu = resu.json(); 
        logger.log(`[Analytics] User ${socket.handshake.address.slice(7)} has connected! (Located in ${resu.city}, ${resu.region}, ${resu.country_name})`);
    } else logger.log('[Dev] Analytics disabled due to developer mode being on.');

    socket.on('playing', async () => {
        let startTime = new Date.now();
        if (analytics) logger.log(`[Analytics] ${socket.handshake.address.slice(7)} started listening to music!`);
        socket.on('stopped', async () => {
            let stopTime = new Date.now();
            if (analytics) logger.log(`[Analytics] ${socket.handshake.address.slice(7)} stopped listening to music! (Session length: ${startTime - stopTime})`);
        });
    });

    // Run this every time a user disconnects, used for our good friend userUpdate
    socket.on('disconnect', async () => {
        logger.log('[Socket] Client disconnected!');

        // Online users stuff
        connected--;
        logger.log(`[Socket] Sending "userUpdate" on client disconnection (Online users - ${connected})`);
        socket.emit('userUpdate', connected);

        // Analytics stuff
        if (analytics) {
          let res  = await wump(`https://api.ipdata.co/${socket.handshake.address.slice(7)}?api-key=${config.ipdata}`).send();
              res  = res.json(); 
          logger.log(`[Analytics] User ${socket.handshake.address.slice(7)} has disconnected! (Located in ${res.city}, ${res.region}, ${res.country_name})`);
        } else logger.log('[Dev] Analytics disabled due to developer mode being on.');
    });
});
