const fs = require('fs')
const dns = require('dns')
const util = require('util')

exports.fs_stat = util.promisify(fs.stat)
exports.dns_reverse = util.promisify(dns.reverse)

exports.addDays = function (date, days) {
    var r = new Date(date);
    r.setTime(r.getTime() + days * 60 * 60 * 24 * 1000);
    return r;
}

exports.format_date = (date) => (
    date.toLocaleString('fr-FR', { hour12: false })
)

exports.formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Octet';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// from https://github.com/Abazhenov/express-async-handler
exports.express_async = (fn) => (
    (req, res, next) => (
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error(err)
            res.send(err)
        })
    )
)

// do not call pipe before readStream is "ready" (to allow handling initial readStream errors)
exports.promise_ReadStream_pipe = (readStream, prepare_response) => (
    new Promise((resolve, reject) => {
        readStream.on('error', reject)
        readStream.on('end', resolve)
        readStream.on('ready', function () {
            const response = prepare_response()
            const close_input = _ => readStream.close() // if client aborted/timeout...
            response.on('close', close_input) // should be enough
            response.on('error', close_input) // adding more just in case /o\
            response.on('finish', close_input) // adding more just in case /o\
            readStream.pipe(response)
        })
    })
)

