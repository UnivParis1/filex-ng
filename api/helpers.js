const fs = require('fs')
const dns = require('dns')
const util = require('util')

exports.fs_stat = util.promisify(fs.stat)
exports.fs_unlink = util.promisify(fs.unlink)
exports.fs_readFile = util.promisify(fs.readFile)
exports.dns_reverse = util.promisify(dns.reverse)

exports.minutes_to_ms = (minutes) => minutes * 60 * 1000

exports.now = () => new Date()

exports.addDays = function (date, days) {
    var r = new Date(date);
    r.setTime(r.getTime() + days * 60 * 60 * 24 * 1000);
    return r;
}

exports.format_date = (date) => (
    date.toLocaleString('fr-FR', { hour12: false })
)

exports.un_formatBytes = (formatted) => {
    const suffixes = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }
    const m = ("" + formatted).match(/^([\d.]+)\s*([KMG])i?[BO]?$/i)
    if (!m) throw "invalid formatted bytes " + formatted
    return parseFloat(m[1]) * suffixes[m[2]]
}

// from stackoverflow. complex but it works
exports.formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Octet';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// similar to lodash.keyBy, but also remove the key from each object
// optional "valueKey" parameter
exports.keyBy = (l, key, valueKey) => {
    let r = {}
    for (const o of l) {
        const k = o[key]
        if (valueKey) {
            r[k] = o[valueKey]
        } else {
            delete o[key]
            r[k] = o;
        }
    }
    return r
}


// from https://github.com/Abazhenov/express-async-handler
exports.express_async = (fn) => (
    (req, res, next) => (
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error("ERROR", err)
            // try to send the error if possible
            try { res.send(err) } catch (_) {}
        })
    )
)

exports.promise_WriteStream_pipe = (req, writeStream) => (
    new Promise((resolve, reject) => {
        let ok = false
        req.on('end', () => ok = true)
        writeStream.on('close', async () => {
            console.log('writeStream close event')
            if (ok) resolve()
        })
        req.on('aborted', () => console.error("aborted")) // handled by 'close' event
        req.on('error', () => console.error("error")) // handled by 'close' event
        req.on('close', async () => {
            console.log("error occurred, req close")
            writeStream.close(); // need to be done to avoid leaks
            reject()
        })
        req.pipe(writeStream)   
    })
)

// do not call pipe before readStream is "ready" (to allow handling initial readStream errors)
exports.promise_ReadStream_pipe = (readStream, prepare_response) => (
    new Promise((resolve, reject) => {
        readStream.on('error', reject)
        readStream.on('end', resolve)
        readStream.on('ready', function () {
            const response = prepare_response()
            const close_input = err => { readStream.close(); reject(err || "unknown error") } // if client aborted/timeout...
            response.on('close', close_input) // should be enough
            response.on('error', close_input) // adding more just in case /o\
            response.on('finish', close_input) // adding more just in case /o\
            readStream.pipe(response)
        })
    })
)

